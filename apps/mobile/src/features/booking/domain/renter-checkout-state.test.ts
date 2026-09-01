import { describe, expect, it } from 'vitest';

import type { ReconcilePaymentResult } from '@mmg/contracts/payment';

import { checkoutStateIsResolved, resolveRenterCheckoutState } from './renter-checkout-state';

function reconciliation(overrides: Partial<ReconcilePaymentResult['result']>): ReconcilePaymentResult {
  return {
    requestId: 'request-r6',
    result: {
      eventId: 'event-r6',
      intentId: 'intent-r6',
      paymentId: 'payment-r6',
      paymentState: 'pending',
      providerStatus: 'pending',
      verification: 'not_succeeded',
      ...overrides,
    },
  };
}

describe('resolveRenterCheckoutState', () => {
  it('shows trusted paid booking delivery as payment received', () => {
    expect(resolveRenterCheckoutState(reconciliation({
      paymentState: 'succeeded',
      providerStatus: 'success',
      verification: 'verified_success',
      valueDeliveryOutcome: 'paid_pending_owner',
    }))).toBe('payment_received');
  });

  it('shows trusted late-payment collision as paid conflict', () => {
    expect(resolveRenterCheckoutState(reconciliation({
      paymentState: 'succeeded',
      providerStatus: 'success',
      verification: 'verified_success',
      valueDeliveryOutcome: 'paid_conflict',
    }))).toBe('paid_conflict');
  });

  it('does not treat provider success without value delivery as completed', () => {
    expect(resolveRenterCheckoutState(reconciliation({
      paymentState: 'succeeded',
      providerStatus: 'success',
      verification: 'verified_success',
    }))).toBe('checking');
  });

  it.each([
    ['abandoned', 'abandoned'],
    ['failed', 'failed'],
    ['reversed', 'failed'],
  ] as const)('maps provider %s to %s', (providerStatus, expected) => {
    expect(resolveRenterCheckoutState(reconciliation({ providerStatus }))).toBe(expected);
  });

  it.each(['ongoing', 'pending', 'processing', 'queued'] as const)(
    'keeps provider %s pending even after the checkout hold expires',
    (providerStatus) => {
      expect(resolveRenterCheckoutState(reconciliation({ providerStatus }), {
        holdExpiresAt: '2026-09-01T12:00:00.000Z',
        now: new Date('2026-09-01T12:00:01.000Z'),
      })).toBe('pending');
    },
  );

  it('shows an expired hold when no in-flight provider transaction exists', () => {
    expect(resolveRenterCheckoutState(reconciliation({ providerStatus: undefined }), {
      holdExpiresAt: '2026-09-01T12:00:00.000Z',
      now: new Date('2026-09-01T12:00:01.000Z'),
    })).toBe('expired_hold');
  });

  it('keeps active unresolved provider state pending', () => {
    expect(resolveRenterCheckoutState(reconciliation({ providerStatus: 'queued' }), {
      holdExpiresAt: '2026-09-01T12:10:00.000Z',
      now: new Date('2026-09-01T12:00:00.000Z'),
    })).toBe('pending');
  });
});

describe('checkoutStateIsResolved', () => {
  it('keeps checking/pending/expired hold eligible for later reconciliation', () => {
    expect(checkoutStateIsResolved('checking')).toBe(false);
    expect(checkoutStateIsResolved('pending')).toBe(false);
    expect(checkoutStateIsResolved('expired_hold')).toBe(false);
  });

  it('treats provider terminal and trusted value states as resolved', () => {
    expect(checkoutStateIsResolved('payment_received')).toBe(true);
    expect(checkoutStateIsResolved('paid_conflict')).toBe(true);
    expect(checkoutStateIsResolved('abandoned')).toBe(true);
    expect(checkoutStateIsResolved('failed')).toBe(true);
  });
});
