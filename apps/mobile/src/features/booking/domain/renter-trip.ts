import {
  bookingIntentStateSchema,
  paidBookingStateSchema,
  type BookingIntentState,
  type BookingRequest,
  type PaidBookingState,
  type PriceSnapshot,
  type RenterVisibleBooking,
  type RenterVisibleBookingIntent,
  type RenterVehicleSnapshot,
} from '@mmg/contracts';
import type { PickupLocationSnapshot, RentalRequestState } from '@mmg/contracts/rental-request';

export type RenterTripState =
  | BookingIntentState
  | PaidBookingState
  | RentalRequestState
  | 'legacy_availability_requested';
export type RenterTripGroup = 'active' | 'upcoming' | 'intervention' | 'past';
export type RenterTripAction = 'payment' | 'support' | 'cancellation';
export type RenterTripTimelineStatus = 'complete' | 'current' | 'upcoming';
export type RenterTripSource = 'trusted' | 'legacy' | 'preview' | 'request';

export const allRenterTripStates = [
  'intent_created',
  'checkout_pending',
  'paid',
  'expired',
  'failed',
  'invalid',
  'paid_conflict',
  'paid_pending_owner',
  'confirmed',
  'intervention_required',
  'cancelled',
  'refund_pending',
  'refunded',
  'in_progress',
  'completion_pending',
  'completed',
  'legacy_availability_requested',
  'requested',
  'approved',
  'ready_for_payment',
  'cancellation_requested',
  'cancelled_by_renter',
  'declined',
  'payment_window_expired',
  'needs_attention',
] as const satisfies readonly RenterTripState[];

export const renterTripGroupCopy: Record<RenterTripGroup, string> = {
  active: 'Active requests',
  upcoming: 'Upcoming',
  intervention: 'Needs attention',
  past: 'Past',
};

export type RenterTripTimelineItem = {
  id: 'request' | 'checkout' | 'payment' | 'owner' | 'journey' | 'resolution';
  label: string;
  detail: string;
  status: RenterTripTimelineStatus;
};

export type RenterTrip = {
  id: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  state: RenterTripState;
  priceSnapshot: PriceSnapshot;
  group: RenterTripGroup;
  updatedAt: string;
  source: RenterTripSource;
  vehicleSnapshot: RenterVehicleSnapshot;
  supersedesId?: string;
  intentId?: string;
  holdExpiresAt?: string;
  bookingId?: string;
  requestVersion?: number;
  pickupLocation?: PickupLocationSnapshot;
  confirmedPickupTime?: string;
};

const legacyState = {
  availability_requested: 'legacy_availability_requested',
  payment_required: 'checkout_pending',
  confirmed: 'paid_pending_owner',
  booked: 'confirmed',
} as const;

const terminalStates: readonly RenterTripState[] = [
  'completed',
  'cancelled',
  'cancelled_by_renter',
  'refunded',
  'expired',
  'failed',
  'invalid',
  'declined',
  'payment_window_expired',
];

export function isTerminalState(state: RenterTripState): boolean {
  return terminalStates.includes(state);
}

export function stateGroup(state: RenterTripState): RenterTripGroup {
  if (state === 'intervention_required' || state === 'paid_conflict' || state === 'needs_attention') {
    return 'intervention';
  }
  if (state === 'confirmed') return 'upcoming';
  if (terminalStates.includes(state)) return 'past';
  return 'active';
}

export function permittedRenterActions(state: RenterTripState): readonly RenterTripAction[] {
  if (state === 'intent_created') return ['cancellation'];
  if (state === 'requested' || state === 'approved') return ['cancellation'];
  if (state === 'ready_for_payment') return ['payment', 'cancellation'];
  if (state === 'checkout_pending') return ['payment', 'support'];
  if (state === 'paid_pending_owner' || state === 'confirmed') return ['support', 'cancellation'];
  if (
    state === 'intervention_required' ||
    state === 'paid_conflict' ||
    state === 'needs_attention' ||
    state === 'cancellation_requested' ||
    state === 'refund_pending' ||
    state === 'legacy_availability_requested' ||
    state === 'paid' ||
    state === 'in_progress' ||
    state === 'completion_pending'
  ) {
    return ['support'];
  }
  return [];
}

export function tripStateCopy(state: RenterTripState): {
  label: string;
  title: string;
  body: string;
} {
  const copy: Record<RenterTripState, { label: string; title: string; body: string }> = {
    legacy_availability_requested: {
      label: 'Request received',
      title: 'Your request is with MMG.',
      body: 'This earlier estimate holds no dates, takes no payment, and creates no confirmation.',
    },
    intent_created: {
      label: 'Dates held',
      title: 'Dates held briefly.',
      body: 'Review the verified total before secure checkout becomes available.',
    },
    checkout_pending: {
      label: 'Payment processing',
      title: 'Secure checkout is the next step.',
      body: 'Your booking is not paid or confirmed until the provider verifies payment.',
    },
    paid: {
      label: 'Payment processing',
      title: 'Payment has been verified.',
      body: 'MMG is creating the paid booking record for owner response.',
    },
    expired: {
      label: 'Hold expired',
      title: 'This date hold has expired.',
      body: 'Return to the fleet to request current availability and pricing.',
    },
    failed: {
      label: 'Payment failed',
      title: 'Payment was not completed.',
      body: 'No booking confirmation was created. You can contact concierge for help.',
    },
    invalid: {
      label: 'Review required',
      title: 'This request needs review.',
      body: 'MMG could not safely continue with the supplied booking details.',
    },
    paid_conflict: {
      label: 'Needs attention',
      title: 'Payment needs concierge attention.',
      body: 'Payment arrived after the date hold changed. MMG will resolve or refund it.',
    },
    paid_pending_owner: {
      label: 'Confirming availability',
      title: 'Paid — awaiting vehicle confirmation.',
      body: 'The verified payment is held while the owner confirms the vehicle and chauffeur.',
    },
    confirmed: {
      label: 'Confirmed',
      title: 'Your arrival is confirmed.',
      body: 'The vehicle and chauffeur are reserved for your journey.',
    },
    intervention_required: {
      label: 'Needs attention',
      title: 'MMG is resolving an issue.',
      body: 'A concierge specialist is reviewing the booking and will provide the next safe option.',
    },
    cancelled: {
      label: 'Cancelled',
      title: 'This journey is cancelled.',
      body: 'Any eligible refund is tracked separately and is not complete unless shown as refunded.',
    },
    refund_pending: {
      label: 'Refund pending',
      title: 'Your cancellation is being reviewed.',
      body: 'Payment was captured. MMG is reviewing the refund consequence under the policy saved with this booking.',
    },
    refunded: {
      label: 'Refunded',
      title: 'The refund is complete.',
      body: 'The payment provider has reported this booking as refunded.',
    },
    in_progress: {
      label: 'In progress',
      title: 'Your journey is underway.',
      body: 'Concierge support remains available throughout the booking.',
    },
    completion_pending: {
      label: 'Trip ending',
      title: 'Confirm your journey is complete.',
      body: 'The booking closes once you or MMG confirms the journey ended as planned.',
    },
    completed: {
      label: 'Completed',
      title: 'Journey complete.',
      body: 'Thank you for travelling with MMG Concierge.',
    },
    requested: {
      label: 'Request received',
      title: 'Request received — MMG is confirming.',
      body: 'No payment has been taken and the dates are not locked. You can cancel this request.',
    },
    approved: {
      label: 'Confirming availability',
      title: 'Your request is approved.',
      body: 'MMG will contact you before payment is opened. No payment window yet, and you can still cancel.',
    },
    ready_for_payment: {
      label: 'Payment ready',
      title: 'Vehicle available for payment.',
      body: 'Complete payment within 30 minutes, or cancel the request before checkout begins.',
    },
    cancellation_requested: {
      label: 'Cancellation requested',
      title: 'Your cancellation request is recorded.',
      body: 'Payment processing had already started, so MMG is preserving the dates until Paystack resolves. If payment succeeds, the booking will move to refund review.',
    },
    cancelled_by_renter: {
      label: 'Cancelled',
      title: 'You cancelled this request.',
      body: 'No payment is due. Any temporary date hold tied to this request has been released.',
    },
    declined: {
      label: 'Declined',
      title: 'This request was declined.',
      body: 'No payment was taken and the dates were not locked.',
    },
    payment_window_expired: {
      label: 'Payment window expired',
      title: 'The payment window expired.',
      body: 'Dates were released. No charge was taken. You can send a new request.',
    },
    needs_attention: {
      label: 'Needs attention',
      title: 'MMG Concierge is resolving the booking.',
      body: 'A payment was recorded but the booking could not be completed automatically.',
    },
  };
  return copy[state];
}

export function renterTripTimeline(state: RenterTripState): readonly RenterTripTimelineItem[] {
  const item = (
    id: RenterTripTimelineItem['id'],
    label: string,
    detail: string,
    status: RenterTripTimelineStatus,
  ): RenterTripTimelineItem => ({ id, label, detail, status });

  if (state === 'legacy_availability_requested') {
    return [item('request', 'Availability requested', 'Saved as an estimate only. No dates are held.', 'current')];
  }
  if (state === 'requested') {
    return [
      item('request', 'Request sent', 'MMG received your request. Dates are not locked.', 'current'),
      item('checkout', 'MMG confirmation', 'MMG will contact you before opening payment.', 'upcoming'),
      item('payment', 'Payment', '30-minute payment window opens once ready.', 'upcoming'),
      item('journey', 'Confirmed trip', 'Vehicle and chauffeur reserved.', 'upcoming'),
    ];
  }
  if (state === 'approved') {
    return [
      item('request', 'Request sent', 'MMG received your request.', 'complete'),
      item('checkout', 'MMG confirmation', 'Request approved. MMG will contact you before payment.', 'current'),
      item('payment', 'Payment', '30-minute payment window opens once ready.', 'upcoming'),
      item('journey', 'Confirmed trip', 'Vehicle and chauffeur reserved.', 'upcoming'),
    ];
  }
  if (state === 'ready_for_payment') {
    return [
      item('request', 'Request sent', 'MMG received your request.', 'complete'),
      item('owner', 'MMG confirmation', 'Vehicle available for your dates.', 'complete'),
      item('checkout', 'Complete payment', 'You have 30 minutes to complete secure payment.', 'current'),
      item('journey', 'Confirmed trip', 'Vehicle and chauffeur reserved.', 'upcoming'),
    ];
  }
  if (state === 'cancellation_requested') {
    return [
      item('checkout', 'Payment resolving', 'MMG will not release the hold underneath an in-flight payment.', 'complete'),
      item('resolution', 'Cancellation pending', 'The request will resolve after Paystack reaches a safe terminal outcome.', 'current'),
    ];
  }
  if (state === 'cancelled_by_renter') {
    return [item('resolution', 'Request cancelled', 'The request is closed and any safe temporary hold was released.', 'complete')];
  }
  if (state === 'declined') {
    return [item('resolution', 'Request declined', 'No payment was taken and the dates were not locked.', 'complete')];
  }
  if (state === 'payment_window_expired') {
    return [item('resolution', 'Payment window expired', 'Dates were released. No charge was taken.', 'complete')];
  }
  if (state === 'needs_attention') {
    return [
      item('payment', 'Payment recorded', 'A payment was recorded against this request.', 'complete'),
      item('resolution', 'Concierge intervention', 'MMG is resolving the booking. Confirmation is not complete.', 'current'),
    ];
  }
  if (state === 'intent_created') {
    return [
      item('request', 'Booking intent created', 'Pricing and dates were checked by MMG.', 'complete'),
      item('checkout', 'Secure checkout', 'Checkout has not started.', 'upcoming'),
    ];
  }
  if (state === 'checkout_pending') {
    return [
      item('request', 'Booking intent created', 'Pricing and dates were checked by MMG.', 'complete'),
      item('checkout', 'Secure checkout', 'Payment has not been verified.', 'current'),
      item('owner', 'Reservation confirmation', 'Begins only after verified payment.', 'upcoming'),
    ];
  }
  if (state === 'paid') {
    return [
      item('request', 'Booking intent created', 'Pricing and dates were checked by MMG.', 'complete'),
      item('payment', 'Payment verified', 'The provider reported a successful payment.', 'complete'),
      item('owner', 'Create paid booking', 'MMG is completing the trusted booking record.', 'current'),
    ];
  }
  if (state === 'paid_pending_owner') {
    return [
      item('payment', 'Payment verified', 'The provider reported a successful payment.', 'complete'),
      item('owner', 'Owner confirmation', 'Vehicle and chauffeur response is pending.', 'current'),
      item('journey', 'Journey', 'Starts after owner confirmation.', 'upcoming'),
    ];
  }
  if (
    state === 'confirmed' ||
    state === 'in_progress' ||
    state === 'completion_pending' ||
    state === 'completed'
  ) {
    return [
      item('payment', 'Payment verified', 'The provider reported a successful payment.', 'complete'),
      item('owner', 'Reservation confirmed', 'Vehicle and chauffeur were reserved.', 'complete'),
      item(
        'journey',
        state === 'completed'
          ? 'Journey complete'
          : state === 'completion_pending'
            ? 'Awaiting completion confirmation'
            : state === 'in_progress'
              ? 'Journey underway'
              : 'Journey scheduled',
        state === 'completed'
          ? 'The booked journey has ended.'
          : state === 'completion_pending'
            ? 'Confirm the journey ended as planned to close this booking.'
            : state === 'in_progress'
              ? 'Concierge remains available.'
              : 'Arrival details are confirmed.',
        state === 'completed' ? 'complete' : 'current',
      ),
    ];
  }
  if (state === 'refund_pending' || state === 'refunded') {
    return [
      item('payment', 'Payment verified', 'A payment was recorded for this booking.', 'complete'),
      item(
        'resolution',
        state === 'refunded' ? 'Refund complete' : 'Refund review pending',
        state === 'refunded'
          ? 'The provider reported the refund as complete.'
          : 'MMG is reviewing the amount due under the saved cancellation policy.',
        state === 'refunded' ? 'complete' : 'current',
      ),
    ];
  }
  if (state === 'paid_conflict' || state === 'intervention_required') {
    return [
      item('payment', 'Payment recorded', 'A payment was recorded against this journey.', 'complete'),
      item(
        'resolution',
        'Concierge intervention',
        'Review has started. Resolution or refund is not confirmed.',
        'current',
      ),
    ];
  }
  if (state === 'cancelled') {
    return [item('resolution', 'Journey cancelled', 'Refund status, when applicable, is tracked separately.', 'complete')];
  }
  return [
    item(
      'resolution',
      state === 'expired' ? 'Date hold expired' : state === 'failed' ? 'Checkout failed' : 'Request needs review',
      tripStateCopy(state).body,
      'current',
    ),
  ];
}

function legacyPrice(request: BookingRequest): PriceSnapshot {
  const serviceFeeKobo = Math.max(0, request.totalKobo - request.dailyRateKobo * request.durationDays);
  return {
    currency: 'NGN',
    chargedDays: request.durationDays,
    ownerDailyRateKobo: request.dailyRateKobo,
    baseRentalKobo: request.dailyRateKobo * request.durationDays,
    deliveryFeeKobo: 0,
    serviceFeeBps: 800,
    serviceFeeFixedKobo: 0,
    serviceFeeKobo,
    ownerCommissionBps: 0,
    ownerCommissionKobo: 0,
    ownerEarningsKobo: request.dailyRateKobo * request.durationDays,
    renterTotalKobo: request.totalKobo,
    configVersion: 'legacy-estimate',
    termsVersion: 'legacy-request',
    cancellationPolicyVersion: 'legacy-request',
  };
}

export function mapLegacyBookingRequest(request: BookingRequest): RenterTrip {
  const state = legacyState[request.status];
  return {
    id: request.id,
    vehicleId: request.vehicleId,
    startDate: request.pickupAt.slice(0, 10),
    endDate: request.returnAt.slice(0, 10),
    state,
    priceSnapshot: legacyPrice(request),
    group: stateGroup(state),
    updatedAt: request.updatedAt,
    source: 'legacy',
    vehicleSnapshot: {
      displayName: 'Requested vehicle',
      areaLabel: 'Lagos',
      categoryLabel: 'Chauffeur-ready vehicle',
      imageKey: 'hero-suv',
    },
  };
}

export function mapTrustedBookingIntent(record: RenterVisibleBookingIntent): RenterTrip {
  const state = record.state === 'expired' && record.cancelledByRenterAt ? 'cancelled_by_renter' : record.state;
  return {
    id: record.id,
    vehicleId: record.vehicleId,
    startDate: record.startDate,
    endDate: record.endDate,
    state,
    priceSnapshot: record.priceSnapshot,
    group: stateGroup(state),
    updatedAt: record.updatedAt,
    source: 'trusted',
    vehicleSnapshot: record.vehicleSnapshot,
  };
}

export function mapTrustedBooking(record: RenterVisibleBooking): RenterTrip {
  return {
    id: record.id,
    vehicleId: record.vehicleId,
    startDate: record.startDate,
    endDate: record.endDate,
    state: record.state,
    priceSnapshot: record.priceSnapshot,
    group: stateGroup(record.state),
    updatedAt: record.updatedAt,
    source: 'trusted',
    vehicleSnapshot: record.vehicleSnapshot,
    supersedesId: record.intentId,
  };
}

export function isPaidBookingState(state: RenterTripState): state is PaidBookingState {
  return paidBookingStateSchema.safeParse(state).success;
}

export function isBookingIntentState(state: RenterTripState): state is BookingIntentState {
  return bookingIntentStateSchema.safeParse(state).success;
}

export function groupTripsForDisplay(trips: readonly RenterTrip[]) {
  return (['active', 'upcoming', 'intervention', 'past'] as const)
    .map((group) => ({
      group,
      label: renterTripGroupCopy[group],
      trips: trips.filter((trip) => trip.group === group),
    }))
    .filter((section) => section.trips.length);
}
