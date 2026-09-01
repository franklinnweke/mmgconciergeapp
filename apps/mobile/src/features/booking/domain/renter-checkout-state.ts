import type { ReconcilePaymentResult } from '@mmg/contracts/payment';

export type RenterCheckoutState =
  | 'checking'
  | 'pending'
  | 'payment_received'
  | 'paid_conflict'
  | 'abandoned'
  | 'failed'
  | 'expired_hold';

export function resolveRenterCheckoutState(
  reconciliation: ReconcilePaymentResult,
  options: { holdExpiresAt?: string; now?: Date } = {},
): RenterCheckoutState {
  const result = reconciliation.result;

  if (result.valueDeliveryOutcome === 'paid_pending_owner') return 'payment_received';
  if (result.valueDeliveryOutcome === 'paid_conflict') return 'paid_conflict';

  if (result.paymentState === 'succeeded') {
    // A succeeded payment without R4 delivery should never be presented as a
    // completed ride. Keep checking/fail closed until trusted delivery resolves.
    return 'checking';
  }

  if (result.providerStatus === 'abandoned') return 'abandoned';
  if (result.providerStatus === 'failed' || result.providerStatus === 'reversed') return 'failed';

  const now = options.now ?? new Date();
  if (
    options.holdExpiresAt &&
    Number.isFinite(Date.parse(options.holdExpiresAt)) &&
    Date.parse(options.holdExpiresAt) <= now.getTime()
  ) {
    return 'expired_hold';
  }

  if (
    result.providerStatus === 'ongoing' ||
    result.providerStatus === 'pending' ||
    result.providerStatus === 'processing' ||
    result.providerStatus === 'queued'
  ) {
    return 'pending';
  }

  return 'checking';
}

export function checkoutStateIsResolved(state: RenterCheckoutState): boolean {
  return state === 'payment_received' ||
    state === 'paid_conflict' ||
    state === 'abandoned' ||
    state === 'failed';
}
