import {
  BookingCommandError,
  staffConfirmBookingCommandSchema,
  type StaffConfirmBookingResult,
} from '@mmg/contracts';

import type { BookingRepository } from './booking-repository.js';
import { requireBookingAdmin, type CallableAuth } from './callable-auth.js';
import {
  confirmPaidBooking,
  type ConfirmPaidBookingDependencies,
} from './confirm-paid-booking.js';

export type StaffConfirmBookingDependencies = ConfirmPaidBookingDependencies;

export async function staffConfirmBooking(
  untrustedCommand: unknown,
  authContext: CallableAuth,
  dependencies: StaffConfirmBookingDependencies,
): Promise<StaffConfirmBookingResult> {
  const staff = requireBookingAdmin(authContext);

  const parsed = staffConfirmBookingCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Staff confirm booking command is invalid.');
  }

  return confirmPaidBooking(
    parsed.data,
    { id: staff.uid, type: 'admin' },
    dependencies,
  );
}
