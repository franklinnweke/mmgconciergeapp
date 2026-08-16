import { nigerianE164Schema } from '@mmg/contracts';

import { CommandError } from '../errors.js';

export type CallableAuth = {
  uid: string;
  token: Record<string, unknown>;
} | undefined;

export function requireAuthenticatedUser(auth: CallableAuth): string {
  if (!auth?.uid) {
    throw new CommandError('UNAUTHENTICATED', 'Sign in to continue.');
  }
  return auth.uid;
}

export function requireVerifiedEmailOwnerAuth(auth: CallableAuth): {
  uid: string;
  email: string;
  phoneE164?: string;
} {
  const uid = requireAuthenticatedUser(auth);
  if (!auth) {
    throw new CommandError('UNAUTHENTICATED', 'Sign in to continue.');
  }
  if (auth.token.email_verified !== true) {
    throw new CommandError(
      'FORBIDDEN',
      'Verify your email before completing your owner profile.',
      { reason: 'email_unverified' },
    );
  }
  if (typeof auth.token.email !== 'string' || !auth.token.email.trim()) {
    throw new CommandError(
      'FORBIDDEN',
      'Email address is missing on authentication token.',
      { reason: 'email_unverified' },
    );
  }

  let phoneE164: string | undefined;
  if (typeof auth.token.phone_number === 'string') {
    const parsedPhone = nigerianE164Schema.safeParse(auth.token.phone_number);
    if (parsedPhone.success) {
      phoneE164 = parsedPhone.data;
    }
  }

  return {
    uid,
    email: auth.token.email,
    ...(phoneE164 ? { phoneE164 } : {}),
  };
}

export function requireLinkedNigerianPhone(auth: CallableAuth): string {
  requireAuthenticatedUser(auth);
  if (!auth) {
    throw new CommandError('UNAUTHENTICATED', 'Sign in to continue.');
  }

  const phone = auth.token.phone_number;
  if (typeof phone !== 'string') {
    throw new CommandError(
      'FORBIDDEN',
      'Link a Nigerian phone number (+234...) before submitting verification.',
      { reason: 'phone_unverified' },
    );
  }

  const parsed = nigerianE164Schema.safeParse(phone);
  if (!parsed.success) {
    throw new CommandError(
      'FORBIDDEN',
      'Link a Nigerian phone number (+234...) before submitting verification.',
      { reason: 'phone_unverified' },
    );
  }

  const firebaseToken = auth.token.firebase as { identities?: Record<string, unknown> } | undefined;
  const phoneIdentities = firebaseToken?.identities?.phone;
  if (Array.isArray(phoneIdentities) && !phoneIdentities.includes(phone)) {
    throw new CommandError(
      'FORBIDDEN',
      'Phone number is not linked as an identity on this account.',
      { reason: 'phone_unverified' },
    );
  }

  return parsed.data;
}

export function requireVerificationAdmin(auth: CallableAuth): {
  uid: string;
  role: 'verification_admin' | 'super_admin';
} {
  const uid = requireAuthenticatedUser(auth);
  if (!auth) {
    throw new CommandError('UNAUTHENTICATED', 'Sign in to continue.');
  }

  if (auth.token.super_admin === true) {
    return { uid, role: 'super_admin' };
  }
  if (auth.token.verification_admin === true) {
    return { uid, role: 'verification_admin' };
  }

  throw new CommandError('FORBIDDEN', 'Staff authorization required.', {
    reason: 'not_staff',
  });
}
