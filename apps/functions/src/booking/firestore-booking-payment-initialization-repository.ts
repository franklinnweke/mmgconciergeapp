import {
  emailAddressSchema,
  priceSnapshotSchema,
} from '@mmg/contracts';
import {
  initializeBookingPaymentResultSchema,
  paymentEnvironmentSchema,
  paymentReferenceSchema,
  type InitializeBookingPaymentResult,
} from '@mmg/contracts/payment';
import {
  getFirestore,
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { z } from 'zod';

import { BookingCommandError } from './errors.js';
import type {
  BookingPaymentInitializationRepository,
  CompletePaymentInitializationInput,
  PaymentInitializationReservation,
  ReservePaymentInitializationInput,
} from './initialize-booking-payment-service.js';

const intentSchema = z.object({
  renterId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  rentalRequestId: z.string().min(1).max(128).optional(),
  state: z.enum(['intent_created', 'checkout_pending', 'paid', 'expired', 'failed', 'invalid', 'paid_conflict']),
  priceSnapshot: priceSnapshotSchema,
  expiresAt: z.instanceof(Timestamp),
  paymentId: z.string().min(1).max(128).optional(),
  paymentReference: paymentReferenceSchema.optional(),
}).passthrough();

const heldBlockSchema = z.object({
  intentId: z.string().min(1).max(128),
  rentalRequestId: z.string().min(1).max(128).optional(),
  renterId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  state: z.literal('held'),
  expiresAt: z.instanceof(Timestamp),
  paymentWindowExpiresAt: z.instanceof(Timestamp).optional(),
  paymentProtectionExpiresAt: z.instanceof(Timestamp).optional(),
}).passthrough();

const renterProfileSchema = z.object({
  renterId: z.string().min(1).max(128).optional(),
  email: emailAddressSchema,
  phone: z.string().trim().min(7).max(32),
  defaultDeliveryAddress: z.object({}).passthrough(),
  accountStatus: z.literal('active'),
}).passthrough();

const paymentSchema = z.object({
  paymentId: z.string().min(1).max(128),
  intentId: z.string().min(1).max(128),
  rentalRequestId: z.string().min(1).max(128).optional(),
  renterId: z.string().min(1).max(128),
  provider: z.literal('paystack'),
  reference: paymentReferenceSchema,
  state: z.enum(['initialized', 'pending', 'succeeded', 'refund_pending', 'refunded', 'failed', 'abandoned', 'refund_failed']),
  currency: z.literal('NGN'),
  amountKobo: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  holdExpiresAt: z.instanceof(Timestamp),
  environment: paymentEnvironmentSchema.optional(),
  authorizationUrl: z.string().url().optional(),
  accessCode: z.string().min(1).optional(),
  checkoutRequestId: z.string().min(1).max(128).optional(),
  initializationLeaseToken: z.string().min(1).nullable().optional(),
  initializationLeaseExpiresAt: z.instanceof(Timestamp).nullable().optional(),
}).passthrough();

const idempotencySchema = z.object({
  actorId: z.string().min(1).max(128),
  commandName: z.literal('initializeBookingPayment'),
  requestHash: z.string().length(64),
  result: z.unknown(),
}).passthrough();

function resultFromPayment(payment: z.infer<typeof paymentSchema>): InitializeBookingPaymentResult | null {
  if (
    payment.state !== 'pending' ||
    !payment.environment ||
    !payment.authorizationUrl ||
    !payment.accessCode ||
    !payment.checkoutRequestId
  ) return null;

  return initializeBookingPaymentResultSchema.parse({
    requestId: payment.checkoutRequestId,
    result: {
      intentId: payment.intentId,
      paymentId: payment.paymentId,
      provider: 'paystack',
      reference: payment.reference,
      authorizationUrl: payment.authorizationUrl,
      accessCode: payment.accessCode,
      environment: payment.environment,
      currency: payment.currency,
      amountKobo: payment.amountKobo,
      state: 'pending',
      holdExpiresAt: payment.holdExpiresAt.toDate().toISOString(),
    },
  });
}

function customerHoldExpiry(
  intent: z.infer<typeof intentSchema>,
  hold: z.infer<typeof heldBlockSchema>,
  now: Date,
): Date {
  if (intent.rentalRequestId) {
    if (
      hold.rentalRequestId !== intent.rentalRequestId ||
      !hold.paymentWindowExpiresAt ||
      !hold.paymentProtectionExpiresAt ||
      hold.paymentWindowExpiresAt.toMillis() <= now.getTime() ||
      hold.paymentProtectionExpiresAt.toMillis() <= now.getTime()
    ) {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        'The concierge payment window has expired or was not activated safely.',
        { reason: 'expired' },
      );
    }
    return hold.paymentWindowExpiresAt.toDate();
  }
  if (hold.expiresAt.toMillis() <= now.getTime()) {
    throw new BookingCommandError('FAILED_PRECONDITION', 'The checkout hold has expired or is no longer valid.', { reason: 'expired' });
  }
  return hold.expiresAt.toDate();
}

export class FirestoreBookingPaymentInitializationRepository
implements BookingPaymentInitializationRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  async reserveInitialization(input: ReservePaymentInitializationInput): Promise<PaymentInitializationReservation> {
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const idempotencySnapshot = await transaction.get(idempotencyRef);
      if (idempotencySnapshot.exists) {
        const parsed = idempotencySchema.safeParse(idempotencySnapshot.data());
        if (!parsed.success || parsed.data.actorId !== input.actor.uid) {
          throw new BookingCommandError('FAILED_PRECONDITION', 'Stored payment idempotency data is invalid.');
        }
        if (parsed.data.requestHash !== input.requestHash) {
          throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different payment request.');
        }
        return { kind: 'replay', result: initializeBookingPaymentResultSchema.parse(parsed.data.result) };
      }

      const intentRef = this.firestore.doc(`bookingIntents/${input.intentId}`);
      const intentSnapshot = await transaction.get(intentRef);
      if (!intentSnapshot.exists) throw new BookingCommandError('NOT_FOUND', 'Booking intent was not found.');
      const intent = intentSchema.safeParse(intentSnapshot.data());
      if (!intent.success) throw new BookingCommandError('FAILED_PRECONDITION', 'Booking intent data is invalid.');
      if (intent.data.renterId !== input.actor.uid) {
        throw new BookingCommandError('FORBIDDEN', 'You cannot initialize payment for this booking intent.');
      }
      if (intent.data.state !== 'intent_created' && intent.data.state !== 'checkout_pending') {
        throw new BookingCommandError('FAILED_PRECONDITION', 'This booking intent is not eligible for payment initialization.');
      }

      const holdRef = this.firestore.doc(`bookingBlocks/${input.intentId}`);
      const holdSnapshot = await transaction.get(holdRef);
      const hold = heldBlockSchema.safeParse(holdSnapshot.data());
      if (
        !holdSnapshot.exists || !hold.success || hold.data.intentId !== input.intentId ||
        hold.data.renterId !== input.actor.uid || hold.data.vehicleId !== intent.data.vehicleId ||
        hold.data.expiresAt.toMillis() <= input.now.getTime()
      ) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'The checkout hold has expired or is no longer valid.', { reason: 'expired' });
      }
      const visibleHoldExpiresAt = customerHoldExpiry(intent.data, hold.data, input.now);

      const profileRef = this.firestore.doc(`renterProfiles/${input.actor.uid}`);
      const profileSnapshot = await transaction.get(profileRef);
      const profile = renterProfileSchema.safeParse(profileSnapshot.data());
      if (
        !profileSnapshot.exists || !profile.success ||
        profile.data.email !== input.actor.email.toLowerCase()
      ) {
        throw new BookingCommandError(
          'PROFILE_INCOMPLETE',
          'A complete renter profile with a contact phone and delivery address is required before checkout.',
        );
      }

      const paymentRef = this.firestore.doc(`payments/${input.paymentId}`);
      const paymentSnapshot = await transaction.get(paymentRef);

      if (intent.data.state === 'checkout_pending') {
        if (intent.data.paymentId !== input.paymentId || intent.data.paymentReference !== input.reference || !paymentSnapshot.exists) {
          throw new BookingCommandError('FAILED_PRECONDITION', 'Booking payment binding is inconsistent and requires reconciliation.');
        }
        const payment = paymentSchema.safeParse(paymentSnapshot.data());
        if (!payment.success) throw new BookingCommandError('FAILED_PRECONDITION', 'Stored payment data is invalid.');
        if (
          payment.data.intentId !== input.intentId || payment.data.renterId !== input.actor.uid ||
          payment.data.reference !== input.reference || payment.data.amountKobo !== intent.data.priceSnapshot.renterTotalKobo ||
          payment.data.rentalRequestId !== intent.data.rentalRequestId
        ) {
          throw new BookingCommandError('FAILED_PRECONDITION', 'Stored payment binding does not match the authoritative booking intent.');
        }

        const existingResult = resultFromPayment(payment.data);
        if (existingResult) {
          this.saveIdempotency(transaction, idempotencyRef, input.actor.uid, input.requestHash, existingResult, input.now);
          return { kind: 'replay', result: existingResult };
        }
        if (payment.data.state !== 'initialized') {
          throw new BookingCommandError('FAILED_PRECONDITION', 'Existing payment cannot be initialized again in its current state.');
        }
        const leaseExpiresAt = payment.data.initializationLeaseExpiresAt?.toMillis() ?? 0;
        const leaseToken = payment.data.initializationLeaseToken;
        if (leaseToken && leaseToken !== input.requestId && leaseExpiresAt > input.now.getTime()) {
          throw new BookingCommandError('ALREADY_EXISTS', 'Payment initialization is already in progress.');
        }
        transaction.update(paymentRef, {
          initializationLeaseToken: input.requestId,
          initializationLeaseExpiresAt: Timestamp.fromDate(input.leaseExpiresAt),
          updatedAt: Timestamp.fromDate(input.now),
        });
        return {
          kind: 'ready', paymentId: input.paymentId, intentId: input.intentId, reference: input.reference,
          email: profile.data.email, amountKobo: intent.data.priceSnapshot.renterTotalKobo, currency: 'NGN',
          holdExpiresAt: visibleHoldExpiresAt,
        };
      }

      if (paymentSnapshot.exists) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'A payment record already exists for this booking intent and requires reconciliation.');
      }

      transaction.create(paymentRef, {
        paymentId: input.paymentId, intentId: input.intentId, renterId: input.actor.uid,
        ...(intent.data.rentalRequestId ? { rentalRequestId: intent.data.rentalRequestId } : {}),
        vehicleId: intent.data.vehicleId, provider: 'paystack', reference: input.reference,
        state: 'initialized', currency: 'NGN', amountKobo: intent.data.priceSnapshot.renterTotalKobo,
        holdExpiresAt: Timestamp.fromDate(visibleHoldExpiresAt), initializationLeaseToken: input.requestId,
        initializationLeaseExpiresAt: Timestamp.fromDate(input.leaseExpiresAt),
        createdAt: Timestamp.fromDate(input.now), updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.update(intentRef, {
        state: 'checkout_pending', paymentId: input.paymentId, paymentReference: input.reference,
        updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: input.actor.uid, actorType: 'renter', entityId: input.paymentId, entityType: 'payment',
        eventType: 'booking_payment.initialization_reserved', fromState: null, toState: 'initialized',
        requestId: input.requestId, occurredAt: Timestamp.fromDate(input.now),
        details: { intentId: input.intentId, ...(intent.data.rentalRequestId ? { rentalRequestId: intent.data.rentalRequestId } : {}) },
      });
      return {
        kind: 'ready', paymentId: input.paymentId, intentId: input.intentId, reference: input.reference,
        email: profile.data.email, amountKobo: intent.data.priceSnapshot.renterTotalKobo, currency: 'NGN',
        holdExpiresAt: visibleHoldExpiresAt,
      };
    });
  }

  async completeInitialization(input: CompletePaymentInitializationInput): Promise<InitializeBookingPaymentResult> {
    return this.firestore.runTransaction(async (transaction) => {
      const paymentRef = this.firestore.doc(`payments/${input.reservation.paymentId}`);
      const paymentSnapshot = await transaction.get(paymentRef);
      const payment = paymentSchema.safeParse(paymentSnapshot.data());
      if (!paymentSnapshot.exists || !payment.success) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Reserved payment record is unavailable.');
      }
      if (
        payment.data.intentId !== input.reservation.intentId || payment.data.renterId !== input.actor.uid ||
        payment.data.reference !== input.reservation.reference
      ) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Reserved payment binding changed unexpectedly.');
      }

      const existingResult = resultFromPayment(payment.data);
      if (existingResult) {
        const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
        this.saveIdempotency(transaction, idempotencyRef, input.actor.uid, input.requestHash, existingResult, input.now);
        return existingResult;
      }
      if (payment.data.state !== 'initialized' || payment.data.initializationLeaseToken !== input.requestId) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Payment initialization lease is no longer owned by this request.');
      }
      if (input.providerResult.reference !== payment.data.reference) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Paystack reference does not match the reserved payment.');
      }

      const holdRef = this.firestore.doc(`bookingBlocks/${input.reservation.intentId}`);
      const holdSnapshot = await transaction.get(holdRef);
      const hold = heldBlockSchema.safeParse(holdSnapshot.data());
      if (!holdSnapshot.exists || !hold.success || hold.data.expiresAt.toMillis() <= input.now.getTime()) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'The checkout hold expired before payment initialization completed.', { reason: 'expired' });
      }
      if (payment.data.rentalRequestId && hold.data.rentalRequestId !== payment.data.rentalRequestId) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'The protected rental-request hold changed unexpectedly.');
      }

      const result = initializeBookingPaymentResultSchema.parse({
        requestId: input.requestId,
        result: {
          intentId: payment.data.intentId, paymentId: payment.data.paymentId, provider: 'paystack',
          reference: payment.data.reference, authorizationUrl: input.providerResult.authorizationUrl,
          accessCode: input.providerResult.accessCode, environment: input.providerResult.environment,
          currency: payment.data.currency, amountKobo: payment.data.amountKobo, state: 'pending',
          holdExpiresAt: payment.data.holdExpiresAt.toDate().toISOString(),
        },
      });

      transaction.update(paymentRef, {
        state: 'pending', environment: input.providerResult.environment,
        authorizationUrl: input.providerResult.authorizationUrl, accessCode: input.providerResult.accessCode,
        checkoutRequestId: input.requestId, initializationLeaseToken: null,
        initializationLeaseExpiresAt: null, updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: input.actor.uid, actorType: 'renter', entityId: payment.data.paymentId, entityType: 'payment',
        eventType: 'booking_payment.initialized', fromState: 'initialized', toState: 'pending',
        requestId: input.requestId, occurredAt: Timestamp.fromDate(input.now),
        details: { intentId: payment.data.intentId, ...(payment.data.rentalRequestId ? { rentalRequestId: payment.data.rentalRequestId } : {}) },
      });
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      this.saveIdempotency(transaction, idempotencyRef, input.actor.uid, input.requestHash, result, input.now);
      return result;
    });
  }

  async releaseInitializationLease(paymentId: string, requestId: string, now: Date): Promise<void> {
    await this.firestore.runTransaction(async (transaction) => {
      const paymentRef = this.firestore.doc(`payments/${paymentId}`);
      const snapshot = await transaction.get(paymentRef);
      const payment = paymentSchema.safeParse(snapshot.data());
      if (!snapshot.exists || !payment.success) return;
      if (payment.data.state === 'initialized' && payment.data.initializationLeaseToken === requestId) {
        transaction.update(paymentRef, {
          initializationLeaseToken: null,
          initializationLeaseExpiresAt: Timestamp.fromDate(now),
          updatedAt: Timestamp.fromDate(now),
        });
      }
    });
  }

  private saveIdempotency(
    transaction: Transaction,
    documentRef: DocumentReference,
    actorId: string,
    requestHash: string,
    result: InitializeBookingPaymentResult,
    now: Date,
  ): void {
    transaction.set(documentRef, {
      actorId, commandName: 'initializeBookingPayment', requestHash, result,
      createdAt: Timestamp.fromDate(now),
    });
  }
}
