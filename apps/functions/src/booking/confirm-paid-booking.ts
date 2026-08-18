import { createHash, randomUUID } from 'node:crypto';

import {
  BookingCommandError,
  type OwnerConfirmBookingResult,
  type PaidBookingState,
} from '@mmg/contracts';
import { canTransitionPaidBooking } from '@mmg/domain';

import type {
  BookingNotificationOutbox,
  BookingRepository,
} from './booking-repository.js';

export type BookingActor = {
  id: string;
  type: 'owner' | 'admin';
};

export type ConfirmPaidBookingCommandData = {
  bookingId: string;
  expectedVersion: number;
  chauffeurNotes?: string;
  adminNotes?: string;
};

export type ConfirmPaidBookingCommand = {
  schemaVersion: number;
  idempotencyKey: string;
  data: ConfirmPaidBookingCommandData;
};

export type ConfirmPaidBookingDependencies = {
  repository: BookingRepository;
  now?: () => Date;
  createId?: () => string;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function confirmPaidBooking(
  command: ConfirmPaidBookingCommand,
  actor: BookingActor,
  dependencies: ConfirmPaidBookingDependencies,
): Promise<OwnerConfirmBookingResult> {
  if (!actor.id) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to confirm booking requests.');
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
      return replay.result as OwnerConfirmBookingResult;
    }

    const booking = await transaction.getBooking(command.data.bookingId);
    if (!booking) {
      throw new BookingCommandError('NOT_FOUND', 'Booking was not found.');
    }

    if (actor.type === 'owner' && booking.ownerId !== actor.id) {
      throw new BookingCommandError('FORBIDDEN', 'You do not have permission to confirm this booking.');
    }

    if (booking.version !== command.data.expectedVersion) {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        `Stale version conflict. Current version is ${booking.version}, expected ${command.data.expectedVersion}.`,
        { reason: 'stale_version' },
      );
    }

    if (!canTransitionPaidBooking(booking.state, 'confirmed')) {
      throw new BookingCommandError(
        'INVALID_STATE_TRANSITION',
        `Cannot confirm booking from current state: ${booking.state}`,
      );
    }

    const fromState = booking.state;
    booking.state = 'confirmed';
    booking.version += 1;
    booking.updatedAt = now;
    if (command.data.chauffeurNotes) {
      booking.chauffeurNotes = command.data.chauffeurNotes;
    }
    if (command.data.adminNotes) {
      booking.adminNotes = command.data.adminNotes;
    }

    transaction.updateBooking(booking);

    transaction.createAuditEvent({
      actorId: actor.id,
      actorType: actor.type,
      entityId: booking.bookingId,
      entityType: 'booking',
      eventType: actor.type === 'admin' ? 'booking.staff_confirmed' : 'booking.confirmed',
      fromState,
      toState: 'confirmed',
      requestId,
      occurredAt: now,
      details: {
        chauffeurNotes: command.data.chauffeurNotes,
        adminNotes: command.data.adminNotes,
      },
    });

    // Notify renter of confirmation
    const outboxRecord: BookingNotificationOutbox = {
      notificationId: createId(),
      recipientId: booking.renterId,
      recipientRole: 'renter',
      template: 'booking_confirmed_by_owner',
      channel: 'push',
      data: {
        bookingId: booking.bookingId,
        vehicleId: booking.vehicleId,
        startDate: booking.startDate,
        endDate: booking.endDate,
        confirmedBy: actor.type,
      },
      createdAt: now,
      status: 'pending',
    };
    transaction.createNotificationOutbox(outboxRecord);

    const result: OwnerConfirmBookingResult = {
      requestId,
      result: {
        bookingId: booking.bookingId,
        state: 'confirmed',
        version: booking.version,
        updatedAt: booking.updatedAt.toISOString(),
      },
    };

    transaction.saveIdempotency(idempotencyDocId, requestHash, result, now);
    return result;
  });
}
