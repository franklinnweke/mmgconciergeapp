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
});
