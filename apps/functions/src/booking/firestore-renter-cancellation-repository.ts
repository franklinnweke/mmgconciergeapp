import {
  dateOnlySchema,
  paidBookingStateSchema,
  priceSnapshotSchema,
  renterVehicleSnapshotSchema,
} from '@mmg/contracts';
import {
  cancelBookingResultSchema,
  cancelRentalRequestResultSchema,
  quoteBookingCancellationResultSchema,
  type CancelBookingResult,
  type CancelRentalRequestResult,
  type QuoteBookingCancellationResult,
} from '@mmg/contracts/cancellation';
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { z } from 'zod';

import { BookingCommandError } from './errors.js';
import type {
  CancelPaidBookingInput,
  CancelRentalRequestInput,
  QuoteBookingCancellationInput,
  RenterCancellationRepository,
} from './renter-cancellation-service.js';

const requestSchema = z.object({
  requestId: z.string().min(1).max(128),
  renterId: z.string().min(1).max(128),
  ownerId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  state: z.enum([
    'requested',
    'approved',
    'ready_for_payment',
    'cancelled_by_renter',
    'declined',
    'payment_window_expired',
    'confirmed',
    'needs_attention',
  ]),
  version: z.number().int().positive(),
  intentId: z.string().min(1).max(128).optional(),
  bookingId: z.string().min(1).max(128).optional(),
  holdExpiresAt: z.instanceof(Timestamp).optional(),
  cancellationRequestedAt: z.instanceof(Timestamp).optional(),
}).passthrough();

const intentSchema = z.object({
  renterId: z.string().min(1).max(128),
  ownerId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  rentalRequestId: z.string().min(1).max(128).optional(),
  state: z.enum(['intent_created', 'checkout_pending', 'paid', 'expired', 'failed', 'invalid', 'paid_conflict']),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  bookingId: z.string().min(1).max(128).optional(),
}).passthrough();

const blockSchema = z.object({
  intentId: z.string().min(1).max(128).optional(),
  bookingId: z.string().min(1).max(128).optional(),
  renterId: z.string().min(1).max(128).optional(),
  ownerId: z.string().min(1).max(128).optional(),
  vehicleId: z.string().min(1).max(128),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  state: z.enum(['held', 'paid', 'confirmed', 'owner_block']),
}).passthrough();

const bookingSchema = z.object({
  bookingId: z.string().min(1).max(128),
  intentId: z.string().min(1).max(128),
  rentalRequestId: z.string().min(1).max(128).optional(),
  renterId: z.string().min(1).max(128),
  ownerId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  state: paidBookingStateSchema,
  version: z.number().int().positive(),
  blockId: z.string().min(1).max(128),
  paymentId: z.string().min(1).max(128),
  priceSnapshot: priceSnapshotSchema,
  vehicleSnapshot: renterVehicleSnapshotSchema,
}).passthrough();

const paymentSchema = z.object({
  paymentId: z.string().min(1).max(128),
  state: z.enum(['pending', 'succeeded', 'refund_pending', 'refunded', 'failed', 'abandoned', 'refund_failed']),
}).passthrough();

const pendingCancellationSchema = z.object({
  requestId: z.string().min(1).max(128),
  renterId: z.string().min(1).max(128),
  intentId: z.string().min(1).max(128),
  status: z.enum(['pending_payment_resolution', 'resolved_cancelled', 'refund_pending', 'manual_intervention']),
}).passthrough();

function dateOnlyInLagos(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Africa/Lagos',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function sentinelVersion(snapshot: FirebaseFirestore.DocumentSnapshot): number {
  if (!snapshot.exists) throw new BookingCommandError('FAILED_PRECONDITION', 'Availability state is missing.');
  const value = snapshot.data()?.version;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new BookingCommandError('FAILED_PRECONDITION', 'Availability version is invalid.');
  }
  return value;
}

function exactIntentBlock(
  block: z.infer<typeof blockSchema>,
  intentId: string,
  request: z.infer<typeof requestSchema>,
): boolean {
  return block.intentId === intentId &&
    block.renterId === request.renterId &&
    block.ownerId === request.ownerId &&
    block.vehicleId === request.vehicleId &&
    block.startDate === request.startDate &&
    block.endDate === request.endDate;
}

function exactBookingBlock(
  block: z.infer<typeof blockSchema>,
  booking: z.infer<typeof bookingSchema>,
): boolean {
  return block.bookingId === booking.bookingId &&
    block.intentId === booking.intentId &&
    block.renterId === booking.renterId &&
    block.ownerId === booking.ownerId &&
    block.vehicleId === booking.vehicleId &&
    block.startDate === booking.startDate &&
    block.endDate === booking.endDate &&
    (block.state === 'paid' || block.state === 'confirmed');
}

export class FirestoreRenterCancellationRepository implements RenterCancellationRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  async cancelRentalRequest(input: CancelRentalRequestInput): Promise<CancelRentalRequestResult> {
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const replay = await transaction.get(idempotencyRef);
      if (replay.exists) {
        const stored = replay.data();
        if (stored?.actorId !== input.renterId || stored?.requestHash !== input.requestHash) {
          throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This cancellation key was already used differently.');
        }
        return cancelRentalRequestResultSchema.parse(stored.result);
      }

      const requestRef = this.firestore.doc(`rentalRequests/${input.requestId}`);
      const requestSnapshot = await transaction.get(requestRef);
      const parsedRequest = requestSchema.safeParse(requestSnapshot.data());
      if (!requestSnapshot.exists || !parsedRequest.success) {
        throw new BookingCommandError('NOT_FOUND', 'Rental request was not found.');
      }
      const request = parsedRequest.data;
      if (request.renterId !== input.renterId) {
        throw new BookingCommandError('FORBIDDEN', 'You cannot cancel this rental request.');
      }
      if (request.version !== input.expectedVersion) {
        throw new BookingCommandError('INVALID_STATE_TRANSITION', 'This rental request changed. Refresh before cancelling.');
      }

      if (request.state === 'requested' || request.state === 'approved') {
        const version = request.version + 1;
        const result = cancelRentalRequestResultSchema.parse({
          requestId: request.requestId,
          state: 'cancelled_by_renter',
          version,
          cancelledAt: input.now.toISOString(),
          inventoryReleased: false,
        });
        transaction.update(requestRef, {
          state: 'cancelled_by_renter',
          version,
          cancelledAt: Timestamp.fromDate(input.now),
          updatedAt: Timestamp.fromDate(input.now),
        });
        this.writeRequestCancellationAudit(transaction, request, request.state, 'cancelled_by_renter', input);
        transaction.create(idempotencyRef, {
          actorId: input.renterId,
          commandName: 'cancelRentalRequest',
          requestHash: input.requestHash,
          result,
          createdAt: Timestamp.fromDate(input.now),
        });
        return result;
      }

      if (request.state !== 'ready_for_payment' || !request.intentId) {
        throw new BookingCommandError('INVALID_STATE_TRANSITION', 'This rental request can no longer be cancelled as an unpaid request.', {
          ...(request.bookingId ? { bookingId: request.bookingId } : {}),
        });
      }

      const intentRef = this.firestore.doc(`bookingIntents/${request.intentId}`);
      const intentSnapshot = await transaction.get(intentRef);
      const parsedIntent = intentSchema.safeParse(intentSnapshot.data());
      if (!intentSnapshot.exists || !parsedIntent.success) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Payment-window intent is invalid.');
      }
      const intent = parsedIntent.data;
      if (
        intent.rentalRequestId !== request.requestId ||
        intent.renterId !== request.renterId ||
        intent.ownerId !== request.ownerId ||
        intent.vehicleId !== request.vehicleId ||
        intent.startDate !== request.startDate ||
        intent.endDate !== request.endDate
      ) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Payment-window intent does not match the rental request.');
      }

      if (intent.state === 'checkout_pending') {
        if (request.cancellationRequestedAt) {
          throw new BookingCommandError('INVALID_STATE_TRANSITION', 'Cancellation is already awaiting payment resolution.');
        }
        const version = request.version + 1;
        const result = cancelRentalRequestResultSchema.parse({
          requestId: request.requestId,
          state: 'cancellation_requested',
          version,
          cancellationRequestedAt: input.now.toISOString(),
          inventoryReleased: false,
        });
        transaction.update(requestRef, {
          version,
          cancellationRequestedAt: Timestamp.fromDate(input.now),
          updatedAt: Timestamp.fromDate(input.now),
        });
        transaction.create(this.firestore.doc(`renterCancellations/${request.requestId}`), {
          requestId: request.requestId,
          renterId: request.renterId,
          ownerId: request.ownerId,
          vehicleId: request.vehicleId,
          intentId: request.intentId,
          status: 'pending_payment_resolution',
          createdAt: Timestamp.fromDate(input.now),
          updatedAt: Timestamp.fromDate(input.now),
        });
        this.writeRequestCancellationAudit(transaction, request, 'ready_for_payment', 'cancellation_requested', input);
        transaction.create(idempotencyRef, {
          actorId: input.renterId,
          commandName: 'cancelRentalRequest',
          requestHash: input.requestHash,
          result,
          createdAt: Timestamp.fromDate(input.now),
        });
        return result;
      }

      if (intent.state !== 'intent_created') {
        throw new BookingCommandError('INVALID_STATE_TRANSITION', 'Payment state changed. Refresh before cancelling.', {
          reason: 'payment_state_changed',
          ...(intent.bookingId ? { bookingId: intent.bookingId } : {}),
        });
      }

      const blockRef = this.firestore.doc(`bookingBlocks/${request.intentId}`);
      const blockSnapshot = await transaction.get(blockRef);
      const parsedBlock = blockSchema.safeParse(blockSnapshot.data());
      if (!blockSnapshot.exists || !parsedBlock.success || parsedBlock.data.state !== 'held' ||
        !exactIntentBlock(parsedBlock.data, request.intentId, request)) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'The held dates no longer match this request.');
      }
      const sentinelRef = this.firestore.doc(`vehicleAvailability/${request.vehicleId}`);
      const availabilitySnapshot = await transaction.get(sentinelRef);
      const availabilityVersion = sentinelVersion(availabilitySnapshot);
      const version = request.version + 1;
      const result = cancelRentalRequestResultSchema.parse({
        requestId: request.requestId,
        state: 'cancelled_by_renter',
        version,
        cancelledAt: input.now.toISOString(),
        inventoryReleased: true,
      });

      transaction.delete(blockRef);
      transaction.update(sentinelRef, {
        version: availabilityVersion + 1,
        updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.update(intentRef, {
        state: 'expired',
        cancelledByRenterAt: Timestamp.fromDate(input.now),
        updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.update(requestRef, {
        state: 'cancelled_by_renter',
        version,
        cancelledAt: Timestamp.fromDate(input.now),
        holdExpiresAt: FieldValue.delete(),
        updatedAt: Timestamp.fromDate(input.now),
      });
      this.writeRequestCancellationAudit(transaction, request, 'ready_for_payment', 'cancelled_by_renter', input);
      transaction.create(idempotencyRef, {
        actorId: input.renterId,
        commandName: 'cancelRentalRequest',
        requestHash: input.requestHash,
        result,
        createdAt: Timestamp.fromDate(input.now),
      });
      return result;
    });
  }

  async quoteBookingCancellation(input: QuoteBookingCancellationInput): Promise<QuoteBookingCancellationResult> {
    const snapshot = await this.firestore.doc(`bookings/${input.bookingId}`).get();
    const parsed = bookingSchema.safeParse(snapshot.data());
    if (!snapshot.exists || !parsed.success) throw new BookingCommandError('NOT_FOUND', 'Booking was not found.');
    const booking = parsed.data;
    if (booking.renterId !== input.renterId) throw new BookingCommandError('FORBIDDEN', 'You cannot cancel this booking.');

    const futureJourney = booking.startDate > dateOnlyInLagos(input.now);
    const cancellableState = booking.state === 'confirmed' || booking.state === 'paid_pending_owner';
    const selfServiceAllowed = futureJourney && cancellableState;
    const cancellationPolicyVersion = booking.priceSnapshot.cancellationPolicyVersion;
    return quoteBookingCancellationResultSchema.parse({
      quote: {
        bookingId: booking.bookingId,
        bookingState: booking.state,
        startDate: booking.startDate,
        amountPaidKobo: booking.priceSnapshot.renterTotalKobo,
        currency: 'NGN',
        cancellationPolicyVersion,
        financialOutcome: 'manual_review_required',
        estimatedRefundKobo: null,
        estimatedCancellationFeeKobo: null,
        selfServiceAllowed,
        inventoryAction: selfServiceAllowed ? 'release_on_confirmation' : 'manual_review',
        consequenceText: selfServiceAllowed
          ? `Payment has already been captured. Cancelling releases the future reservation and sends the refund amount for manual review under policy ${cancellationPolicyVersion}; no refund amount is promised until that review is completed.`
          : 'This booking is too close to, already in, or outside the self-service cancellation stage. Concierge must review the operational and refund consequences before inventory changes.',
      },
    });
  }

  async cancelPaidBooking(input: CancelPaidBookingInput): Promise<CancelBookingResult> {
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const replay = await transaction.get(idempotencyRef);
      if (replay.exists) {
        const stored = replay.data();
        if (stored?.actorId !== input.renterId || stored?.requestHash !== input.requestHash) {
          throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This cancellation key was already used differently.');
        }
        return cancelBookingResultSchema.parse(stored.result);
      }

      const bookingRef = this.firestore.doc(`bookings/${input.bookingId}`);
      const bookingSnapshot = await transaction.get(bookingRef);
      const parsedBooking = bookingSchema.safeParse(bookingSnapshot.data());
      if (!bookingSnapshot.exists || !parsedBooking.success) throw new BookingCommandError('NOT_FOUND', 'Booking was not found.');
      const booking = parsedBooking.data;
      if (booking.renterId !== input.renterId) throw new BookingCommandError('FORBIDDEN', 'You cannot cancel this booking.');
      if (booking.version !== input.expectedVersion) throw new BookingCommandError('INVALID_STATE_TRANSITION', 'This booking changed. Refresh before cancelling.');
      if (booking.state !== 'confirmed' && booking.state !== 'paid_pending_owner') {
        throw new BookingCommandError('INVALID_STATE_TRANSITION', 'This booking requires concierge review before cancellation.');
      }
      if (booking.startDate <= dateOnlyInLagos(input.now)) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Same-day or started journeys require concierge review before cancellation.', {
          reason: 'journey_started_or_same_day',
        });
      }

      const blockRef = this.firestore.doc(`bookingBlocks/${booking.blockId}`);
      const blockSnapshot = await transaction.get(blockRef);
      const parsedBlock = blockSchema.safeParse(blockSnapshot.data());
      if (!blockSnapshot.exists || !parsedBlock.success || !exactBookingBlock(parsedBlock.data, booking)) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Booking inventory does not match the paid booking.');
      }
      const sentinelRef = this.firestore.doc(`vehicleAvailability/${booking.vehicleId}`);
      const availabilitySnapshot = await transaction.get(sentinelRef);
      const availabilityVersion = sentinelVersion(availabilitySnapshot);
      const paymentRef = this.firestore.doc(`payments/${booking.paymentId}`);
      const paymentSnapshot = await transaction.get(paymentRef);
      const parsedPayment = paymentSchema.safeParse(paymentSnapshot.data());
      if (!paymentSnapshot.exists || !parsedPayment.success || parsedPayment.data.paymentId !== booking.paymentId || parsedPayment.data.state !== 'succeeded') {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Paid booking payment state is not safe for cancellation.');
      }

      const version = booking.version + 1;
      const cancellationPolicyVersion = booking.priceSnapshot.cancellationPolicyVersion;
      const result = cancelBookingResultSchema.parse({
        requestId: input.commandRequestId,
        result: {
          bookingId: booking.bookingId,
          state: 'refund_pending',
          version,
          caseId: input.caseId,
          cancelledAt: input.now.toISOString(),
          cancellationPolicyVersion,
          amountPaidKobo: booking.priceSnapshot.renterTotalKobo,
          financialOutcome: 'manual_review_required',
          inventoryReleased: true,
        },
      });

      transaction.delete(blockRef);
      transaction.update(sentinelRef, {
        version: availabilityVersion + 1,
        updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.update(bookingRef, {
        state: 'refund_pending',
        version,
        cancellationRequestedAt: Timestamp.fromDate(input.now),
        cancelledAt: Timestamp.fromDate(input.now),
        cancellationCaseId: input.caseId,
        financialOutcome: 'manual_review_required',
        updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.update(paymentRef, {
        state: 'refund_pending',
        cancellationCaseId: input.caseId,
        refundRequestedAt: Timestamp.fromDate(input.now),
        updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.create(this.firestore.doc(`bookingCases/${input.caseId}`), {
        caseId: input.caseId,
        type: 'renter_cancellation',
        status: 'refund_pending',
        priority: 'standard',
        bookingId: booking.bookingId,
        paymentId: booking.paymentId,
        intentId: booking.intentId,
        renterId: booking.renterId,
        ownerId: booking.ownerId,
        vehicleId: booking.vehicleId,
        startDate: booking.startDate,
        endDate: booking.endDate,
        priceSnapshot: booking.priceSnapshot,
        vehicleSnapshot: booking.vehicleSnapshot,
        reasonCode: 'renter_cancelled_after_payment',
        cancellationPolicyVersion,
        financialOutcome: 'manual_review_required',
        openedAt: Timestamp.fromDate(input.now),
        updatedAt: Timestamp.fromDate(input.now),
        version: 1,
      });
      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: input.renterId,
        actorType: 'renter',
        entityId: booking.bookingId,
        entityType: 'booking',
        eventType: 'booking.renter_cancelled',
        fromState: booking.state,
        toState: 'refund_pending',
        requestId: input.commandRequestId,
        occurredAt: Timestamp.fromDate(input.now),
        details: {
          caseId: input.caseId,
          cancellationPolicyVersion,
          amountPaidKobo: booking.priceSnapshot.renterTotalKobo,
          inventoryReleased: true,
        },
      });
      if (booking.rentalRequestId) {
        transaction.update(this.firestore.doc(`rentalRequests/${booking.rentalRequestId}`), {
          cancellationRequestedAt: FieldValue.delete(),
          postPaymentCancellationAt: Timestamp.fromDate(input.now),
          updatedAt: Timestamp.fromDate(input.now),
        });
      }
      transaction.create(idempotencyRef, {
        actorId: input.renterId,
        commandName: 'cancelBooking',
        requestHash: input.requestHash,
        result,
        createdAt: Timestamp.fromDate(input.now),
      });
      return result;
    });
  }

  async resolvePendingCancellations(now: Date): Promise<{ scanned: number; resolved: number; protected: number; invalid: number }> {
    const snapshot = await this.firestore.collection('renterCancellations')
      .where('status', '==', 'pending_payment_resolution')
      .limit(100)
      .get();
    let resolved = 0;
    let protectedCount = 0;
    let invalid = 0;

    for (const document of snapshot.docs) {
      try {
        const marker = pendingCancellationSchema.safeParse(document.data());
        if (!marker.success) { invalid += 1; continue; }
        const requestSnapshot = await this.firestore.doc(`rentalRequests/${marker.data.requestId}`).get();
        const request = requestSchema.safeParse(requestSnapshot.data());
        const intentSnapshot = await this.firestore.doc(`bookingIntents/${marker.data.intentId}`).get();
        const intent = intentSchema.safeParse(intentSnapshot.data());
        if (!requestSnapshot.exists || !request.success || !intentSnapshot.exists || !intent.success ||
          request.data.renterId !== marker.data.renterId || request.data.intentId !== marker.data.intentId) {
          invalid += 1;
          continue;
        }

        if (intent.data.state === 'checkout_pending') {
          protectedCount += 1;
          continue;
        }

        if (intent.data.state === 'paid' && request.data.bookingId) {
          const bookingSnapshot = await this.firestore.doc(`bookings/${request.data.bookingId}`).get();
          const booking = bookingSchema.safeParse(bookingSnapshot.data());
          if (!bookingSnapshot.exists || !booking.success) { invalid += 1; continue; }
          if (booking.data.state === 'refund_pending' || booking.data.state === 'refunded') {
            await document.ref.set({ status: 'refund_pending', resolvedAt: Timestamp.fromDate(now), updatedAt: Timestamp.fromDate(now) }, { merge: true });
            resolved += 1;
            continue;
          }
          await this.cancelPaidBooking({
            renterId: marker.data.renterId,
            bookingId: booking.data.bookingId,
            expectedVersion: booking.data.version,
            caseId: `renter-cancel-${booking.data.bookingId}`.slice(0, 128),
            commandRequestId: `resolver-${marker.data.requestId}`.slice(0, 128),
            requestHash: `resolver:${marker.data.requestId}:${booking.data.bookingId}`,
            idempotencyDocumentId: `renter-cancel-resolver-${marker.data.requestId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128),
            now,
          });
          await document.ref.set({ status: 'refund_pending', resolvedAt: Timestamp.fromDate(now), updatedAt: Timestamp.fromDate(now) }, { merge: true });
          resolved += 1;
          continue;
        }

        if (intent.data.state === 'failed' || intent.data.state === 'expired' || intent.data.state === 'invalid') {
          await this.resolveUnpaidPendingCancellation(document.id, request.data, intent.data, now);
          resolved += 1;
          continue;
        }

        // A paid conflict already has a staff intervention case. Preserve
        // inventory/payment evidence and mark the renter cancellation for that desk.
        if (intent.data.state === 'paid_conflict') {
          await document.ref.set({ status: 'manual_intervention', resolvedAt: Timestamp.fromDate(now), updatedAt: Timestamp.fromDate(now) }, { merge: true });
          resolved += 1;
          continue;
        }

        protectedCount += 1;
      } catch {
        invalid += 1;
      }
    }

    return { scanned: snapshot.size, resolved, protected: protectedCount, invalid };
  }

  private async resolveUnpaidPendingCancellation(
    markerId: string,
    request: z.infer<typeof requestSchema>,
    intent: z.infer<typeof intentSchema>,
    now: Date,
  ): Promise<void> {
    await this.firestore.runTransaction(async (transaction) => {
      const requestRef = this.firestore.doc(`rentalRequests/${request.requestId}`);
      const freshRequestSnapshot = await transaction.get(requestRef);
      const freshRequest = requestSchema.safeParse(freshRequestSnapshot.data());
      const intentRef = this.firestore.doc(`bookingIntents/${request.intentId}`);
      const freshIntentSnapshot = await transaction.get(intentRef);
      const freshIntent = intentSchema.safeParse(freshIntentSnapshot.data());
      if (!freshRequest.success || !freshIntent.success || !freshRequest.data.cancellationRequestedAt ||
        !['failed', 'expired', 'invalid'].includes(freshIntent.data.state)) {
        throw new BookingCommandError('INVALID_STATE_TRANSITION', 'Cancellation is not ready to resolve.');
      }

      const blockRef = this.firestore.doc(`bookingBlocks/${request.intentId}`);
      const blockSnapshot = await transaction.get(blockRef);
      if (blockSnapshot.exists) {
        const block = blockSchema.safeParse(blockSnapshot.data());
        if (!block.success || block.data.state !== 'held' || !exactIntentBlock(block.data, request.intentId!, freshRequest.data)) {
          throw new BookingCommandError('FAILED_PRECONDITION', 'Cancellation inventory no longer matches the request.');
        }
        const sentinelRef = this.firestore.doc(`vehicleAvailability/${freshRequest.data.vehicleId}`);
        const availabilitySnapshot = await transaction.get(sentinelRef);
        const version = sentinelVersion(availabilitySnapshot);
        transaction.delete(blockRef);
        transaction.update(sentinelRef, { version: version + 1, updatedAt: Timestamp.fromDate(now) });
      }

      transaction.update(requestRef, {
        state: 'cancelled_by_renter',
        version: freshRequest.data.version + 1,
        cancelledAt: Timestamp.fromDate(now),
        cancellationRequestedAt: FieldValue.delete(),
        holdExpiresAt: FieldValue.delete(),
        updatedAt: Timestamp.fromDate(now),
      });
      transaction.set(this.firestore.doc(`renterCancellations/${markerId}`), {
        status: 'resolved_cancelled',
        resolvedAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
      }, { merge: true });
      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: freshRequest.data.renterId,
        actorType: 'system',
        entityId: freshRequest.data.requestId,
        entityType: 'rentalRequest',
        eventType: 'rental_request.cancellation_resolved',
        fromState: freshRequest.data.state,
        toState: 'cancelled_by_renter',
        requestId: `resolver-${freshRequest.data.requestId}`.slice(0, 128),
        occurredAt: Timestamp.fromDate(now),
        details: { intentState: freshIntent.data.state },
      });
    });
  }

  private writeRequestCancellationAudit(
    transaction: Transaction,
    request: z.infer<typeof requestSchema>,
    fromState: string,
    toState: string,
    input: CancelRentalRequestInput,
  ): void {
    transaction.create(this.firestore.collection('auditEvents').doc(), {
      actorId: input.renterId,
      actorType: 'renter',
      entityId: request.requestId,
      entityType: 'rentalRequest',
      eventType: toState === 'cancellation_requested' ? 'rental_request.cancellation_requested' : 'rental_request.cancelled',
      fromState,
      toState,
      requestId: input.commandRequestId,
      occurredAt: Timestamp.fromDate(input.now),
      details: { vehicleId: request.vehicleId, intentId: request.intentId ?? null },
    });
  }
}
