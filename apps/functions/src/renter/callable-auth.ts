import type { AuthData } from 'firebase-functions/v2/tasks';

import { CommandError } from '../errors.js';

export type AuthenticatedRenter = {
  uid: string;
  email: string;
};

export function requireAuthenticatedRenter(auth: AuthData | undefined): AuthenticatedRenter {
  if (!auth) {
    throw new CommandError('UNAUTHENTICATED', 'Sign in to continue.');
  }

  if (auth.token.email_verified !== true) {
    throw new CommandError('FORBIDDEN', 'Verified email is required.');
  }

  return {
    uid: auth.uid,
    email: typeof auth.token.email === 'string' ? auth.token.email : '',
  };
}
