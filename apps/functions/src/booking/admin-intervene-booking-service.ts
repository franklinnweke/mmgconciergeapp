import { createHash, randomUUID } from 'node:crypto';

import {
  BookingCommandError,
  adminInterveneBookingCommandSchema,
  adminInterveneBookingResultSchema,
  type AdminInterveneBookingCommand,
  type AdminInterveneBookingResult,
  type PaidBookingState,
} from '@mmg/contracts';
import { canTransitionPaidBooking, intervalsOverlap } from '@mmg/domain';

import type {
  BookingNotificationOutbox,
  BookingRepository,
} from './booking-repository.js';
import { isActiveBlockingInterval } from './create-booking-intent-service.js';

export type AdminInterveneBookingDependencies = {
  repository: BookingRepository;
  now?: () => Date;
  createId?: () => string;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function adminInterveneBooking(
  untrustedCommand: unknown,
  authenticatedStaffId: string,
  dependencies: AdminInterveneBookingDependencies,
): Promise<AdminInterveneBookingResult> {
  if (!authenticatedStaffId) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Staff authentication required for operations intervention.');
  }

  const parsed = adminInterveneBookingCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Admin intervention command is invalid.');
  }

  const command: AdminInterveneBookingCommand = parsed.data;
  const now = (dependencies.now ?? (() => new Date()))();
  const createId = dependencies.createId ?? randomUUID;
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocId = stableHash({ staffId: authenticatedStaffId, idempotencyKey: command.idempotencyKey });

  return dependencies.repository.runTransaction(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new BookingCommandError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }
      return adminInterveneBookingResultSchema.parse(replay.result);
    }

    const booking = await transaction.getBooking(command.data.bookingId);
    if (!booking) {
      throw new BookingCommandError('NOT_FOUND', 'Booking was not found.');
    }

    if (booking.version !== command.data.expectedVersion) {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        `Stale version conflict. Current version is ${booking.version}, expected ${command.data.expectedVersion}.`,
        { reason: 'stale_version' },
      );
    }

    const fromState = booking.state;
    let targetState: PaidBookingState = booking.state;
    let reassignedVehicleId: string | undefined;

    if (command.data.action === 'reassign_vehicle') {
      if (!command.data.targetVehicleId) {
        throw new BookingCommandError('INVALID_ARGUMENT', 'Target vehicle ID is required for reassignment.');
      }
      if (command.data.targetVehicleId === booking.vehicleId) {
        throw new BookingCommandError('INVALID_ARGUMENT', 'Cannot reassign to the same vehicle.');
      }

      const targetVehicle = await transaction.getVehicle(command.data.targetVehicleId);
      if (!targetVehicle || !targetVehicle.active) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          'Target vehicle is unavailable or not currently discoverable/approved.',
        );
      }

      // Check availability on target vehicle
      await transaction.readAvailabilitySentinel(command.data.targetVehicleId);
      const targetBlocks = await transaction.listBlockingIntervals(
        command.data.targetVehicleId,
        booking.endDate,
      );

      const candidateInterval = { startDate: booking.startDate, endDate: booking.endDate };
      for (const block of targetBlocks) {
        if (!isActiveBlockingInterval(block, now)) continue;
        if (intervalsOverlap(candidateInterval, block)) {
          throw new BookingCommandError(
            'FAILED_PRECONDITION',
            'Target reassignment vehicle is not available for requested dates.',
            { reason: 'availability_conflict' },
          );
        }
      }

      // Release old vehicle hold
      transaction.releaseHeldBlock(booking.intentId);
      transaction.writeAvailabilitySentinel(booking.vehicleId, now);

      // Create booked block on new vehicle
      transaction.createAvailabilityBlock({
        blockId: createId(),
        vehicleId: command.data.targetVehicleId,
        ownerId: targetVehicle.ownerId,
        startDate: booking.startDate,
        endDate: booking.endDate,
        type: 'booked',
        referenceId: booking.bookingId,
        notes: `Reassigned from vehicle ${booking.vehicleId} by admin`,
        createdAt: now,
        updatedAt: now,
      });
      transaction.writeAvailabilitySentinel(command.data.targetVehicleId, now);

      // Update booking
      booking.reassignedFromVehicleId = booking.vehicleId;
      booking.vehicleId = command.data.targetVehicleId;
      booking.ownerId = targetVehicle.ownerId;
      booking.vehicleSnapshot = targetVehicle.vehicleSnapshot;
      targetState = 'confirmed';
      booking.state = targetState;
      reassignedVehicleId = command.data.targetVehicleId;
    } else if (command.data.action === 'force_cancel') {
      targetState = 'cancelled';
      booking.state = targetState;
      transaction.releaseHeldBlock(booking.intentId);
      transaction.writeAvailabilitySentinel(booking.vehicleId, now);
    } else if (command.data.action === 'manual_override') {
      // Keep state or confirm
      targetState = 'confirmed';
      booking.state = targetState;
    }

    booking.version += 1;
    booking.updatedAt = now;
    booking.adminNotes = command.data.adminNotes;

    transaction.updateBooking(booking);

    transaction.createAuditEvent({
      actorId: authenticatedStaffId,
      actorType: 'admin',
      entityId: booking.bookingId,
      entityType: 'booking',
      eventType: `booking.admin_intervened_${command.data.action}`,
      fromState,
      toState: targetState,
      requestId,
      occurredAt: now,
      details: {
        action: command.data.action,
        adminNotes: command.data.adminNotes,
        targetVehicleId: command.data.targetVehicleId,
      },
    });

    const response: AdminInterveneBookingResult = {
      requestId,
      result: {
        bookingId: booking.bookingId,
        action: command.data.action,
        state: targetState,
        reassignedVehicleId,
        version: booking.version,
        updatedAt: now.toISOString(),
      },
    };

    transaction.saveIdempotency(idempotencyDocId, requestHash, response, now);
    return response;
  });
}
