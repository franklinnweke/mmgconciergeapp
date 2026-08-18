import { BookingCommandError } from './errors.js';

export type CallableAuth = {
  uid: string;
  token?: Record<string, unknown>;
} | null | undefined;

export function requireVerifiedRenter(auth: CallableAuth): string {
  if (!auth?.uid) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to create a booking intent.');
  }
  if (auth.token?.email_verified !== true) {
    throw new BookingCommandError('FORBIDDEN', 'Verify your email before creating a booking intent.');
  }
  return auth.uid;
}

export function requireAuthenticatedOwner(auth: CallableAuth): string {
  if (!auth?.uid) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to manage vehicle availability and bookings.');
  }
  if (auth.token?.email_verified !== true) {
    throw new BookingCommandError('FORBIDDEN', 'Verify your email before managing availability.');
  }
  return auth.uid;
}

export function requireBookingAdmin(auth: CallableAuth): {
  uid: string;
  role: 'booking_admin' | 'super_admin';
} {
  if (!auth?.uid) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to perform operations intervention.');
  }

  if (auth.token?.super_admin === true) {
    return { uid: auth.uid, role: 'super_admin' };
  }
  if (auth.token?.booking_admin === true) {
    return { uid: auth.uid, role: 'booking_admin' };
  }

  throw new BookingCommandError('FORBIDDEN', 'Operations staff privileges required for booking intervention.');
}
