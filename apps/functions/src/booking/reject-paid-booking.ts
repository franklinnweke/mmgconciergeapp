import { createHash, randomUUID } from 'node:crypto';

import {
  BookingCommandError,
  type OwnerRejectBookingResult,
  type OwnerRejectReason,
  type PaidBookingState,
} from '@mmg/contracts';
import { canTransitionPaidBooking } from '@mmg/domain';

import type {
  BookingNotificationOutbox,
  BookingRepository,
  StoredAvailabilityBlock,
} from './booking-repository.js';
import type { BookingActor } from './confirm-paid-booking.js';

export type RejectPaidBookingCommandData = {
  bookingId: string;
  expectedVersion: number;
  reason: OwnerRejectReason;
  details?: string;
  adminNotes?: string;
};

export type RejectPaidBookingCommand = {
  schemaVersion: number;
  idempotencyKey: string;
  data: RejectPaidBookingCommandData;
};

export type RejectPaidBookingDependencies = {
  repository: BookingRepository;
  now?: () => Date;
  createId?: () => string;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function rejectPaidBooking(
  command: RejectPaidBookingCommand,
  actor: BookingActor,
  dependencies: RejectPaidBookingDependencies,
): Promise<OwnerRejectBookingResult> {
  if (!actor.id) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to respond to booking requests.');
  }

  const now = (dependencies.now ?? (() => new Date()))();
  const createId = dependencies.createId ?? randomUUID;
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocId = stableHash({
    actorId: actor.id,
    actorType: actor.type,
    idempotencyKey: command.idempotencyKey,
  });

  return dependencies.repository.runTransaction(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new BookingCommandError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }
      return replay.result as OwnerRejectBookingResult;
    }

    const booking = await transaction.getBooking(command.data.bookingId);
    if (!booking) {
      throw new BookingCommandError('NOT_FOUND', 'Booking was not found.');
    }

    if (actor.type === 'owner' && booking.ownerId !== actor.id) {
      throw new BookingCommandError('FORBIDDEN', 'You do not have permission to reject this booking.');
    }

    if (booking.version !== command.data.expectedVersion) {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        `Stale version conflict. Current version is ${booking.version}, expected ${command.data.expectedVersion}.`,
        { reason: 'stale_version' },
      );
    }

    if (!canTransitionPaidBooking(booking.state, 'intervention_required')) {
      throw new BookingCommandError(
        'INVALID_STATE_TRANSITION',
        `Cannot reject booking from current state: ${booking.state}`,
      );
    }

    const fromState = booking.state;
    booking.state = 'intervention_required';
    booking.version += 1;
    booking.updatedAt = now;
    booking.ownerRejectionReason = command.data.reason;
    if (command.data.details) {
      booking.ownerRejectionDetails = command.data.details;
    }
    if (command.data.adminNotes) {
      booking.adminNotes = command.data.adminNotes;
    }

    transaction.updateBooking(booking);

    // Release the booked hold on vehicle
    transaction.releaseHeldBlock(booking.intentId);

    // If rejection was due to vehicle maintenance, create an owner availability block
    if (command.data.reason === 'vehicle_maintenance') {
      const maintenanceBlock: StoredAvailabilityBlock = {
        blockId: createId(),
        vehicleId: booking.vehicleId,
        ownerId: booking.ownerId,
        startDate: booking.startDate,
        endDate: booking.endDate,
        type: 'owner_block',
        reason: 'maintenance',
        notes: command.data.details ?? 'Automatic block from booking decline for maintenance',
        createdAt: now,
        updatedAt: now,
      };
      transaction.createAvailabilityBlock(maintenanceBlock);
    }

    const refundAmountKobo = booking.priceSnapshot.renterTotalKobo;

    transaction.createAuditEvent({
      actorId: actor.id,
      actorType: actor.type,
      entityId: booking.bookingId,
      entityType: 'booking',
      eventType: actor.type === 'admin' ? 'booking.staff_declined' : 'booking.owner_declined',
      fromState,
      toState: 'intervention_required',
      requestId,
      occurredAt: now,
      details: {
        reason: command.data.reason,
        details: command.data.details,
        adminNotes: command.data.adminNotes,
        refundAmountKobo,
      },
    });

    // Notify operations / renter of intervention requirement
    const outboxRecord: BookingNotificationOutbox = {
      notificationId: createId(),
      recipientId: booking.renterId,
      recipientRole: 'renter',
      template: 'booking_declined_intervention_pending',
      channel: 'push',
      data: {
        bookingId: booking.bookingId,
        reason: command.data.reason,
        details: command.data.details,
        declinedBy: actor.type,
      },
      createdAt: now,
      status: 'pending',
    };
    transaction.createNotificationOutbox(outboxRecord);

    const result: OwnerRejectBookingResult = {
      requestId,
      result: {
        bookingId: booking.bookingId,
        state: 'intervention_required',
        version: booking.version,
        updatedAt: booking.updatedAt.toISOString(),
      },
    };

    transaction.saveIdempotency(idempotencyDocId, requestHash, result, now);
    return result;
  });
}
