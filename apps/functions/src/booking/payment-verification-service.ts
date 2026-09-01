import { createHash, randomUUID } from 'node:crypto';

import {
  reconcilePaymentCommandSchema,
  reconcilePaymentResultSchema,
  type PaymentEnvironment,
  type PaymentGatewayVerifyResult,
  type PaymentReference,
  type PaymentVerificationOutcome,
  type PaystackTransactionStatus,
  type ReconcilePaymentResult,
} from '@mmg/contracts/payment';

import { BookingCommandError } from './errors.js';
import { buildPaymentIdentity } from './initialize-booking-payment-service.js';
import type { PaymentGateway } from './payment-gateway.js';

export type TrustedPendingPayment = {
  paymentId: string;
  intentId: string;
  renterId: string;
  reference: PaymentReference;
  state: 'pending';
  environment: PaymentEnvironment;
  currency: 'NGN';
  amountKobo: number;
};

export type StoredPaymentEvent = {
  eventId: string;
  source: 'webhook' | 'reconcile';
  eventType: 'charge.success' | 'reconcile';
  reference: PaymentReference;
  status: 'received' | 'verified_success' | 'not_succeeded' | 'rejected';
  providerStatus?: PaystackTransactionStatus;
  paymentId?: string;
  intentId?: string;
  rejectionReason?: 'unknown_reference' | 'reference_mismatch' | 'environment_mismatch' | 'currency_mismatch' | 'amount_mismatch' | 'payment_not_pending';
};

export type PaymentVerificationCompletion = {
  providerStatus: PaystackTransactionStatus;
  verification: PaymentVerificationOutcome;
};

export interface PaymentVerificationRepository {
  getEvent(eventId: string): Promise<StoredPaymentEvent | null>;
  getPaymentByReference(reference: PaymentReference): Promise<TrustedPendingPayment | null>;
  getPaymentById(paymentId: string): Promise<TrustedPendingPayment | null>;
  createReconcileEvent(event: {
    eventId: string;
    reference: PaymentReference;
    providerStatus: PaystackTransactionStatus;
    environment: PaymentEnvironment;
    amountKobo: number;
    currency: string;
    paidAtIso?: string;
    receivedAt: Date;
  }): Promise<'created' | 'duplicate'>;
  rejectEvent(eventId: string, reason: StoredPaymentEvent['rejectionReason'], now: Date): Promise<void>;
  completeVerification(
    eventId: string,
    payment: TrustedPendingPayment,
    providerResult: PaymentGatewayVerifyResult,
    now: Date,
  ): Promise<PaymentVerificationCompletion>;
}

function hashHex(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildReconcileEventId(result: PaymentGatewayVerifyResult): string {
  const digest = hashHex({
    source: 'reconcile',
    reference: result.reference,
    providerStatus: result.providerStatus,
    environment: result.environment,
    amountKobo: result.amountKobo,
    currency: result.currency,
    paidAtIso: result.paidAtIso ?? null,
  });
  return `paystack-reconcile-${digest.slice(0, 48)}`;
}

export async function processPaymentEvent(
  eventId: string,
  dependencies: {
    repository: PaymentVerificationRepository;
    paymentGateway: PaymentGateway;
    now?: () => Date;
  },
): Promise<PaymentVerificationCompletion | null> {
  const event = await dependencies.repository.getEvent(eventId);
  if (!event) {
    throw new BookingCommandError('NOT_FOUND', 'Payment event was not found.');
  }
  if (event.status !== 'received') return null;

  const payment = await dependencies.repository.getPaymentByReference(event.reference);
  if (!payment) {
    await dependencies.repository.rejectEvent(eventId, 'unknown_reference', (dependencies.now ?? (() => new Date()))());
    return null;
  }

  const providerResult = await dependencies.paymentGateway.verifyPayment({ reference: payment.reference });
  return dependencies.repository.completeVerification(
    eventId,
    payment,
    providerResult,
    (dependencies.now ?? (() => new Date()))(),
  );
}

export async function reconcilePayment(
  untrustedCommand: unknown,
  renterId: string,
  dependencies: {
    repository: PaymentVerificationRepository;
    paymentGateway: PaymentGateway;
    now?: () => Date;
    createRequestId?: () => string;
  },
): Promise<ReconcilePaymentResult> {
  if (!renterId) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to check payment status.');
  }
  const parsed = reconcilePaymentCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Payment reconciliation request is invalid.');
  }

  const command = parsed.data;
  const paymentId = buildPaymentIdentity(renterId, command.data.intentId).paymentId;
  const payment = await dependencies.repository.getPaymentById(paymentId);
  if (!payment || payment.renterId !== renterId || payment.intentId !== command.data.intentId) {
    throw new BookingCommandError('NOT_FOUND', 'Payment was not found.');
  }

  const providerResult = await dependencies.paymentGateway.verifyPayment({ reference: payment.reference });
  const eventId = buildReconcileEventId(providerResult);
  const now = (dependencies.now ?? (() => new Date()))();
  await dependencies.repository.createReconcileEvent({
    eventId,
    reference: payment.reference,
    providerStatus: providerResult.providerStatus,
    environment: providerResult.environment,
    amountKobo: providerResult.amountKobo,
    currency: providerResult.currency,
    ...(providerResult.paidAtIso ? { paidAtIso: providerResult.paidAtIso } : {}),
    receivedAt: now,
  });

  const completion = await dependencies.repository.completeVerification(eventId, payment, providerResult, now);
  return reconcilePaymentResultSchema.parse({
    requestId: (dependencies.createRequestId ?? randomUUID)(),
    result: {
      intentId: payment.intentId,
      paymentId: payment.paymentId,
      paymentState: 'pending',
      providerStatus: completion.providerStatus,
      verification: completion.verification,
    },
  });
}
