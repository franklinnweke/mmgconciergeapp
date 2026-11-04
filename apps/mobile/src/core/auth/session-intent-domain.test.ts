import { describe, expect, it } from 'vitest';

import { parseStoredSessionMode, sessionModeStorageKey } from './session-intent-domain';

describe('persisted session view', () => {
  it('only accepts renter or owner', () => {
    expect(parseStoredSessionMode('renter')).toBe('renter');
    expect(parseStoredSessionMode('owner')).toBe('owner');
    expect(parseStoredSessionMode('admin')).toBeNull();
    expect(parseStoredSessionMode(null)).toBeNull();
  });

  it('scopes the existing storage key to the authenticated identity', () => {
    expect(sessionModeStorageKey('one')).toBe('@mmg/session-mode/v1/one');
    expect(sessionModeStorageKey('two')).not.toBe(sessionModeStorageKey('one'));
  });
});
