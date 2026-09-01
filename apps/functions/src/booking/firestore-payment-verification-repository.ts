import {
  paymentEnvironmentSchema,
  paymentReferenceSchema,
  paymentStateSchema,
  paystackTransactionStatusSchema,
  type PaymentGatewayVerifyResult,
  type PaymentReference,
  type PaymentVerificationOutcome,
} from '@mmg/contracts/payment';
import {
  getFirestore,
  Timestamp,
  type Firestore,
} from 'firebase-admin/firestore';
import { z } from 'zod';

import { BookingCommandError } from './errors.js';
import type { StoredPaystackWebhookEvent } from './paystack-webhook-service.js';
import type {
  PaymentVerificationCompletion,
  PaymentVerificationRepository,
  StoredPaymentEvent,
  TrustedPendingPayment,
} from './payment-verification-service.js';

const paymentSchema = z.object({
  paymentId: z.string().min(1).max(128),
  intentId: z.string().min(1).max(128),
  renterId: z.string().min(1).max(128),
  provider: z.literal('paystack'),
  reference: paymentReferenceSchema,
  state: paymentStateSchema,
  environment: paymentEnvironmentSchema,
  currency: z.literal('NGN'),
  amountKobo: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).passthrough();

const eventSchema = z.object({
  eventId: z.string().min(1).max(128),
  source: z.enum(['webhook', 'reconcile']),
  eventType: z.enum(['charge.success', 'reconcile']),
  reference: paymentReferenceSchema,
  status: z.enum(['received', 'verified_success', 'not_succeeded', 'rejected']),
  providerStatus: paystackTransactionStatusSchema.optional(),
  paymentId: z.string().min(1).max(128).optional(),
  intentId: z.string().min(1).max(128).optional(),
  rejectionReason: z.enum([
    'unknown_reference',
    'reference_mismatch',
    'environment_mismatch',
    'currency_mismatch',
    'amount_mismatch',
    'payment_not_pending',
  ]).optional(),
}).passthrough();

function parsePendingPayment(data: unknown): TrustedPendingPayment | null {
  const parsed = paymentSchema.safeParse(data);
  if (!parsed.success || parsed.data.state !== 'pending') return null;
  return {
    paymentId: parsed.data.paymentId,
    intentId: parsed.data.intentId,
    renterId: parsed.data.renterId,
    reference: parsed.data.reference,
    state: 'pending',
    environment: parsed.data.environment,
    currency: parsed.data.currency,
    amountKobo: parsed.data.amountKobo,
  };
}

function storedEvent(data: unknown): StoredPaymentEvent | null {
  const parsed = eventSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

function verificationFromEventStatus(
  status: StoredPaymentEvent['status'],
): PaymentVerificationOutcome | null {
  return status === 'received' ? null : status;
}

export class FirestorePaymentVerificationRepository
implements PaymentVerificationRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  async createWebhookEvent(event: StoredPaystackWebhookEvent): Promise<'created' | 'duplicate'> {
    return this.firestore.runTransaction(async (transaction) => {
      const ref = this.firestore.doc(`paymentEvents/${event.eventId}`);
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) return 'duplicate';
      transaction.create(ref, {
        eventId: event.eventId,
        source: event.source,
        eventType: event.eventType,
        reference: event.reference,
        status: 'received',
        providerStatus: event.providerStatus,
        observedEnvironment: event.environment,
        observedAmountKobo: event.amountKobo,
        observedCurrency: event.currency,
        ...(event.paidAtIso ? { observedPaidAtIso: event.paidAtIso } : {}),
        bodySha256: event.bodySha256,
        signatureVerified: true,
        receivedAt: Timestamp.fromDate(event.receivedAt),
        createdAt: Timestamp.fromDate(event.receivedAt),
        updatedAt: Timestamp.fromDate(event.receivedAt),
      });
      return 'created';
    });
  }

  async createReconcileEvent(event: {
    eventId: string;
    reference: PaymentReference;
    providerStatus: PaymentGatewayVerifyResult['providerStatus'];
    environment: PaymentGatewayVerifyResult['environment'];
    amountKobo: number;
    currency: string;
    paidAtIso?: string;
    receivedAt: Date;
  }): Promise<'created' | 'duplicate'> {
    return this.firestore.runTransaction(async (transaction) => {
      const ref = this.firestore.doc(`paymentEvents/${event.eventId}`);
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) return 'duplicate';
      transaction.create(ref, {
        eventId: event.eventId,
        source: 'reconcile',
        eventType: 'reconcile',
        reference: event.reference,
        status: 'received',
        providerStatus: event.providerStatus,
        observedEnvironment: event.environment,
        observedAmountKobo: event.amountKobo,
        observedCurrency: event.currency,
        ...(event.paidAtIso ? { observedPaidAtIso: event.paidAtIso } : {}),
        receivedAt: Timestamp.fromDate(event.receivedAt),
        createdAt: Timestamp.fromDate(event.receivedAt),
        updatedAt: Timestamp.fromDate(event.receivedAt),
      });
      return 'created';
    });
  }

  async getEvent(eventId: string): Promise<StoredPaymentEvent | null> {
    const snapshot = await this.firestore.doc(`paymentEvents/${eventId}`).get();
    if (!snapshot.exists) return null;
    const event = storedEvent(snapshot.data());
    if (!event) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Stored payment event is invalid.');
    }
    return event;
  }

  async getPaymentByReference(reference: PaymentReference): Promise<TrustedPendingPayment | null> {
    const snapshot = await this.firestore.collection('payments')
      .where('reference', '==', reference)
      .limit(2)
      .get();
    if (snapshot.size > 1) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Payment reference is not unique.');
    }
    if (snapshot.empty) return null;
    return parsePendingPayment(snapshot.docs[0]!.data());
  }

  async getPaymentById(paymentId: string): Promise<TrustedPendingPayment | null> {
    const snapshot = await this.firestore.doc(`payments/${paymentId}`).get();
    return snapshot.exists ? parsePendingPayment(snapshot.data()) : null;
  }

  async rejectEvent(
    eventId: string,
    reason: StoredPaymentEvent['rejectionReason'],
    now: Date,
  ): Promise<void> {
    if (!reason) return;
    await this.firestore.runTransaction(async (transaction) => {
      const ref = this.firestore.doc(`paymentEvents/${eventId}`);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return;
      const event = storedEvent(snapshot.data());
      if (!event || event.status !== 'received') return;
      transaction.update(ref, {
        status: 'rejected',
        rejectionReason: reason,
        updatedAt: Timestamp.fromDate(now),
        verifiedAt: Timestamp.fromDate(now),
      });
    });
  }

  async completeVerification(
    eventId: string,
    payment: TrustedPendingPayment,
    providerResult: PaymentGatewayVerifyResult,
    now: Date,
  ): Promise<PaymentVerificationCompletion> {
    return this.firestore.runTransaction(async (transaction) => {
      const eventRef = this.firestore.doc(`paymentEvents/${eventId}`);
      const paymentRef = this.firestore.doc(`payments/${payment.paymentId}`);
      const eventSnapshot = await transaction.get(eventRef);
      const paymentSnapshot = await transaction.get(paymentRef);
      const event = storedEvent(eventSnapshot.data());
      if (!eventSnapshot.exists || !event) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Payment event is unavailable.');
      }

      const existingVerification = verificationFromEventStatus(event.status);
      if (existingVerification) {
        return {
          providerStatus: event.providerStatus ?? providerResult.providerStatus,
          verification: existingVerification,
        };
      }

      const currentPayment = parsePendingPayment(paymentSnapshot.data());
      if (!paymentSnapshot.exists || !currentPayment) {
        transaction.update(eventRef, {
          status: 'rejected',
          rejectionReason: 'payment_not_pending',
          providerStatus: providerResult.providerStatus,
          updatedAt: Timestamp.fromDate(now),
          verifiedAt: Timestamp.fromDate(now),
        });
        return {
          providerStatus: providerResult.providerStatus,
          verification: 'rejected',
        };
      }

      if (
        currentPayment.paymentId !== payment.paymentId ||
        currentPayment.reference !== payment.reference ||
        event.reference !== currentPayment.reference
      ) {
        transaction.update(eventRef, {
          status: 'rejected',
          rejectionReason: 'reference_mismatch',
          providerStatus: providerResult.providerStatus,
          paymentId: currentPayment.paymentId,
          intentId: currentPayment.intentId,
          updatedAt: Timestamp.fromDate(now),
          verifiedAt: Timestamp.fromDate(now),
        });
        return {
          providerStatus: providerResult.providerStatus,
          verification: 'rejected',
        };
      }

      let verification: PaymentVerificationOutcome = 'verified_success';
      let rejectionReason: StoredPaymentEvent['rejectionReason'];
      if (providerResult.reference !== currentPayment.reference) {
        verification = 'rejected';
        rejectionReason = 'reference_mismatch';
      } else if (providerResult.environment !== currentPayment.environment) {
        verification = 'rejected';
        rejectionReason = 'environment_mismatch';
      } else if (providerResult.currency !== currentPayment.currency) {
        verification = 'rejected';
        rejectionReason = 'currency_mismatch';
      } else if (providerResult.amountKobo !== currentPayment.amountKobo) {
        verification = 'rejected';
        rejectionReason = 'amount_mismatch';
      } else if (providerResult.providerStatus !== 'success') {
        verification = 'not_succeeded';
      }

      transaction.update(eventRef, {
        status: verification,
        providerStatus: providerResult.providerStatus,
        paymentId: currentPayment.paymentId,
        intentId: currentPayment.intentId,
        verifiedEnvironment: providerResult.environment,
        verifiedAmountKobo: providerResult.amountKobo,
        verifiedCurrency: providerResult.currency,
        ...(providerResult.paidAtIso ? { verifiedPaidAtIso: providerResult.paidAtIso } : {}),
        ...(rejectionReason ? { rejectionReason } : {}),
        verifiedAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
      });
      transaction.update(paymentRef, {
        lastVerificationEventId: eventId,
        lastVerificationOutcome: verification,
        lastProviderStatus: providerResult.providerStatus,
        lastVerifiedAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
      });

      return {
        providerStatus: providerResult.providerStatus,
        verification,
      };
    });
  }
}
