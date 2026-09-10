import type {
  CancelBookingResult,
  QuoteBookingCancellationResult,
} from '@mmg/contracts/cancellation';

export interface RenterCancellationGateway {
  quoteBooking(bookingId: string): Promise<QuoteBookingCancellationResult>;
  cancelBooking(bookingId: string, expectedVersion: number): Promise<CancelBookingResult>;
}
