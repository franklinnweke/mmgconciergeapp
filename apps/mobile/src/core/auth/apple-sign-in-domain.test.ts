import { describe, expect, it } from 'vitest';

import {
  formatAppleDisplayName,
  hasAppleProvider,
  isAppleSignInCancellation,
  requireAppleAuthorizationCode,
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

  it('validates Apple authorization codes for token revocation', () => {
    expect(requireAppleAuthorizationCode(' auth-code-123 ')).toBe('auth-code-123');
    expect(() => requireAppleAuthorizationCode('')).toThrow('Apple did not return an authorization code');
    expect(() => requireAppleAuthorizationCode(null)).toThrow('Apple did not return an authorization code');
  });

  it('detects whether a Firebase user has an apple.com provider linked', () => {
    expect(hasAppleProvider([{ providerId: 'password' }, { providerId: 'apple.com' }])).toBe(true);
    expect(hasAppleProvider([{ providerId: 'google.com' }])).toBe(false);
    expect(hasAppleProvider(null)).toBe(false);
  });
});
