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
} {
  const uid = requireAuthenticatedUser(auth);
  if (!auth) {
    throw new CommandError('UNAUTHENTICATED', 'Sign in to continue.');
  }
  if (auth.token.email_verified !== true) {
    throw new CommandError(
      'FORBIDDEN',
      'Verify your email before managing vehicle listings.',
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

  return {
    uid,
    email: auth.token.email,
  };
}

export function requireVehicleAdmin(auth: CallableAuth): {
  uid: string;
  role: 'vehicle_admin' | 'super_admin';
} {
  const uid = requireAuthenticatedUser(auth);
  if (!auth) {
    throw new CommandError('UNAUTHENTICATED', 'Sign in to continue.');
  }

  if (auth.token.super_admin === true) {
    return { uid, role: 'super_admin' };
  }
  if (auth.token.vehicle_admin === true) {
    return { uid, role: 'vehicle_admin' };
  }

  throw new CommandError('FORBIDDEN', 'Vehicle admin privileges required.', {
    reason: 'not_staff',
  });
}
