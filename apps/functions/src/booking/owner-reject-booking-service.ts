import {
  BookingCommandError,
  ownerRejectBookingCommandSchema,
  type OwnerRejectBookingResult,
} from '@mmg/contracts';

import type { BookingRepository } from './booking-repository.js';
import {
  rejectPaidBooking,
  type RejectPaidBookingDependencies,
} from './reject-paid-booking.js';

export type OwnerRejectBookingDependencies = RejectPaidBookingDependencies;

export async function ownerRejectBooking(
  untrustedCommand: unknown,
  authenticatedOwnerId: string,
  dependencies: OwnerRejectBookingDependencies,
): Promise<OwnerRejectBookingResult> {
  if (!authenticatedOwnerId) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to respond to booking requests.');
  }

  const parsed = ownerRejectBookingCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Reject booking command is invalid.');
  }

  return rejectPaidBooking(
    parsed.data,
    { id: authenticatedOwnerId, type: 'owner' },
    dependencies,
  );
}
