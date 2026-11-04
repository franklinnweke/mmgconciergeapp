import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionIntentProvider, useSessionIntent } from './session-intent';
import { sessionModeStorageKey } from './session-intent-domain';

const mocks = vi.hoisted(() => ({
  auth: { user: null as { uid: string } | null, initializing: false, signingOut: false },
  segments: [] as string[],
  storage: new Map<string, string>(),
  getItem: vi.fn(async (key: string): Promise<string | null> => mocks.storage.get(key) ?? null),
  setItem: vi.fn(async (key: string, mode: string) => { mocks.storage.set(key, mode); }),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: mocks.getItem, setItem: mocks.setItem },
}));
vi.mock('expo-router', () => ({ useSegments: () => mocks.segments }));
vi.mock('./auth-context', () => ({ useAuth: () => mocks.auth }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('sign-in session view', () => {
  const key = sessionModeStorageKey('user-one');
  let latest: ReturnType<typeof useSessionIntent>;
  let renderer: ReactTestRenderer | undefined;

  function Probe() {
    latest = useSessionIntent();
    return null;
  }

  async function render() {
    await act(async () => {
      const tree = <SessionIntentProvider><Probe /></SessionIntentProvider>;
      if (renderer) renderer.update(tree);
      else renderer = create(tree);
    });
  }

  beforeEach(() => {
    mocks.auth = { user: null, initializing: false, signingOut: false };
    mocks.segments = [];
    mocks.storage.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('chooses a view before authentication and saves it for the authenticated account', async () => {
    await render();
    expect(latest.mode).toBeNull();
    latest.prepareSignIn('owner');
    mocks.auth.user = { uid: 'user-one' };
    await render();
    expect(latest.mode).toBe('owner');
    expect(mocks.setItem).toHaveBeenCalledWith(key, 'owner');
  });

  it('lets the same identity choose the other view only after signing out', async () => {
    mocks.storage.set(key, 'owner');
    mocks.auth.user = { uid: 'user-one' };
    await render();
    latest.prepareSignIn('renter');
    await render();
    expect(latest.mode).toBe('owner');
    expect(mocks.setItem).not.toHaveBeenCalled();

    mocks.auth = { ...mocks.auth, signingOut: true };
    await render();
    expect(latest.mode).toBeNull();
    mocks.auth = { ...mocks.auth, user: null, signingOut: false };
    await render();
    latest.prepareSignIn('renter');
    mocks.auth.user = { uid: 'user-one' };
    await render();
    expect(latest.mode).toBe('renter');
    expect(mocks.storage.get(key)).toBe('renter');
  });

  it('never infers the selected view from a deep link or route history', async () => {
    mocks.auth.user = { uid: 'user-one' };
    mocks.segments = ['(owner)', 'fleet'];
    await render();
    expect(latest.mode).toBe('renter');
    expect(mocks.setItem).not.toHaveBeenCalled();
    mocks.segments = ['(owner)', 'owner-bookings'];
    await render();
    expect(latest.mode).toBe('renter');
  });

  it('restores the view after restart but not into another identity', async () => {
    mocks.storage.set(key, 'owner');
    mocks.auth.user = { uid: 'user-one' };
    mocks.segments = ['(renter)', 'account'];
    await render();
    expect(latest.mode).toBe('owner');
    mocks.auth.user = { uid: 'user-two' };
    await render();
    expect(latest.mode).toBe('renter');
  });

  it('keeps the selected view if native sign-out fails', async () => {
    mocks.storage.set(key, 'owner');
    mocks.auth.user = { uid: 'user-one' };
    await render();
    mocks.auth = { ...mocks.auth, signingOut: true };
    await render();
    expect(latest.mode).toBeNull();
    mocks.auth = { ...mocks.auth, signingOut: false };
    await render();
    expect(latest.mode).toBe('owner');
  });

  it('falls back to renter if stored mode cannot be read', async () => {
    mocks.getItem.mockRejectedValueOnce(new Error('read failed'));
    mocks.auth.user = { uid: 'user-one' };
    await render();
    expect(latest.loading).toBe(false);
    expect(latest.mode).toBe('renter');
  });
});
