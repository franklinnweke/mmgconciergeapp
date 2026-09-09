import type {
  InitializeBookingPaymentResult,
  ReconcilePaymentResult,
} from '@mmg/contracts/payment';

export type PaymentCheckoutMode = 'pay_first' | 'request_first';

export interface PaymentCheckoutGateway {
  initializePayment(
    intentId: string,
    idempotencyKey: string,
    mode?: PaymentCheckoutMode,
  ): Promise<InitializeBookingPaymentResult>;
  reconcilePayment(intentId: string, idempotencyKey: string): Promise<ReconcilePaymentResult>;
}

type IdempotencyKeyFactory = (prefix: string) => string;

function defaultIdempotencyKeyFactory(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Initialization retries for one intent reuse a key so hosted checkout is never
 * duplicated. Reconciliation intentionally gets a fresh command key per poll;
 * provider status must be allowed to advance between polls.
 */
export class PaymentCheckoutSubmissionKeys {
  private initializeKeyByIntent = new Map<string, string>();

  constructor(private readonly createKey: IdempotencyKeyFactory = defaultIdempotencyKeyFactory) {}

  forInitialization(intentId: string): string {
    const existing = this.initializeKeyByIntent.get(intentId);
    if (existing) return existing;
    const created = this.createKey('payment_init');
    this.initializeKeyByIntent.set(intentId, created);
    return created;
  }

  forReconciliation(): string {
    return this.createKey('payment_reconcile');
  }

  reset(intentId: string): void {
    this.initializeKeyByIntent.delete(intentId);
  }
}
