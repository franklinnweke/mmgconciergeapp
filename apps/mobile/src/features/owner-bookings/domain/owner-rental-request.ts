import type { OwnerVisibleRentalRequest, RentalRequestState } from '@mmg/contracts/rental-request';

export function canOwnerRespondToRequest(request: OwnerVisibleRentalRequest): boolean {
  return request.state === 'requested';
}

export function ownerRequestStateCopy(state: RentalRequestState): { label: string; body: string } {
  const copy: Record<RentalRequestState, { label: string; body: string }> = {
    requested: {
      label: 'Awaiting your response',
      body: 'Accepting does not lock dates or start payment. MMG will contact the renter before payment is opened.',
    },
    approved: {
      label: 'Approved',
      body: 'MMG will contact the renter before opening a 30-minute payment window.',
    },
    ready_for_payment: {
      label: 'Payment window open',
      body: 'The renter has 30 minutes to pay. Dates are held only for this window.',
    },
    declined: {
      label: 'Declined',
      body: 'This request was declined. No payment was taken.',
    },
    payment_window_expired: {
      label: 'Payment window expired',
      body: 'The renter did not complete payment in time. Dates were released.',
    },
    confirmed: {
      label: 'Confirmed',
      body: 'Payment was verified and the booking is secured.',
    },
    needs_attention: {
      label: 'Needs attention',
      body: 'MMG Concierge is resolving this booking.',
    },
  };
  return copy[state];
}

export function isOwnerDeclineReasonValid(reason: string): boolean {
  const length = reason.trim().length;
  return length === 0 || (length >= 3 && length <= 500);
}
