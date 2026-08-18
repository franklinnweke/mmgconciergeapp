import { RenterCancelBookingCommand, RenterCancelBookingResult } from '@mmg/contracts';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import type { RenterTripAction } from '../domain/renter-trip';
import { RenterTripActionGateway, RenterTripActionUnavailableError } from './renter-trip-action-gateway';

export class WebRenterTripActionGateway implements RenterTripActionGateway {
  private getFunctionsInstance() {
    return getFunctions(getApp(), 'africa-south1');
  }

  async perform(action: RenterTripAction, tripId: string, options?: { version?: number; reason?: string }): Promise<void> {
    if (action === 'cancellation') {
      const callable = httpsCallable<RenterCancelBookingCommand, RenterCancelBookingResult>(
        this.getFunctionsInstance(),
        'renterCancelBooking',
      );
      const command: RenterCancelBookingCommand = {
        schemaVersion: 1,
        idempotencyKey: `cancel_${tripId}_${Date.now()}`,
        data: {
          bookingId: tripId,
          expectedVersion: options?.version ?? 1,
          reason: options?.reason,
        },
      };
      await callable(command);
      return;
    }

    if (action === 'payment') {
      throw new RenterTripActionUnavailableError(action, 'Payment is finalized during checkout.');
    }

    if (action === 'support') {
      return;
    }

    throw new RenterTripActionUnavailableError(action);
  }
}

export const unavailableRenterTripActionGateway: RenterTripActionGateway = new WebRenterTripActionGateway();
