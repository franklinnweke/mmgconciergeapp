import { createHash, randomUUID } from 'node:crypto';

import {
  BookingCommandError,
  type RenterVisibleBooking,
} from '@mmg/contracts';
import { evaluateOwnerResponseSla } from '@mmg/domain';

import type {
  BookingNotificationOutbox,
  BookingRepository,
  StoredBookingRecord,
} from './booking-repository.js';

export type ProcessPaidBookingInput = {
  intentId: string;
  paymentReference: string;
  amountKobo: number;
  paymentEnvironment?: 'test' | 'live';
  paidAtIso?: string;
};

export type ProcessPaidBookingDependencies = {
  repository: BookingRepository;
  now?: () => Date;
  createId?: () => string;
  createRequestId?: () => string;
  ownerSlaHours?: number;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function processPaidBookingEvent(
  input: ProcessPaidBookingInput,
  dependencies: ProcessPaidBookingDependencies,
): Promise<StoredBookingRecord> {
  const now = (dependencies.now ?? (() => new Date()))();
  const createId = dependencies.createId ?? randomUUID;
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const slaHours = dependencies.ownerSlaHours ?? 2;

  const paidAt = input.paidAtIso ? new Date(input.paidAtIso) : now;
  const bookingId = createId();
  const paymentEnvironment = input.paymentEnvironment ?? 'test';

  return dependencies.repository.runTransaction(async (transaction) => {
    const intent = await transaction.getIntent(input.intentId);
    if (!intent) {
      throw new BookingCommandError('NOT_FOUND', 'Booking intent was not found.');
    }

    if (intent.state === 'paid') {
      throw new BookingCommandError(
        'ALREADY_EXISTS',
        'This booking intent has already been processed into a paid booking.',
      );
    }

    if (intent.state !== 'intent_created' && intent.state !== 'checkout_pending') {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        `Booking intent cannot be paid in current state: ${intent.state}`,
      );
    }

    if (intent.expiresAt.getTime() <= now.getTime()) {
      intent.state = 'paid_conflict';
      intent.updatedAt = now;
      transaction.updateIntent(intent);

      transaction.createAuditEvent({
        actorId: 'system',
        actorType: 'system',
        entityId: intent.intentId,
        entityType: 'bookingIntent',
        eventType: 'booking_intent.expired_hold_paid_conflict',
        fromState: 'intent_created',
        toState: 'paid_conflict',
        requestId,
        occurredAt: now,
        details: {
          paymentReference: input.paymentReference,
          amountKobo: input.amountKobo,
          paymentEnvironment,
        },
      });

      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        'Checkout hold has expired. Payment recorded as conflict for concierge intervention.',
        { reason: 'expired' },
      );
    }

    if (input.amountKobo !== intent.priceSnapshot.renterTotalKobo) {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        `Paid amount (${input.amountKobo} kobo) does not match required total (${intent.priceSnapshot.renterTotalKobo} kobo).`,
      );
    }

    // 1. Transition intent to paid
    intent.state = 'paid';
    intent.updatedAt = now;
    transaction.updateIntent(intent);

    // 2. Create authoritative BookingRecord
    const bookingRecord: StoredBookingRecord = {
      bookingId,
      intentId: intent.intentId,
      renterId: intent.renterId,
      ownerId: intent.ownerId,
      vehicleId: intent.vehicleId,
      startDate: intent.startDate,
      endDate: intent.endDate,
      state: 'paid_pending_owner',
      version: 1,
      priceSnapshot: intent.priceSnapshot,
      vehicleSnapshot: intent.vehicleSnapshot,
      paymentReference: input.paymentReference,
      paidAmountKobo: input.amountKobo,
      paymentEnvironment,
      paidAt,
      createdAt: now,
      updatedAt: now,
    };

    transaction.createBooking(bookingRecord);

    // 3. Promote availability block from held to booked
    transaction.updateHeldBlockToBooked(intent.intentId, bookingId, now);

    // 4. Create Audit Event
    transaction.createAuditEvent({
      actorId: intent.renterId,
      actorType: 'renter',
      entityId: bookingId,
      entityType: 'booking',
      eventType: 'booking.paid',
      fromState: null,
      toState: 'paid_pending_owner',
      requestId,
      occurredAt: now,
      details: {
        intentId: intent.intentId,
        paymentReference: input.paymentReference,
        amountKobo: input.amountKobo,
        paymentEnvironment,
      },
    });

    // 5. Create Owner Notification Outbox Record
    const sla = evaluateOwnerResponseSla(paidAt, slaHours, now);
    const outboxRecord: BookingNotificationOutbox = {
      notificationId: createId(),
      recipientId: intent.ownerId,
      recipientRole: 'owner',
      template: 'owner_booking_request_received',
      channel: 'push',
      data: {
        bookingId,
        vehicleName: intent.vehicleSnapshot.displayName,
        startDate: intent.startDate,
        endDate: intent.endDate,
        slaExpiresAt: sla.expiresAt.toISOString(),
      },
      createdAt: now,
      status: 'pending',
    };
    transaction.createNotificationOutbox(outboxRecord);

    return bookingRecord;
  });
}
