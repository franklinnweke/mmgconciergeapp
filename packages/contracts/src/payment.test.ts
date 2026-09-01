import { describe, expect, it } from 'vitest';

import {
  initializeBookingPaymentCommandSchema,
  paymentGatewayVerifyResultSchema,
  paymentReferenceSchema,
  paymentStateSchema,
  paymentVerificationOutcomeSchema,
  paystackTransactionStatusSchema,
  reconcilePaymentCommandSchema,
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

  it('locks the R3 verification outcome set without advancing payment state', () => {
    expect(paymentVerificationOutcomeSchema.options).toEqual([
      'verified_success',
      'not_succeeded',
      'rejected',
    ]);
  });

  it('accepts only Paystack-supported transaction reference characters', () => {
    expect(paymentReferenceSchema.parse('mmg-intent-123')).toBe('mmg-intent-123');
    expect(paymentReferenceSchema.parse('MMG.intent=123')).toBe('MMG.intent=123');
    expect(paymentReferenceSchema.parse('abcXYZ0123')).toBe('abcXYZ0123');
  });

  it('rejects transaction reference characters Paystack does not support', () => {
    for (const reference of [
      'mmg_intent_123',
      'mmg/intent/123',
      'mmg:intent:123',
      'mmg intent 123',
      'mmg+intent+123',
    ]) {
      expect(() => paymentReferenceSchema.parse(reference)).toThrow();
    }
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

  it('keeps reconciliation client input narrow and reference-free', () => {
    const parsed = reconcilePaymentCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: 'payment_reconcile_1234567890',
      data: { intentId: 'intent-123' },
    });
    expect(parsed.data).toEqual({ intentId: 'intent-123' });

    expect(() =>
      reconcilePaymentCommandSchema.parse({
        schemaVersion: 1,
        idempotencyKey: 'payment_reconcile_1234567890',
        data: { intentId: 'intent-123', reference: 'attacker-reference' },
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
