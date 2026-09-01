import { describe, expect, it, vi } from 'vitest';

import { paymentReferenceSchema } from '@mmg/contracts/payment';

import { BookingCommandError } from './errors.js';
import {
  buildPaymentIdentity,
  initializeBookingPayment,
  type BookingPaymentInitializationRepository,
  type CheckoutRenter,
  type PaymentInitializationReservation,
} from './initialize-booking-payment-service.js';
import type { PaymentGateway } from './payment-gateway.js';

const actor: CheckoutRenter = {
  uid: 'renter-123',
  email: 'renter@example.com',
  phoneNumber: '+2348012345678',
};

const command = {
  schemaVersion: 1 as const,
  idempotencyKey: 'payment-init-1234567890',
  data: { intentId: 'intent-123' },
};

function readyReservation(): Extract<PaymentInitializationReservation, { kind: 'ready' }> {
  const identity = buildPaymentIdentity(actor.uid, command.data.intentId);
  return {
    kind: 'ready',
    paymentId: identity.paymentId,
    intentId: command.data.intentId,
    reference: identity.reference,
    email: actor.email,
    amountKobo: 12_500_000,
    currency: 'NGN',
    holdExpiresAt: new Date('2026-09-01T12:15:00.000Z'),
  };
}

function repositoryWithReservation(reservation: PaymentInitializationReservation) {
  const completeResult = {
    requestId: 'request-123',
    result: {
      intentId: command.data.intentId,
      paymentId: buildPaymentIdentity(actor.uid, command.data.intentId).paymentId,
      provider: 'paystack' as const,
      reference: buildPaymentIdentity(actor.uid, command.data.intentId).reference,
      authorizationUrl: 'https://checkout.paystack.com/access-123',
      accessCode: 'access-123',
      environment: 'test' as const,
      currency: 'NGN' as const,
      amountKobo: 12_500_000,
      state: 'pending' as const,
      holdExpiresAt: '2026-09-01T12:15:00.000Z',
    },
  };
  const repository: BookingPaymentInitializationRepository = {
    reserveInitialization: vi.fn(async () => reservation),
    completeInitialization: vi.fn(async () => completeResult),
    releaseInitializationLease: vi.fn(async () => undefined),
  };
  return { repository, completeResult };
}

function successfulGateway(): PaymentGateway {
  return {
    initializePayment: vi.fn(async (input) => ({
      provider: 'paystack',
      reference: input.reference,
      authorizationUrl: 'https://checkout.paystack.com/access-123',
      accessCode: 'access-123',
      environment: 'test',
    })),
    verifyPayment: vi.fn(async () => {
      throw new Error('verification is not part of R2');
    }),
  };
}

describe('buildPaymentIdentity', () => {
  it('generates deterministic provider-safe payment identity without leaking raw IDs', () => {
    const first = buildPaymentIdentity('renter_with_underscore', 'intent/unsafe id');
    const second = buildPaymentIdentity('renter_with_underscore', 'intent/unsafe id');
    expect(first).toEqual(second);
    expect(first.paymentId).toMatch(/^payment-[a-f0-9]{40}$/);
    expect(paymentReferenceSchema.parse(first.reference)).toBe(first.reference);
    expect(first.reference).toMatch(/^mmg-[a-f0-9]{48}$/);
    expect(first.reference).not.toContain('_');
    expect(first.reference).not.toContain('/');
  });
});

describe('initializeBookingPayment', () => {
  it('uses only server-reserved email, amount, currency and reference for Paystack', async () => {
    const reservation = readyReservation();
    const { repository, completeResult } = repositoryWithReservation(reservation);
    const gateway = successfulGateway();

    await expect(
      initializeBookingPayment(command, actor, {
        repository,
        paymentGateway: gateway,
        now: () => new Date('2026-09-01T12:00:00.000Z'),
        createRequestId: () => 'request-123',
      }),
    ).resolves.toEqual(completeResult);

    expect(gateway.initializePayment).toHaveBeenCalledWith({
      reference: reservation.reference,
      email: actor.email,
      amountKobo: 12_500_000,
      currency: 'NGN',
      metadata: { intentId: 'intent-123' },
    });
    expect(repository.completeInitialization).toHaveBeenCalledTimes(1);
  });

  it('returns an idempotent replay without calling Paystack again', async () => {
    const { completeResult } = repositoryWithReservation(readyReservation());
    const { repository } = repositoryWithReservation({ kind: 'replay', result: completeResult });
    const gateway = successfulGateway();

    const result = await initializeBookingPayment(command, actor, {
      repository,
      paymentGateway: gateway,
      now: () => new Date('2026-09-01T12:00:00.000Z'),
      createRequestId: () => 'request-456',
    });

    expect(result).toEqual(completeResult);
    expect(gateway.initializePayment).not.toHaveBeenCalled();
    expect(repository.completeInitialization).not.toHaveBeenCalled();
  });

  it('does not replay a hosted checkout URL after its hold expires', async () => {
    const { completeResult } = repositoryWithReservation(readyReservation());
    const { repository } = repositoryWithReservation({ kind: 'replay', result: completeResult });
    const gateway = successfulGateway();

    await expect(initializeBookingPayment(command, actor, {
      repository,
      paymentGateway: gateway,
      now: () => new Date('2026-09-01T12:15:00.000Z'),
      createRequestId: () => 'request-expired-replay',
    })).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      safeDetails: { reason: 'expired' },
    });

    expect(gateway.initializePayment).not.toHaveBeenCalled();
  });

  it('releases the initialization lease when Paystack fails before a result is persisted', async () => {
    const reservation = readyReservation();
    const { repository } = repositoryWithReservation(reservation);
    const gateway: PaymentGateway = {
      initializePayment: vi.fn(async () => {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Paystack is temporarily unavailable.');
      }),
      verifyPayment: vi.fn(async () => {
        throw new Error('verification is not part of R2');
      }),
    };

    await expect(
      initializeBookingPayment(command, actor, {
        repository,
        paymentGateway: gateway,
        now: () => new Date('2026-09-01T12:00:00.000Z'),
        createRequestId: () => 'request-789',
      }),
    ).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });

    expect(repository.releaseInitializationLease).toHaveBeenCalledWith(
      reservation.paymentId,
      'request-789',
      new Date('2026-09-01T12:00:00.000Z'),
    );
    expect(repository.completeInitialization).not.toHaveBeenCalled();
  });

  it('rejects client attempts to inject trusted payment values', async () => {
    const { repository } = repositoryWithReservation(readyReservation());
    const gateway = successfulGateway();

    await expect(
      initializeBookingPayment(
        {
          ...command,
          data: {
            intentId: 'intent-123',
            amountKobo: 1,
            currency: 'USD',
            reference: 'attacker-reference',
          },
        },
        actor,
        { repository, paymentGateway: gateway },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    expect(repository.reserveInitialization).not.toHaveBeenCalled();
    expect(gateway.initializePayment).not.toHaveBeenCalled();
  });
});
