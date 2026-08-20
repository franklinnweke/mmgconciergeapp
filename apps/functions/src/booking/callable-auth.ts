import { BookingCommandError } from './errors.js';

export type CallableAuth = {
  uid: string;
  token: Record<string, unknown>;
} | undefined;

export function requireVerifiedRenter(auth: CallableAuth): string {
  if (!auth?.uid) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to create a booking intent.');
  }
  if (auth.token.email_verified !== true) {
    throw new BookingCommandError('FORBIDDEN', 'Verify your email before creating a booking intent.');
  }
  return auth.uid;
}

export function requirePaidBookingActor(auth: CallableAuth): {
  uid: string;
  isSuperAdmin: boolean;
} {
  if (!auth?.uid) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to respond to booking requests.');
  }
  if (auth.token.email_verified !== true) {
    throw new BookingCommandError(
      'FORBIDDEN',
      'Verify your email before responding to booking requests.',
      { reason: 'email_unverified' },
    );
  }
  return { uid: auth.uid, isSuperAdmin: auth.token.super_admin === true };
}
