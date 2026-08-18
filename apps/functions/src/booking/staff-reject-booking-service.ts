import {
  BookingCommandError,
  staffRejectBookingCommandSchema,
  type StaffRejectBookingResult,
} from '@mmg/contracts';

import type { BookingRepository } from './booking-repository.js';
import { requireBookingAdmin, type CallableAuth } from './callable-auth.js';
import {
  rejectPaidBooking,
  type RejectPaidBookingDependencies,
} from './reject-paid-booking.js';

export type StaffRejectBookingDependencies = RejectPaidBookingDependencies;

export async function staffRejectBooking(
  untrustedCommand: unknown,
  authContext: CallableAuth,
  dependencies: StaffRejectBookingDependencies,
): Promise<StaffRejectBookingResult> {
  const staff = requireBookingAdmin(authContext);

  const parsed = staffRejectBookingCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Staff reject booking command is invalid.');
  }

  return rejectPaidBooking(
    parsed.data,
    { id: staff.uid, type: 'admin' },
    dependencies,
  );
}
