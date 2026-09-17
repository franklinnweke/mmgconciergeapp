import { describe, expect, it } from 'vitest';

import {
  parseStoredSessionMode,
  resolveAuthenticatedSessionMode,
  sessionModeFromSegments,
  sessionModeStorageKey,
} from './session-intent-domain';

describe('session intent routing', () => {
  it('derives renter and owner mode only from their route groups', () => {
    expect(sessionModeFromSegments(['(owner)'])).toBe('owner');
    expect(sessionModeFromSegments(['(owner)', 'fleet'])).toBe('owner');
    expect(sessionModeFromSegments(['(renter)'])).toBe('renter');
    expect(sessionModeFromSegments(['(renter)', 'account'])).toBe('renter');
    expect(sessionModeFromSegments(['booking', 'request-one'])).toBeNull();
    expect(sessionModeFromSegments([])).toBeNull();
  });

  it('fails closed for unknown stored values', () => {
    expect(parseStoredSessionMode('owner')).toBe('owner');
    expect(parseStoredSessionMode('renter')).toBe('renter');
    expect(parseStoredSessionMode('admin')).toBeNull();
    expect(parseStoredSessionMode('')).toBeNull();
    expect(parseStoredSessionMode(null)).toBeNull();
  });

  it('keeps the preference isolated per authenticated identity', () => {
    expect(sessionModeStorageKey('user-one')).toBe('@mmg/session-mode/v1/user-one');
    expect(sessionModeStorageKey('user-two')).toBe('@mmg/session-mode/v1/user-two');
    expect(sessionModeStorageKey('user-one')).not.toBe(sessionModeStorageKey('user-two'));
  });

  it('lets an explicit current role choice override restored mode', () => {
    expect(resolveAuthenticatedSessionMode('owner', 'renter')).toBe('owner');
    expect(resolveAuthenticatedSessionMode('renter', 'owner')).toBe('renter');
  });

  it('keeps generic sign-in neutral so restored mode decides the destination', () => {
    expect(resolveAuthenticatedSessionMode('sign-in', 'owner')).toBe('owner');
    expect(resolveAuthenticatedSessionMode('sign-in', 'renter')).toBe('renter');
    expect(resolveAuthenticatedSessionMode('sign-in', null)).toBe('renter');
    expect(resolveAuthenticatedSessionMode(null, 'owner')).toBe('owner');
    expect(resolveAuthenticatedSessionMode(null, null)).toBe('renter');
  });

  it('restores last working mode when the same UID logs out and logs back in', () => {
    const userStorage: Record<string, string> = {};
    const uid = 'returning-owner';

    // 1. User is in owner mode and preference is saved
    userStorage[sessionModeStorageKey(uid)] = 'owner';

    // 2. User signs out (mode preference stays in storage under user key)
    const storedPreferenceAfterSignOut = parseStoredSessionMode(userStorage[sessionModeStorageKey(uid)]);
    expect(storedPreferenceAfterSignOut).toBe('owner');

    // 3. User signs back in without explicit role selection
    const restoredDestination = resolveAuthenticatedSessionMode('sign-in', storedPreferenceAfterSignOut);
    expect(restoredDestination).toBe('owner');
  });

  it('ensures another UID cannot inherit the previous user mode', () => {
    const userStorage: Record<string, string> = {};
    const uidA = 'owner-uid';
    const uidB = 'renter-uid';

    // User A stores owner mode
    userStorage[sessionModeStorageKey(uidA)] = 'owner';

    // User B has no stored preference or has renter preference
    const userBStoredPreference = parseStoredSessionMode(userStorage[sessionModeStorageKey(uidB)] ?? null);
    expect(userBStoredPreference).toBeNull();

    // User B signs in -> defaults safely to renter, never inherits User A's owner mode
    const userBDestination = resolveAuthenticatedSessionMode('sign-in', userBStoredPreference);
    expect(userBDestination).toBe('renter');
  });
});
