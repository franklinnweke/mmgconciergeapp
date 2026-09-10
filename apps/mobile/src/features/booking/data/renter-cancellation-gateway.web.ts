import type {
  CancelBookingResult,
  QuoteBookingCancellationResult,
} from '@mmg/contracts/cancellation';

import type { RenterCancellationGateway } from './renter-cancellation-gateway-core';

export type { RenterCancellationGateway } from './renter-cancellation-gateway-core';

export class WebRenterCancellationGateway implements RenterCancellationGateway {
  private unavailable(): never {
    throw new Error(
      process.env.NODE_ENV === 'production'
        ? 'Booking cancellation is unavailable in this web release.'
        : 'Sample cancellation does not change live data. Use a native build.',
    );
  }

  async quoteBooking(_bookingId: string): Promise<QuoteBookingCancellationResult> {
    this.unavailable();
  }

  async cancelBooking(_bookingId: string, _expectedVersion: number): Promise<CancelBookingResult> {
    this.unavailable();
  }
}

export function createRenterCancellationGateway(): RenterCancellationGateway {
  return new WebRenterCancellationGateway();
}
