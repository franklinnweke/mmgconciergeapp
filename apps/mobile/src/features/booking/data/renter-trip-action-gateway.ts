import type { BookingIntentGateway } from './booking-intent-gateway-core';
import type { RenterTripAction } from '../domain/renter-trip';

export type RenterTripActionGateway = {
  perform(action: RenterTripAction, tripId: string): Promise<void>;
};

export class RenterTripActionUnavailableError extends Error {
  constructor(action: RenterTripAction) {
    super(
      action === 'payment'
        ? 'Secure payment is not connected in this build. No charge was attempted.'
        : action === 'cancellation'
          ? 'Cancellation requests are not connected in this build. Your journey was not changed.'
          : action === 'release_hold'
            ? 'Hold release is not connected in this build. Your dates are still held.'
            : 'Live concierge messaging is not connected in this build. No message was sent and no journey state changed.',
    );
    this.name = 'RenterTripActionUnavailableError';
  }
}

export const unavailableRenterTripActionGateway: RenterTripActionGateway = {
  async perform(action) {
    throw new RenterTripActionUnavailableError(action);
  },
};

export function createRenterTripActionGateway(
  intentGateway: BookingIntentGateway,
): RenterTripActionGateway {
  return {
    async perform(action: RenterTripAction, tripId: string): Promise<void> {
      if (action === 'release_hold') {
        await intentGateway.releaseHold(tripId);
        return;
      }
      throw new RenterTripActionUnavailableError(action);
    },
  };
}
