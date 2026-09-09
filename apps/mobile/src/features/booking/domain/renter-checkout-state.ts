import type { ReconcilePaymentResult } from '@mmg/contracts/payment';

export type RenterCheckoutState = 'checking' | 'pending' | 'payment_received' | 'paid_conflict' | 'abandoned' | 'failed' | 'expired_hold';

export function resolveRenterCheckoutState(
  reconciliation: ReconcilePaymentResult,
  options: { holdExpiresAt?: string; now?: Date } = {},
): RenterCheckoutState {
  const result = reconciliation.result;
  if (result.valueDeliveryOutcome === 'confirmed' || result.valueDeliveryOutcome === 'paid_pending_owner') return 'payment_received';
  if (result.valueDeliveryOutcome === 'paid_conflict') return 'paid_conflict';
  if (result.paymentState === 'succeeded') return 'checking';
  if (result.providerStatus === 'abandoned') return 'abandoned';
  if (result.providerStatus === 'failed' || result.providerStatus === 'reversed') return 'failed';
  if (['ongoing', 'pending', 'processing', 'queued'].includes(result.providerStatus)) return 'pending';
  const now = options.now ?? new Date();
  if (options.holdExpiresAt && Number.isFinite(Date.parse(options.holdExpiresAt)) && Date.parse(options.holdExpiresAt) <= now.getTime()) return 'expired_hold';
  return 'checking';
}

export function checkoutStateIsResolved(state: RenterCheckoutState): boolean {
  return state === 'payment_received' || state === 'paid_conflict' || state === 'abandoned' || state === 'failed';
}
