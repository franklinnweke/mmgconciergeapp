import {
  dateOnlySchema,
  priceSnapshotSchema,
  renterVehicleSnapshotSchema,
} from '@mmg/contracts';
import {
  paymentEnvironmentSchema,
  paymentReferenceSchema,
  trustedPaymentValueDeliveryResultSchema,
  type TrustedPaymentValueDeliveryResult,
} from '@mmg/contracts/payment';
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type Firestore,
} from 'firebase-admin/firestore';
import { z } from 'zod';

import { FirestoreOwnerEarningsRepository } from '../earnings/firestore-owner-earnings-repository.js';
import { BookingCommandError } from './errors.js';
import type {
  VerifiedPaymentValueRepository,
  VerifiedPaymentValueIds,
} from './verified-payment-value-service.js';

const valueOutcomeSchema = z.enum(['confirmed', 'paid_pending_owner', 'paid_conflict']);

const verifiedEventSchema = z.object({
  eventId: z.string().min(1).max(128),
  reference: paymentReferenceSchema,
  status: z.literal('verified_success'),
  providerStatus: z.literal('success'),
  paymentId: z.string().min(1).max(128),
  intentId: z.string().min(1).max(128),
  valueDeliveryOutcome: valueOutcomeSchema.optional(),
  valueDeliveryBookingId: z.string().min(1).max(128).optional(),
  valueDeliveryCaseId: z.string().min(1).max(128).optional(),
  valueDeliveryRequestId: z.string().min(1).max(128).optional(),
}).passthrough();

const paymentSchema = z.object({
  paymentId: z.string().min(1).max(128),
  intentId: z.string().min(1).max(128),
  renterId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  rentalRequestId: z.string().min(1).max(128).optional(),
  provider: z.literal('paystack'),
  reference: paymentReferenceSchema,
  state: z.enum(['pending', 'succeeded']),
  environment: paymentEnvironmentSchema,
  currency: z.literal('NGN'),
  amountKobo: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  succeededByEventId: z.string().min(1).max(128).optional(),
  valueDeliveryOutcome: valueOutcomeSchema.optional(),
  bookingId: z.string().min(1).max(128).optional(),
  caseId: z.string().min(1).max(128).optional(),
}).passthrough();

const intentSchema = z.object({
  renterId: z.string().min(1).max(128),
  ownerId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  rentalRequestId: z.string().min(1).max(128).optional(),
  state: z.enum(['checkout_pending', 'paid', 'paid_conflict']),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  priceSnapshot: priceSnapshotSchema,
  vehicleSnapshot: renterVehicleSnapshotSchema,
  paymentId: z.string().min(1).max(128),
  paymentReference: paymentReferenceSchema,
}).passthrough();

const rentalRequestSchema = z.object({
  requestId: z.string().min(1).max(128),
  renterId: z.string().min(1).max(128),
  ownerId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  state: z.enum(['requested', 'ready_for_payment', 'declined', 'payment_window_expired', 'confirmed', 'needs_attention']),
  version: z.number().int().positive(),
  intentId: z.string().min(1).max(128).optional(),
  holdExpiresAt: z.instanceof(Timestamp).optional(),
}).passthrough();

const blockSchema = z.object({
  intentId: z.string().min(1).max(128).optional(),
  renterId: z.string().min(1).max(128).optional(),
  ownerId: z.string().min(1).max(128).optional(),
  vehicleId: z.string().min(1).max(128),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  state: z.enum(['held', 'paid', 'confirmed', 'owner_block']),
  expiresAt: z.instanceof(Timestamp).optional(),
}).passthrough().superRefine((block, context) => {
  if (block.state === 'held' && !block.expiresAt) {
    context.addIssue({ code: 'custom', message: 'Held blocks require expiresAt.' });
  }
});

function overlaps(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function isBlockingAt(block: z.infer<typeof blockSchema>, now: Date): boolean {
  if (block.state !== 'held') return true;
  return Boolean(block.expiresAt && block.expiresAt.toMillis() > now.getTime());
}

function replayResultFromPayment(eventId: string, payment: z.infer<typeof paymentSchema>): TrustedPaymentValueDeliveryResult | null {
  if (payment.state !== 'succeeded' || !payment.valueDeliveryOutcome) return null;
  if ((payment.valueDeliveryOutcome === 'confirmed' || payment.valueDeliveryOutcome === 'paid_pending_owner') && payment.bookingId) {
    return trustedPaymentValueDeliveryResultSchema.parse({
      eventId,
      paymentId: payment.paymentId,
      intentId: payment.intentId,
      outcome: payment.valueDeliveryOutcome,
      paymentState: 'succeeded',
      intentState: 'paid',
      bookingId: payment.bookingId,
    });
  }
  if (payment.valueDeliveryOutcome === 'paid_conflict' && payment.caseId) {
    return trustedPaymentValueDeliveryResultSchema.parse({
      eventId,
      paymentId: payment.paymentId,
      intentId: payment.intentId,
      outcome: 'paid_conflict',
      paymentState: 'succeeded',
      intentState: 'paid_conflict',
      caseId: payment.caseId,
    });
  }
  throw new BookingCommandError('FAILED_PRECONDITION', 'Succeeded payment value-delivery metadata is incomplete.');
}

export class FirestoreVerifiedPaymentValueRepository implements VerifiedPaymentValueRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  async consumeVerifiedPayment(input: {
    eventId: string;
    ids: VerifiedPaymentValueIds;
    now: Date;
  }): Promise<TrustedPaymentValueDeliveryResult> {
    return this.firestore.runTransaction(async (transaction) => {
      const eventRef = this.firestore.doc(`paymentEvents/${input.eventId}`);
      const eventSnapshot = await transaction.get(eventRef);
      if (!eventSnapshot.exists) throw new BookingCommandError('NOT_FOUND', 'Verified payment event was not found.');
      const event = verifiedEventSchema.safeParse(eventSnapshot.data());
      if (!event.success) throw new BookingCommandError('FAILED_PRECONDITION', 'Payment event is not eligible for trusted value delivery.');

      const paymentRef = this.firestore.doc(`payments/${event.data.paymentId}`);
      const paymentSnapshot = await transaction.get(paymentRef);
      const payment = paymentSchema.safeParse(paymentSnapshot.data());
      if (!paymentSnapshot.exists || !payment.success) throw new BookingCommandError('FAILED_PRECONDITION', 'Verified payment record is unavailable.');
      if (payment.data.intentId !== event.data.intentId || payment.data.reference !== event.data.reference) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Verified payment event binding is inconsistent.');
      }

      const intentRef = this.firestore.doc(`bookingIntents/${payment.data.intentId}`);
      const intentSnapshot = await transaction.get(intentRef);
      const intent = intentSchema.safeParse(intentSnapshot.data());
      if (!intentSnapshot.exists || !intent.success) throw new BookingCommandError('FAILED_PRECONDITION', 'Booking intent is unavailable for payment delivery.');
      if (
        intent.data.renterId !== payment.data.renterId || intent.data.vehicleId !== payment.data.vehicleId ||
        intent.data.paymentId !== payment.data.paymentId || intent.data.paymentReference !== payment.data.reference ||
        intent.data.priceSnapshot.currency !== payment.data.currency ||
        intent.data.priceSnapshot.renterTotalKobo !== payment.data.amountKobo ||
        payment.data.rentalRequestId !== intent.data.rentalRequestId
      ) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Verified payment does not match the authoritative booking intent.');
      }

      const existingReplay = replayResultFromPayment(input.eventId, payment.data);
      if (existingReplay) {
        const expectedIntentState = existingReplay.outcome === 'paid_conflict' ? 'paid_conflict' : 'paid';
        if (intent.data.state !== expectedIntentState) {
          throw new BookingCommandError('FAILED_PRECONDITION', 'Succeeded payment and booking intent states are inconsistent.');
        }
        if (event.data.valueDeliveryOutcome) {
          if (
            event.data.valueDeliveryOutcome !== existingReplay.outcome ||
            ((existingReplay.outcome === 'confirmed' || existingReplay.outcome === 'paid_pending_owner') &&
              event.data.valueDeliveryBookingId !== existingReplay.bookingId) ||
            (existingReplay.outcome === 'paid_conflict' && event.data.valueDeliveryCaseId !== existingReplay.caseId)
          ) {
            throw new BookingCommandError('FAILED_PRECONDITION', 'Payment event value-delivery metadata is inconsistent.');
          }
          return existingReplay;
        }
        transaction.update(eventRef, {
          valueDeliveryOutcome: existingReplay.outcome,
          ...(existingReplay.outcome === 'paid_conflict'
            ? { valueDeliveryCaseId: existingReplay.caseId }
            : { valueDeliveryBookingId: existingReplay.bookingId }),
          valueDeliveryRequestId: input.ids.requestId,
          valueDeliveredAt: Timestamp.fromDate(input.now), updatedAt: Timestamp.fromDate(input.now),
        });
        return existingReplay;
      }

      if (payment.data.state !== 'pending' || intent.data.state !== 'checkout_pending') {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Payment is not in a state that can deliver booking value.');
      }

      let linkedRequestRef: ReturnType<Firestore['doc']> | null = null;
      let linkedRequest: z.infer<typeof rentalRequestSchema> | null = null;
      if (intent.data.rentalRequestId) {
        linkedRequestRef = this.firestore.doc(`rentalRequests/${intent.data.rentalRequestId}`);
        const requestSnapshot = await transaction.get(linkedRequestRef);
        const parsedRequest = rentalRequestSchema.safeParse(requestSnapshot.data());
        if (!requestSnapshot.exists || !parsedRequest.success ||
          parsedRequest.data.requestId !== intent.data.rentalRequestId ||
          parsedRequest.data.renterId !== intent.data.renterId ||
          parsedRequest.data.ownerId !== intent.data.ownerId ||
          parsedRequest.data.vehicleId !== intent.data.vehicleId ||
          parsedRequest.data.intentId !== intentSnapshot.id) {
          throw new BookingCommandError('FAILED_PRECONDITION', 'Rental request payment binding is inconsistent.');
        }
        linkedRequest = parsedRequest.data;
      }

      const ownBlockRef = this.firestore.doc(`bookingBlocks/${intentSnapshot.id}`);
      const ownBlockSnapshot = await transaction.get(ownBlockRef);
      const ownBlock = ownBlockSnapshot.exists ? blockSchema.safeParse(ownBlockSnapshot.data()) : null;
      if (ownBlock && !ownBlock.success) throw new BookingCommandError('FAILED_PRECONDITION', 'The booking hold data is invalid.');
      if (ownBlock?.success && (
        ownBlock.data.state !== 'held' || ownBlock.data.intentId !== intentSnapshot.id ||
        ownBlock.data.renterId !== intent.data.renterId || ownBlock.data.ownerId !== intent.data.ownerId ||
        ownBlock.data.vehicleId !== intent.data.vehicleId || ownBlock.data.startDate !== intent.data.startDate ||
        ownBlock.data.endDate !== intent.data.endDate
      )) throw new BookingCommandError('FAILED_PRECONDITION', 'The booking hold no longer matches the paid intent.');

      const sentinelRef = this.firestore.doc(`vehicleAvailability/${intent.data.vehicleId}`);
      const sentinelSnapshot = await transaction.get(sentinelRef);
      if (!sentinelSnapshot.exists) throw new BookingCommandError('FAILED_PRECONDITION', 'Availability state is missing. Payment cannot be delivered safely.');
      const rawAvailabilityVersion = sentinelSnapshot.data()?.version;
      if (typeof rawAvailabilityVersion !== 'number' || !Number.isSafeInteger(rawAvailabilityVersion) || rawAvailabilityVersion < 0) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Availability version is invalid.');
      }
      const availabilityVersion = rawAvailabilityVersion;

      const candidateSnapshot = await transaction.get(this.firestore.collection('bookingBlocks')
        .where('vehicleId', '==', intent.data.vehicleId).where('startDate', '<', intent.data.endDate));
      const competingBlocks = candidateSnapshot.docs.filter((document) => {
        if (document.id === intentSnapshot.id) return false;
        const parsed = blockSchema.safeParse(document.data());
        if (!parsed.success) throw new BookingCommandError('FAILED_PRECONDITION', 'Availability data is invalid. Payment cannot be delivered safely.');
        return overlaps(parsed.data.startDate, parsed.data.endDate, intent.data.startDate, intent.data.endDate) && isBlockingAt(parsed.data, input.now);
      });

      const activeOwnHold = ownBlock?.success && ownBlock.data.state === 'held' &&
        ownBlock.data.expiresAt!.toMillis() > input.now.getTime();
      const legacyDatesAvailable = competingBlocks.length === 0;
      const requestFirstCanConfirm = Boolean(linkedRequest && linkedRequest.state === 'ready_for_payment' && activeOwnHold && competingBlocks.length === 0);
      const canDeliverBooking = linkedRequest ? requestFirstCanConfirm : legacyDatesAvailable;

      if (canDeliverBooking) {
        const bookingId = input.ids.bookingId;
        const outcome = linkedRequest ? 'confirmed' as const : 'paid_pending_owner' as const;
        const bookingState = linkedRequest ? 'confirmed' as const : 'paid_pending_owner' as const;
        const blockState = linkedRequest ? 'confirmed' as const : 'paid' as const;
        const result = trustedPaymentValueDeliveryResultSchema.parse({
          eventId: input.eventId, paymentId: payment.data.paymentId, intentId: payment.data.intentId,
          outcome, paymentState: 'succeeded', intentState: 'paid', bookingId,
        });

        const earningRef = this.firestore.doc(`ownerEarnings/${bookingId}`);
        const earningSnapshot = await transaction.get(earningRef);
        const settlementRef = this.firestore.doc(`ownerSettlementState/${intent.data.ownerId}`);
        const settlementSnapshot = await transaction.get(settlementRef);

        if (ownBlockSnapshot.exists) {
          transaction.set(ownBlockRef, {
            intentId: intentSnapshot.id, renterId: intent.data.renterId, ownerId: intent.data.ownerId,
            vehicleId: intent.data.vehicleId, startDate: intent.data.startDate, endDate: intent.data.endDate,
            state: blockState, version: 2, expiresAt: FieldValue.delete(), bookingId,
            updatedAt: Timestamp.fromDate(input.now),
          }, { merge: true });
        } else {
          transaction.create(ownBlockRef, {
            intentId: intentSnapshot.id, renterId: intent.data.renterId, ownerId: intent.data.ownerId,
            vehicleId: intent.data.vehicleId, startDate: intent.data.startDate, endDate: intent.data.endDate,
            state: blockState, version: 1, bookingId, createdAt: Timestamp.fromDate(input.now), updatedAt: Timestamp.fromDate(input.now),
          });
        }
        transaction.create(this.firestore.doc(`bookings/${bookingId}`), {
          bookingId, intentId: intentSnapshot.id,
          ...(intent.data.rentalRequestId ? { rentalRequestId: intent.data.rentalRequestId } : {}),
          renterId: intent.data.renterId, ownerId: intent.data.ownerId, vehicleId: intent.data.vehicleId,
          startDate: intent.data.startDate, endDate: intent.data.endDate, state: bookingState, version: 1,
          blockId: intentSnapshot.id, priceSnapshot: intent.data.priceSnapshot, vehicleSnapshot: intent.data.vehicleSnapshot,
          paymentId: payment.data.paymentId, paymentReference: payment.data.reference,
          createdAt: Timestamp.fromDate(input.now), updatedAt: Timestamp.fromDate(input.now),
          ...(linkedRequest ? { confirmedAt: Timestamp.fromDate(input.now) } : {}),
        });
        if (bookingState === 'confirmed' && typeof intent.data.priceSnapshot?.ownerEarningsKobo === 'number') {
          new FirestoreOwnerEarningsRepository(this.firestore).recordPendingEarningInTransaction(
            transaction,
            {
              bookingId,
              ownerId: intent.data.ownerId,
              vehicleId: intent.data.vehicleId,
              amountKobo: intent.data.priceSnapshot.ownerEarningsKobo,
              startDate: intent.data.startDate,
              endDate: intent.data.endDate,
              vehicleDisplayName: intent.data.vehicleSnapshot.displayName,
              now: input.now,
            },
            {
              earningSnapshot,
              settlementSnapshot,
            },
          );
        }
        transaction.update(paymentRef, {
          state: 'succeeded', succeededAt: Timestamp.fromDate(input.now), succeededByEventId: input.eventId,
          valueDeliveryOutcome: outcome, bookingId, updatedAt: Timestamp.fromDate(input.now),
        });
        transaction.update(intentRef, { state: 'paid', bookingId, paidAt: Timestamp.fromDate(input.now), updatedAt: Timestamp.fromDate(input.now) });
        if (linkedRequestRef && linkedRequest) {
          transaction.update(linkedRequestRef, {
            state: 'confirmed', bookingId, version: linkedRequest.version + 1,
            confirmedAt: Timestamp.fromDate(input.now), updatedAt: Timestamp.fromDate(input.now),
          });
        }
        transaction.set(sentinelRef, { vehicleId: intent.data.vehicleId, version: availabilityVersion + 1, updatedAt: Timestamp.fromDate(input.now) }, { merge: true });
        transaction.create(this.firestore.collection('auditEvents').doc(), {
          actorId: 'system', actorType: 'system', entityId: bookingId, entityType: 'booking',
          eventType: linkedRequest ? 'booking.confirmed_after_request_payment' :
            (activeOwnHold ? 'booking.payment_value_delivered' : 'booking.payment_value_delivered_after_hold_reacquired'),
          fromState: 'checkout_pending', toState: bookingState, requestId: input.ids.requestId,
          occurredAt: Timestamp.fromDate(input.now),
          details: { intentId: intentSnapshot.id, paymentId: payment.data.paymentId, holdReacquired: !activeOwnHold,
            ...(intent.data.rentalRequestId ? { rentalRequestId: intent.data.rentalRequestId } : {}) },
        });
        transaction.create(this.firestore.doc(`notificationOutbox/${input.ids.outboxEventId}`), {
          eventId: input.ids.outboxEventId, eventType: linkedRequest ? 'booking.confirmed' : 'booking.paid_pending_owner',
          bookingId, ownerId: intent.data.ownerId, renterId: intent.data.renterId,
          status: 'unavailable', reason: 'fcm_not_in_current_acceptance_scope', createdAt: Timestamp.fromDate(input.now),
        });
        transaction.update(eventRef, {
          valueDeliveryOutcome: outcome, valueDeliveryBookingId: bookingId,
          valueDeliveryRequestId: input.ids.requestId, valueDeliveredAt: Timestamp.fromDate(input.now), updatedAt: Timestamp.fromDate(input.now),
        });
        return result;
      }

      const caseId = input.ids.caseId;
      const result = trustedPaymentValueDeliveryResultSchema.parse({
        eventId: input.eventId, paymentId: payment.data.paymentId, intentId: payment.data.intentId,
        outcome: 'paid_conflict', paymentState: 'succeeded', intentState: 'paid_conflict', caseId,
      });
      if (ownBlockSnapshot.exists && ownBlock?.success && ownBlock.data.state === 'held') transaction.delete(ownBlockRef);
      transaction.update(paymentRef, {
        state: 'succeeded', succeededAt: Timestamp.fromDate(input.now), succeededByEventId: input.eventId,
        valueDeliveryOutcome: 'paid_conflict', caseId, updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.update(intentRef, { state: 'paid_conflict', caseId, paidAt: Timestamp.fromDate(input.now), updatedAt: Timestamp.fromDate(input.now) });
      if (linkedRequestRef && linkedRequest) {
        transaction.update(linkedRequestRef, {
          state: 'needs_attention', caseId, version: linkedRequest.version + 1, updatedAt: Timestamp.fromDate(input.now),
        });
      }
      transaction.set(sentinelRef, { vehicleId: intent.data.vehicleId, version: availabilityVersion + 1, updatedAt: Timestamp.fromDate(input.now) }, { merge: true });
      transaction.create(this.firestore.doc(`bookingCases/${caseId}`), {
        caseId, intentId: intentSnapshot.id, ...(intent.data.rentalRequestId ? { rentalRequestId: intent.data.rentalRequestId } : {}),
        paymentId: payment.data.paymentId, renterId: intent.data.renterId, ownerId: intent.data.ownerId,
        vehicleId: intent.data.vehicleId, type: 'paid_conflict', status: 'open', priority: 'urgent',
        reasonCode: linkedRequest ? 'request_payment_window_unavailable' : 'late_payment_dates_unavailable',
        openedAt: Timestamp.fromDate(input.now), openedBy: 'system', version: 1,
      });
      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: 'system', actorType: 'system', entityId: caseId, entityType: 'bookingCase',
        eventType: 'booking.paid_conflict_opened', fromState: 'checkout_pending', toState: 'paid_conflict',
        requestId: input.ids.requestId, occurredAt: Timestamp.fromDate(input.now),
        details: { intentId: intentSnapshot.id, paymentId: payment.data.paymentId, competingBlockCount: competingBlocks.length,
          ...(intent.data.rentalRequestId ? { rentalRequestId: intent.data.rentalRequestId } : {}) },
      });
      transaction.create(this.firestore.doc(`notificationOutbox/${input.ids.outboxEventId}`), {
        eventId: input.ids.outboxEventId, eventType: 'booking.paid_conflict', caseId,
        renterId: intent.data.renterId, ownerId: intent.data.ownerId,
        status: 'unavailable', reason: 'fcm_not_in_current_acceptance_scope', createdAt: Timestamp.fromDate(input.now),
      });
      transaction.update(eventRef, {
        valueDeliveryOutcome: 'paid_conflict', valueDeliveryCaseId: caseId,
        valueDeliveryRequestId: input.ids.requestId, valueDeliveredAt: Timestamp.fromDate(input.now), updatedAt: Timestamp.fromDate(input.now),
      });
      return result;
    });
  }
}
