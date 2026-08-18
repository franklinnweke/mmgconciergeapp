import { createHash, randomUUID } from 'node:crypto';

import {
  BookingCommandError,
  renterCancelBookingCommandSchema,
  renterCancelBookingResultSchema,
  type RenterCancelBookingCommand,
  type RenterCancelBookingResult,
} from '@mmg/contracts';
import {
  calculateCancellationRefund,
  canTransitionPaidBooking,
} from '@mmg/domain';

import type {
  BookingNotificationOutbox,
  BookingRepository,
} from './booking-repository.js';

export type RenterCancelBookingDependencies = {
  repository: BookingRepository;
  now?: () => Date;
  createId?: () => string;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function renterCancelBooking(
  untrustedCommand: unknown,
  authenticatedRenterId: string,
  dependencies: RenterCancelBookingDependencies,
): Promise<RenterCancelBookingResult> {
  if (!authenticatedRenterId) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to manage your journeys.');
  }

  const parsed = renterCancelBookingCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Cancel booking command is invalid.');
  }

  const command: RenterCancelBookingCommand = parsed.data;
  const now = (dependencies.now ?? (() => new Date()))();
  const createId = dependencies.createId ?? randomUUID;
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocId = stableHash({ renterId: authenticatedRenterId, idempotencyKey: command.idempotencyKey });

  return dependencies.repository.runTransaction(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new BookingCommandError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }
      return renterCancelBookingResultSchema.parse(replay.result);
    }

    const booking = await transaction.getBooking(command.data.bookingId);
    if (!booking) {
      throw new BookingCommandError('NOT_FOUND', 'Booking was not found.');
    }

    if (booking.renterId !== authenticatedRenterId) {
      throw new BookingCommandError('FORBIDDEN', 'You do not own this booking reservation.');
    }

    if (booking.version !== command.data.expectedVersion) {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        `Stale version conflict. Current version is ${booking.version}, expected ${command.data.expectedVersion}.`,
        { reason: 'stale_version' },
      );
    }

    const targetState = 'cancelled';
    if (!canTransitionPaidBooking(booking.state, targetState)) {
      throw new BookingCommandError(
        'INVALID_STATE_TRANSITION',
        `Cannot cancel booking from current state: ${booking.state}`,
      );
    }

    const refundCalc = calculateCancellationRefund({
      priceSnapshot: booking.priceSnapshot,
      startDate: booking.startDate,
      cancelledAt: now,
      cancelledBy: 'renter',
    });

    const fromState = booking.state;
    booking.state = targetState;
    booking.version += 1;
    booking.updatedAt = now;

    transaction.updateBooking(booking);

    // Release the booked hold on vehicle
    transaction.releaseHeldBlock(booking.intentId);
    transaction.writeAvailabilitySentinel(booking.vehicleId, now);

    transaction.createAuditEvent({
      actorId: authenticatedRenterId,
      actorType: 'renter',
      entityId: booking.bookingId,
      entityType: 'booking',
      eventType: 'booking.cancelled_by_renter',
      fromState,
      toState: targetState,
      requestId,
      occurredAt: now,
      details: {
        reason: command.data.reason,
        refundKobo: refundCalc.refundKobo,
        penaltyKobo: refundCalc.penaltyKobo,
        policyTier: refundCalc.policyTier,
      },
    });

    // Notify owner
    const outboxRecord: BookingNotificationOutbox = {
      notificationId: createId(),
      recipientId: booking.ownerId,
      recipientRole: 'owner',
      template: 'booking_cancelled_by_renter',
      channel: 'push',
      data: {
        bookingId: booking.bookingId,
        vehicleName: booking.vehicleSnapshot.displayName,
        startDate: booking.startDate,
        endDate: booking.endDate,
      },
      createdAt: now,
      status: 'pending',
    };
    transaction.createNotificationOutbox(outboxRecord);

    const response: RenterCancelBookingResult = {
      requestId,
      result: {
        bookingId: booking.bookingId,
        state: targetState,
        refundKobo: refundCalc.refundKobo,
        penaltyKobo: refundCalc.penaltyKobo,
        policyTier: refundCalc.policyTier,
        version: booking.version,
        updatedAt: now.toISOString(),
      },
    };

    transaction.saveIdempotency(idempotencyDocId, requestHash, response, now);
    return response;
  });
}
