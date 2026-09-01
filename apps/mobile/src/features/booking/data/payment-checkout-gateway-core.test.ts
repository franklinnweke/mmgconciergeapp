import { describe, expect, it } from 'vitest';

import { PaymentCheckoutSubmissionKeys } from './payment-checkout-gateway-core';

describe('PaymentCheckoutSubmissionKeys', () => {
  it('reuses one initialization key for retries of the same intent', () => {
    const generated: string[] = [];
    const keys = new PaymentCheckoutSubmissionKeys((prefix) => {
      const value = `${prefix}-${generated.length + 1}`;
      generated.push(value);
      return value;
    });

    expect(keys.forInitialization('intent-one')).toBe('payment_init-1');
    expect(keys.forInitialization('intent-one')).toBe('payment_init-1');
    expect(keys.forInitialization('intent-two')).toBe('payment_init-2');
  });

  it('uses a fresh reconciliation key for every provider-status poll', () => {
    let count = 0;
    const keys = new PaymentCheckoutSubmissionKeys((prefix) => `${prefix}-${++count}`);

    expect(keys.forReconciliation()).toBe('payment_reconcile-1');
    expect(keys.forReconciliation()).toBe('payment_reconcile-2');
  });

  it('can reset an initialization session after the renter starts over', () => {
    let count = 0;
    const keys = new PaymentCheckoutSubmissionKeys((prefix) => `${prefix}-${++count}`);

    expect(keys.forInitialization('intent-one')).toBe('payment_init-1');
    keys.reset('intent-one');
    expect(keys.forInitialization('intent-one')).toBe('payment_init-2');
  });
});
