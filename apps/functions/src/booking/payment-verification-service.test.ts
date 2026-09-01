import { describe, expect, it, vi } from 'vitest';

import type { PaymentGateway } from './payment-gateway.js';
import {
  buildReconcileEventId,
  processPaymentEvent,
  reconcilePayment,
  type PaymentVerificationRepository,
  type StoredPaymentEvent,
  type TrustedPaymentForVerification,
  type TrustedPendingPayment,
} from './payment-verification-service.js';

const payment: TrustedPendingPayment = {
  paymentId: 'payment-123',
  intentId: 'intent-123',
  renterId: 'renter-123',
  reference: 'mmg-abc123',
  state: 'pending',
  environment: 'test',
  currency: 'NGN',
  amountKobo: 12_500_000,
};

const succeededPayment: TrustedPaymentForVerification = {
  ...payment,
  state: 'succeeded',
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

function fakeRepository(options: {
  event?: StoredPaymentEvent | null;
  paymentByReference?: TrustedPaymentForVerification | null;
  paymentById?: TrustedPaymentForVerification | null;
} = {}) {
  const completeVerification = vi.fn(async () => ({
    providerStatus: successVerification.providerStatus,
    verification: 'verified_success' as const,
  }));
  const repository: PaymentVerificationRepository = {
    getEvent: vi.fn(async () => options.event === undefined ? {
      eventId: 'event-123',
      source: 'webhook',
      eventType: 'charge.success',
      reference: payment.reference,
      status: 'received',
    } : options.event),
    getPaymentByReference: vi.fn(async () => options.paymentByReference === undefined ? payment : options.paymentByReference),
    getPaymentById: vi.fn(async () => options.paymentById === undefined ? payment : options.paymentById),
    createReconcileEvent: vi.fn(async () => 'created'),
    rejectEvent: vi.fn(async () => undefined),
    completeVerification,
  };
  return repository;
}

function gateway(result = successVerification): PaymentGateway {
  return {
    initializePayment: vi.fn(async () => {
      throw new Error('initialization is not part of payment verification');
    }),
    verifyPayment: vi.fn(async () => result),
  };
}

describe('payment verification service', () => {
  it('independently verifies a durable webhook event and delegates exact checks to the repository', async () => {
    const repository = fakeRepository();
    const paymentGateway = gateway();

    await expect(processPaymentEvent('event-123', {
      repository,
      paymentGateway,
      now: () => new Date('2026-09-01T02:01:00.000Z'),
    })).resolves.toMatchObject({ verification: 'verified_success' });

    expect(paymentGateway.verifyPayment).toHaveBeenCalledWith({ reference: payment.reference });
    expect(repository.completeVerification).toHaveBeenCalledWith(
      'event-123',
      payment,
      successVerification,
      new Date('2026-09-01T02:01:00.000Z'),
    );
  });

  it('continues to verify a known payment after R4 has already marked it succeeded', async () => {
    const repository = fakeRepository({ paymentByReference: succeededPayment });
    const paymentGateway = gateway();

    await expect(processPaymentEvent('event-123', {
      repository,
      paymentGateway,
      now: () => new Date('2026-09-01T02:01:30.000Z'),
    })).resolves.toMatchObject({ verification: 'verified_success' });

    expect(repository.rejectEvent).not.toHaveBeenCalled();
    expect(paymentGateway.verifyPayment).toHaveBeenCalledWith({ reference: succeededPayment.reference });
    expect(repository.completeVerification).toHaveBeenCalledWith(
      'event-123',
      succeededPayment,
      successVerification,
      new Date('2026-09-01T02:01:30.000Z'),
    );
  });

  it('rejects an unknown webhook reference durably without calling Paystack verify', async () => {
    const repository = fakeRepository({ paymentByReference: null });
    const paymentGateway = gateway();

    await expect(processPaymentEvent('event-123', {
      repository,
      paymentGateway,
      now: () => new Date('2026-09-01T02:01:00.000Z'),
    })).resolves.toBeNull();

    expect(repository.rejectEvent).toHaveBeenCalledWith(
      'event-123',
      'unknown_reference',
      new Date('2026-09-01T02:01:00.000Z'),
    );
    expect(paymentGateway.verifyPayment).not.toHaveBeenCalled();
  });

  it('makes duplicate terminal event delivery a no-op', async () => {
    const repository = fakeRepository({
      event: {
        eventId: 'event-123',
        source: 'webhook',
        eventType: 'charge.success',
        reference: payment.reference,
        status: 'verified_success',
        providerStatus: 'success',
      },
    });
    const paymentGateway = gateway();
    await expect(processPaymentEvent('event-123', { repository, paymentGateway })).resolves.toBeNull();
    expect(paymentGateway.verifyPayment).not.toHaveBeenCalled();
  });

  it('lets only the intent owner reconcile and never accepts a client reference', async () => {
    const repository = fakeRepository();
    const paymentGateway = gateway();
    const command = {
      schemaVersion: 1,
      idempotencyKey: 'payment-reconcile-1234567890',
      data: { intentId: payment.intentId },
    };
    const eventId = buildReconcileEventId(successVerification);

    await expect(reconcilePayment(command, payment.renterId, {
      repository,
      paymentGateway,
      createRequestId: () => 'request-123',
      now: () => new Date('2026-09-01T02:02:00.000Z'),
    })).resolves.toEqual({
      requestId: 'request-123',
      result: {
        eventId,
        intentId: payment.intentId,
        paymentId: payment.paymentId,
        paymentState: 'pending',
        providerStatus: 'success',
        verification: 'verified_success',
      },
    });

    expect(repository.createReconcileEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId,
      reference: payment.reference,
    }));

    await expect(reconcilePayment({
      ...command,
      data: { intentId: payment.intentId, reference: 'attacker-reference' },
    }, payment.renterId, { repository, paymentGateway })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  it('reports succeeded state when the renter reconciles an already-delivered payment', async () => {
    const repository = fakeRepository({ paymentById: succeededPayment });
    const paymentGateway = gateway();
    const eventId = buildReconcileEventId(successVerification);

    await expect(reconcilePayment({
      schemaVersion: 1,
      idempotencyKey: 'payment-reconcile-succeeded-123',
      data: { intentId: succeededPayment.intentId },
    }, succeededPayment.renterId, {
      repository,
      paymentGateway,
      createRequestId: () => 'request-succeeded',
    })).resolves.toEqual({
      requestId: 'request-succeeded',
      result: {
        eventId,
        intentId: succeededPayment.intentId,
        paymentId: succeededPayment.paymentId,
        paymentState: 'succeeded',
        providerStatus: 'success',
        verification: 'verified_success',
      },
    });
  });

  it('does not expose another renter payment through reconciliation', async () => {
    const repository = fakeRepository({ paymentById: null });
    await expect(reconcilePayment({
      schemaVersion: 1,
      idempotencyKey: 'payment-reconcile-other-123',
      data: { intentId: payment.intentId },
    }, 'other-renter', { repository, paymentGateway: gateway() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
