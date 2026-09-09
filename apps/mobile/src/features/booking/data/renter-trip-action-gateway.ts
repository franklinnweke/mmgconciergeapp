import { router } from 'expo-router';

import type { BookingIntentGateway } from './booking-intent-gateway-core';
import type { RenterTripAction } from '../domain/renter-trip';

export type RenterTripActionGateway = { perform(action: RenterTripAction, tripId: string): Promise<void> };

export class RenterTripActionUnavailableError extends Error {
  constructor(action: RenterTripAction) {
    super(
      action === 'cancellation'
        ? 'Cancellation requests are not connected in this build. Your journey was not changed.'
        : action === 'release_hold'
          ? 'Hold release is not connected in this view. Open the payment window to release the dates.'
          : 'Live concierge messaging is not connected in this build. No message was sent and no journey state changed.',
    );
    this.name = 'RenterTripActionUnavailableError';
  }
}

export const unavailableRenterTripActionGateway: RenterTripActionGateway = {
  async perform(action) { throw new RenterTripActionUnavailableError(action); },
};

export function createRenterTripActionGateway(intentGateway: BookingIntentGateway): RenterTripActionGateway {
  return {
    async perform(action, tripId): Promise<void> {
      if (action === 'payment') {
        router.push({ pathname: '/booking/payment', params: { journeyId: tripId } } as never);
        return;
      }
      if (action === 'release_hold') { await intentGateway.releaseHold(tripId); return; }
      throw new RenterTripActionUnavailableError(action);
    },
  };
}
