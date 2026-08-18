import type { BookingTimelineEvent, PaidBookingState, PriceSnapshot } from '@mmg/contracts';

export type AdminBooking = {
  id: string;
  renterReference: string;
  vehicle: {
    id: string;
    displayName: string;
    areaLabel: string;
    categoryLabel: string;
    imageUrl?: string;
  };
  startDate: string;
  endDate: string;
  state: PaidBookingState;
  payment: {
    status: 'verified' | 'refund_pending' | 'refunded';
    referenceSuffix: string;
    verifiedAt: string;
  };
  paymentEnvironment: 'test' | 'live';
  version: number;
  priceSnapshot: PriceSnapshot;
  timeline: readonly BookingTimelineEvent[];
  updatedAt: string;
};

export type AdminBookingAction = 'confirm' | 'reject';

export function permittedAdminActions(booking: AdminBooking): readonly AdminBookingAction[] {
  return booking.state === 'paid_pending_owner' && booking.payment.status === 'verified'
    ? ['confirm', 'reject']
    : [];
}

export function validateRejectionReason(reason: string): string {
  const normalized = reason.trim();
  if (normalized.length < 10 || normalized.length > 500) {
    throw new Error('Rejection reason must be between 10 and 500 characters.');
  }
  return normalized;
}
