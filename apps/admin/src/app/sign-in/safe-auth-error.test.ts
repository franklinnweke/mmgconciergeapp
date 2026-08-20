import { describe, expect, it } from 'vitest';

import { safeAuthError } from './safe-auth-error';

describe('safeAuthError', () => {
  it('maps Firebase credential failures without exposing provider details', () => {
    expect(safeAuthError({ code: 'auth/invalid-credential', message: 'SECRET_PROVIDER_DETAIL' })).toBe(
      'The email or password is not recognised.',
    );
  });

  it('preserves authored staff access messages', () => {
    expect(safeAuthError(new Error('Access denied. Staff verification privileges required.'))).toBe(
      'Access denied. Staff verification privileges required.',
    );
  });

  it('falls back to a generic safe message', () => {
    expect(safeAuthError(new Error('INTERNAL_SECRET'))).toBe(
      'Staff sign-in failed. Check your credentials and try again.',
    );
  });
});
