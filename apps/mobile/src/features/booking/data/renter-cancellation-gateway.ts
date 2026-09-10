import {
  cancelBookingCommandSchema,
  cancelBookingResultSchema,
  quoteBookingCancellationCommandSchema,
  quoteBookingCancellationResultSchema,
  type CancelBookingResult,
  type QuoteBookingCancellationResult,
} from '@mmg/contracts/cancellation';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import { parseCallableResult } from '../../../core/firebase/parse-callable-result';
import type { RenterCancellationGateway } from './renter-cancellation-gateway-core';

export type { RenterCancellationGateway } from './renter-cancellation-gateway-core';

function key(bookingId: string): string {
  return `cancel_booking_${bookingId.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 120);
}

export class NativeRenterCancellationGateway implements RenterCancellationGateway {
  private get functions() {
    return getFunctions(undefined, 'africa-south1');
  }

  async quoteBooking(bookingId: string): Promise<QuoteBookingCancellationResult> {
    const parsed = quoteBookingCancellationCommandSchema.parse({
      schemaVersion: 1,
      data: { bookingId },
    });
    const callable = httpsCallable(this.functions, 'quoteBookingCancellation');
    const response = await callable(parsed);
    return parseCallableResult(
      quoteBookingCancellationResultSchema,
      response.data,
      'quoteBookingCancellation',
    );
  }

  async cancelBooking(bookingId: string, expectedVersion: number): Promise<CancelBookingResult> {
    const parsed = cancelBookingCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: key(bookingId),
      data: { bookingId, expectedVersion },
    });
    const callable = httpsCallable(this.functions, 'cancelBooking');
    const response = await callable(parsed);
    return parseCallableResult(cancelBookingResultSchema, response.data, 'cancelBooking');
  }
}

export function createRenterCancellationGateway(): RenterCancellationGateway {
  return new NativeRenterCancellationGateway();
}
