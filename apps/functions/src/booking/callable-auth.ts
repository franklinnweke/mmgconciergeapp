import { BookingCommandError } from './errors.js';

export type CallableAuth = {
  uid: string;
  token: Record<string, unknown>;
} | undefined;

export type CheckoutRenter = {
  uid: string;
  email: string;
  phoneNumber: string;
};

export function requireVerifiedRenter(auth: CallableAuth): string {
  if (!auth?.uid) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to create a booking intent.');
  }
  if (auth.token.email_verified !== true) {
    throw new BookingCommandError('FORBIDDEN', 'Verify your email before creating a booking intent.');
  }
  return auth.uid;
}

export function requireCheckoutRenter(auth: CallableAuth): CheckoutRenter {
  if (!auth?.uid) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to continue to payment.');
  }
  if (auth.token.email_verified !== true) {
    throw new BookingCommandError(
      'FORBIDDEN',
      'Verify your email before continuing to payment.',
      { reason: 'email_unverified' },
    );
  }

  const email = typeof auth.token.email === 'string' ? auth.token.email.trim().toLowerCase() : '';
  if (!email) {
    throw new BookingCommandError(
      'PROFILE_INCOMPLETE',
      'A verified renter email is required before checkout.',
      { reason: 'email_unverified' },
    );
  }

  const phoneNumber =
    typeof auth.token.phone_number === 'string' ? auth.token.phone_number.trim() : '';
  if (!phoneNumber) {
    throw new BookingCommandError(
      'PROFILE_INCOMPLETE',
      'Verify your phone number before checkout.',
      { reason: 'phone_unverified' },
    );
  }

  return { uid: auth.uid, email, phoneNumber };
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
