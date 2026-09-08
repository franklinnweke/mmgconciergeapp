import { describe, expect, it } from 'vitest';

import {
  decodeAccountProfile,
  resolveAuthenticatedIntentDestination,
  resolveIdentityDestination,
  resolveRegistrationAccountProfile,
  shouldPublishAuthSnapshot,
  preserveAuthIntent,
} from './account-profile-domain';

const renterProfile = {
  uid: 'renter-one',
  accountType: 'renter' as const,
  displayName: 'Ada Okafor',
  email: 'ada@example.com',
};

describe('account profile routing', () => {
  it('keeps list-car intent through auth and verification but clears it for the next identity', () => {
    expect(preserveAuthIntent('owner', null, null)).toBe('owner');
    expect(preserveAuthIntent('owner', null, 'owner-one')).toBe('owner');
    expect(preserveAuthIntent('owner', 'owner-one', 'owner-one')).toBe('owner');
    expect(preserveAuthIntent('owner', 'owner-one', null)).toBeNull();
    expect(preserveAuthIntent('owner', 'owner-one', 'renter-two')).toBeNull();
    expect(resolveAuthenticatedIntentDestination(preserveAuthIntent('owner', 'owner-one', null))).toBe('renter');
  });
  it('requires authentication, account setup, and verification in order', () => {
    expect(resolveIdentityDestination({ emailVerified: false, hasUser: false, profile: null })).toBe('auth');
    expect(resolveIdentityDestination({ emailVerified: false, hasUser: true, profile: null })).toBe('account-setup');
    expect(resolveIdentityDestination({ emailVerified: false, hasUser: true, profile: renterProfile })).toBe('verify-email');
  });

  it('gives every verified MMG account renter access regardless of legacy account type', () => {
    expect(resolveIdentityDestination({ emailVerified: true, hasUser: true, profile: renterProfile })).toBe('renter');
    expect(resolveIdentityDestination({
      emailVerified: true,
      hasUser: true,
      profile: { ...renterProfile, accountType: 'owner' },
    })).toBe('renter');
  });

  it('uses the signed-out choice as a session intent, not a permanent navigation role', () => {
    expect(resolveAuthenticatedIntentDestination('owner')).toBe('owner');
    expect(resolveAuthenticatedIntentDestination('renter')).toBe('renter');
    expect(resolveAuthenticatedIntentDestination('sign-in')).toBe('renter');
    expect(resolveAuthenticatedIntentDestination(null)).toBe('renter');
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

  it('does not publish auth snapshots while a profile mutation owns the transition', () => {
    expect(shouldPublishAuthSnapshot(0)).toBe(true);
    expect(shouldPublishAuthSnapshot(1)).toBe(false);
    expect(shouldPublishAuthSnapshot(2)).toBe(true);
    expect(shouldPublishAuthSnapshot(3)).toBe(false);
  });
});
