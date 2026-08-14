import { describe, expect, it } from 'vitest';

import { decodeAccountProfile, resolveIdentityDestination } from './account-profile-domain';

const renterProfile = {
  uid: 'renter-one',
  accountType: 'renter' as const,
  displayName: 'Ada Okafor',
  email: 'ada@example.com',
};

describe('account profile routing', () => {
  it('requires authentication, account setup, and verification in order', () => {
    expect(resolveIdentityDestination({ emailVerified: false, hasUser: false, profile: null })).toBe('auth');
    expect(resolveIdentityDestination({ emailVerified: false, hasUser: true, profile: null })).toBe('account-setup');
    expect(resolveIdentityDestination({ emailVerified: false, hasUser: true, profile: renterProfile })).toBe('verify-email');
  });

  it('routes verified users by their persisted account type', () => {
    expect(resolveIdentityDestination({ emailVerified: true, hasUser: true, profile: renterProfile })).toBe('renter');
    expect(resolveIdentityDestination({
      emailVerified: true,
      hasUser: true,
      profile: { ...renterProfile, accountType: 'owner' },
    })).toBe('owner');
  });

  it('rejects mismatched identities and admin profiles', () => {
    expect(() => decodeAccountProfile(renterProfile, 'another-user')).toThrow();
    expect(() => decodeAccountProfile({ ...renterProfile, accountType: 'admin' }, 'renter-one')).toThrow();
  });
});
