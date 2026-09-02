import { describe, expect, it } from 'vitest';

import {
  decodeAccountProfile,
  resolveIdentityDestination,
  resolveRegistrationAccountProfile,
} from './account-profile-domain';

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

  it('keeps an existing persisted role when registration begins from another role path', async () => {
    const ownerProfile = { ...renterProfile, accountType: 'owner' as const };
    let createCalls = 0;

    const result = await resolveRegistrationAccountProfile(ownerProfile, async () => {
      createCalls += 1;
      return renterProfile;
    });

    expect(result).toBe(ownerProfile);
    expect(createCalls).toBe(0);
  });

  it('creates the selected role only when no persisted profile exists', async () => {
    const result = await resolveRegistrationAccountProfile(null, async () => renterProfile);
    expect(result).toEqual(renterProfile);
  });
});
