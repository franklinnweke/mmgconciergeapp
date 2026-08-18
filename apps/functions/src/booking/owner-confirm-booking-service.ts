import {
  BookingCommandError,
  ownerConfirmBookingCommandSchema,
  type OwnerConfirmBookingResult,
} from '@mmg/contracts';

import type { BookingRepository } from './booking-repository.js';
import {
  confirmPaidBooking,
  type ConfirmPaidBookingDependencies,
} from './confirm-paid-booking.js';

export type OwnerConfirmBookingDependencies = ConfirmPaidBookingDependencies;

export async function ownerConfirmBooking(
  untrustedCommand: unknown,
  authenticatedOwnerId: string,
  dependencies: OwnerConfirmBookingDependencies,
): Promise<OwnerConfirmBookingResult> {
  if (!authenticatedOwnerId) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to confirm booking requests.');
  }

  const parsed = ownerConfirmBookingCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Confirm booking command is invalid.');
  }

  return confirmPaidBooking(
    parsed.data,
    { id: authenticatedOwnerId, type: 'owner' },
    dependencies,
  );
}
