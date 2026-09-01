import { describe, expect, it, vi } from 'vitest';

import type { PaymentGateway } from './payment-gateway.js';
import {
  processAndDeliverPaymentEvent,
  reconcileAndDeliverPayment,
} from './payment-value-orchestration-service.js';
import type {
  PaymentVerificationRepository,
  StoredPaymentEvent,
  TrustedPaymentForVerification,
} from './payment-verification-service.js';
import type { VerifiedPaymentValueRepository } from './verified-payment-value-service.js';

const payment: TrustedPaymentForVerification = {
  paymentId: 'payment-123',
  intentId: 'intent-123',
  renterId: 'renter-123',
  reference: 'mmg-abc123',
  state: 'pending',
  environment: 'test',
  currency: 'NGN',
  amountKobo: 12_500_000,
};

const successVerification = {
  provider: 'paystack' as const,
  reference: payment.reference,
  providerStatus: 'success' as const,
  environment: 'test' as const,
  amountKobo: payment.amountKobo,
  currency: 'NGN',
  paidAtIso: '2026-09-01T02:00:00.000Z',
};

function verificationRepository(
  eventStatus: StoredPaymentEvent['status'] = 'verified_success',
): PaymentVerificationRepository {
  return {
    getEvent: vi.fn(async (eventId) => ({
      eventId,
      source: 'webhook',
      eventType: 'charge.success',
      reference: payment.reference,
      status: eventStatus,
      providerStatus: eventStatus === 'verified_success' ? 'success' : undefined,
      paymentId: payment.paymentId,
      intentId: payment.intentId,
    })),
    getPaymentByReference: vi.fn(async () => payment),
    getPaymentById: vi.fn(async () => payment),
    createReconcileEvent: vi.fn(async () => 'created'),
    rejectEvent: vi.fn(async () => undefined),
    completeVerification: vi.fn(async () => ({
      providerStatus: 'success',
      verification: 'verified_success',
    })),
  };
}

function gateway(): PaymentGateway {
  return {
    initializePayment: vi.fn(async () => {
      throw new Error('not used');
    }),
    verifyPayment: vi.fn(async () => successVerification),
  };
}

function valueRepository(result = {
  eventId: 'event-123',
  paymentId: payment.paymentId,
  intentId: payment.intentId,
  outcome: 'paid_pending_owner' as const,
  paymentState: 'succeeded' as const,
  intentState: 'paid' as const,
  bookingId: 'booking-123',
}): VerifiedPaymentValueRepository {
  return {
    consumeVerifiedPayment: vi.fn(async ({ eventId }) => ({ ...result, eventId })),
  };
}

describe('payment value orchestration', () => {
  it('finishes R4 on retry when R3 verification was already durably committed', async () => {
    const verification = verificationRepository('verified_success');
    const provider = gateway();
    const value = valueRepository();

    const result = await processAndDeliverPaymentEvent('event-123', {
      verificationRepository: verification,
      paymentGateway: provider,
      valueRepository: value,
      createId: () => 'stable-id',
      createRequestId: () => 'request-retry',
      now: () => new Date('2026-09-01T04:30:00.000Z'),
    });

    expect(result.verification).toBeNull();
    expect(result.delivery).toMatchObject({
      outcome: 'paid_pending_owner',
      paymentState: 'succeeded',
    });
    expect(provider.verifyPayment).not.toHaveBeenCalled();
    expect(value.consumeVerifiedPayment).toHaveBeenCalledTimes(1);
  });

  it('does not deliver value for a durable non-success verification outcome', async () => {
    const verification = verificationRepository('not_succeeded');
    const value = valueRepository();

    const result = await processAndDeliverPaymentEvent('event-pending', {
      verificationRepository: verification,
      paymentGateway: gateway(),
      valueRepository: value,
    });

    expect(result).toEqual({ verification: null, delivery: null });
    expect(value.consumeVerifiedPayment).not.toHaveBeenCalled();
  });

  it('reconciles provider success through the same R4 processor and returns delivered state', async () => {
    const verification = verificationRepository('verified_success');
    const value = valueRepository();

    const result = await reconcileAndDeliverPayment({
      schemaVersion: 1,
      idempotencyKey: 'payment-reconcile-r4-123456',
      data: { intentId: payment.intentId },
    }, payment.renterId, {
      verificationRepository: verification,
      paymentGateway: gateway(),
      valueRepository: value,
      createId: () => 'stable-id',
      createRequestId: () => 'request-reconcile',
      now: () => new Date('2026-09-01T04:31:00.000Z'),
    });

    expect(result).toMatchObject({
      requestId: 'request-reconcile',
      result: {
        intentId: payment.intentId,
        paymentId: payment.paymentId,
        paymentState: 'succeeded',
        providerStatus: 'success',
        verification: 'verified_success',
        valueDeliveryOutcome: 'paid_pending_owner',
      },
    });
    expect(value.consumeVerifiedPayment).toHaveBeenCalledTimes(1);
  });

  it('fails closed if R4 delivery is bound to a different trusted payment', async () => {
    const value = valueRepository({
      eventId: 'event-123',
      paymentId: 'different-payment',
      intentId: payment.intentId,
      outcome: 'paid_pending_owner',
      paymentState: 'succeeded',
      intentState: 'paid',
      bookingId: 'booking-wrong',
    });

    await expect(reconcileAndDeliverPayment({
      schemaVersion: 1,
      idempotencyKey: 'payment-reconcile-r4-mismatch',
      data: { intentId: payment.intentId },
    }, payment.renterId, {
      verificationRepository: verificationRepository('verified_success'),
      paymentGateway: gateway(),
      valueRepository: value,
    })).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });
  });
});
