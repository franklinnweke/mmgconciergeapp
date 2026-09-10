import {
  dateOnlySchema,
  paidBookingStateSchema,
  priceSnapshotSchema,
} from '@mmg/contracts';
import {
  quoteBookingCancellationResultSchema,
  type QuoteBookingCancellationResult,
} from '@mmg/contracts/cancellation';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

import { BookingCommandError } from './errors.js';

const bookingQuoteSchema = z.object({
  bookingId: z.string().min(1).max(128),
  renterId: z.string().min(1).max(128),
  startDate: dateOnlySchema,
  state: paidBookingStateSchema,
  version: z.number().int().positive(),
  priceSnapshot: priceSnapshotSchema,
}).passthrough();

function dateOnlyInLagos(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Read-only cancellation quote boundary. It intentionally returns the current
 * booking version so the later cancellation command can use optimistic
 * locking without exposing version fields in the general renter booking view.
 */
export class FirestoreBookingCancellationQuoteQuery {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  async quote(bookingId: string, renterId: string, now: Date): Promise<QuoteBookingCancellationResult> {
    const snapshot = await this.firestore.doc(`bookings/${bookingId}`).get();
    const parsed = bookingQuoteSchema.safeParse(snapshot.data());
    if (!snapshot.exists || !parsed.success) {
      throw new BookingCommandError('NOT_FOUND', 'Booking was not found.');
    }
    const booking = parsed.data;
    if (booking.renterId !== renterId) {
      throw new BookingCommandError('FORBIDDEN', 'You cannot cancel this booking.');
    }

    const futureJourney = booking.startDate > dateOnlyInLagos(now);
    const cancellableState = booking.state === 'confirmed' || booking.state === 'paid_pending_owner';
    const selfServiceAllowed = futureJourney && cancellableState;
    const cancellationPolicyVersion = booking.priceSnapshot.cancellationPolicyVersion;

    return quoteBookingCancellationResultSchema.parse({
      quote: {
        bookingId: booking.bookingId,
        bookingState: booking.state,
        bookingVersion: booking.version,
        startDate: booking.startDate,
        amountPaidKobo: booking.priceSnapshot.renterTotalKobo,
        currency: 'NGN',
        cancellationPolicyVersion,
        financialOutcome: 'manual_review_required',
        estimatedRefundKobo: null,
        estimatedCancellationFeeKobo: null,
        selfServiceAllowed,
        inventoryAction: selfServiceAllowed ? 'release_on_confirmation' : 'manual_review',
        consequenceText: selfServiceAllowed
          ? `Payment has already been captured. Cancelling releases the future reservation and sends the refund amount for manual review under policy ${cancellationPolicyVersion}; no refund amount is promised until that review is completed.`
          : 'This booking is too close to, already in, or outside the self-service cancellation stage. Concierge must review the operational and refund consequences before inventory changes.',
      },
    });
  }
}
