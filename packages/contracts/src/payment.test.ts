import { describe, expect, it } from 'vitest';

import {
  initializeBookingPaymentCommandSchema,
  paymentGatewayVerifyResultSchema,
  paymentStateSchema,
  paystackTransactionStatusSchema,
} from './payment.js';

describe('payment contracts', () => {
  it('locks the canonical payment state set', () => {
    expect(paymentStateSchema.options).toEqual([
      'initialized',
      'pending',
      'succeeded',
      'refund_pending',
      'refunded',
      'failed',
      'abandoned',
      'refund_failed',
    ]);
  });

  it('accepts all Paystack transaction statuses used by verification', () => {
    expect(paystackTransactionStatusSchema.options).toContain('success');
    expect(paystackTransactionStatusSchema.options).toContain('pending');
    expect(paystackTransactionStatusSchema.options).toContain('reversed');
  });

  it('keeps payment initialization client input narrow', () => {
    const parsed = initializeBookingPaymentCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: 'payment_init_1234567890',
      data: { intentId: 'intent-123' },
    });
    expect(parsed.data).toEqual({ intentId: 'intent-123' });

    expect(() =>
      initializeBookingPaymentCommandSchema.parse({
        schemaVersion: 1,
        idempotencyKey: 'payment_init_1234567890',
        data: { intentId: 'intent-123', amountKobo: 1 },
      }),
    ).toThrow();
  });

  it('normalizes provider currency while preserving status for trusted validation', () => {
    const result = paymentGatewayVerifyResultSchema.parse({
      provider: 'paystack',
      reference: 'reference-123',
      providerStatus: 'success',
      environment: 'test',
      amountKobo: 500_000,
      currency: 'ngn',
      paidAtIso: '2026-08-31T05:00:00.000Z',
    });
    expect(result.currency).toBe('NGN');
    expect(result.providerStatus).toBe('success');
  });
});
