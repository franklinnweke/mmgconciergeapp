import { describe, expect, it } from 'vitest';

import {
  formatAppleDisplayName,
  isAppleSignInCancellation,
  requireAppleIdentityToken,
} from './apple-sign-in-domain';

describe('Apple sign-in domain helpers', () => {
  it('formats the first-login Apple name without inventing missing parts', () => {
    expect(formatAppleDisplayName({ givenName: 'Ada', familyName: 'Okafor' })).toBe('Ada Okafor');
    expect(formatAppleDisplayName({ givenName: ' Ada ', middleName: 'N.', familyName: ' Okafor ' }))
      .toBe('Ada N. Okafor');
    expect(formatAppleDisplayName(null)).toBe('');
  });

  it('treats only the Apple cancellation code as a clean cancellation', () => {
    expect(isAppleSignInCancellation({ code: 'ERR_REQUEST_CANCELED' })).toBe(true);
    expect(isAppleSignInCancellation({ code: 'auth/network-request-failed' })).toBe(false);
    expect(isAppleSignInCancellation(null)).toBe(false);
  });

  it('requires an Apple identity token before Firebase credential exchange', () => {
    expect(requireAppleIdentityToken('signed-token')).toBe('signed-token');
    expect(() => requireAppleIdentityToken(null)).toThrow('Apple did not return an identity token');
  });
});
