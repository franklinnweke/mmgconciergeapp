import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionIntentProvider, useSessionIntent } from './session-intent';

const mocks = vi.hoisted(() => {
  let segmentsValue: string[] = [];
  let authValue = {
    signingOut: false,
    user: null as { uid: string } | null,
  };
  const store = new Map<string, string>();

  return {
    getSegments: () => segmentsValue,
    setSegments: (segs: string[]) => { segmentsValue = segs; },
    getAuth: () => authValue,
    setAuth: (val: { signingOut: boolean; user: { uid: string } | null }) => { authValue = val; },
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, val: string) => { store.set(key, val); }),
    clearStore: () => store.clear(),
  };
});

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mocks.getItem,
    setItem: mocks.setItem,
  },
}));

vi.mock('expo-router', () => ({
  useSegments: () => mocks.getSegments(),
}));

vi.mock('./auth-context', () => ({
  useAuth: () => mocks.getAuth(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('SessionIntentProvider lifecycle', () => {
  let latest: ReturnType<typeof useSessionIntent> | null = null;
  let renderer: ReactTestRenderer | null = null;

  function Probe() {
    latest = useSessionIntent();
    return React.createElement('Probe');
  }

  beforeEach(() => {
    latest = null;
    renderer = null;
    mocks.clearStore();
    mocks.getItem.mockClear();
    mocks.setItem.mockClear();
    mocks.setSegments([]);
    mocks.setAuth({ signingOut: false, user: null });
  });

  it('defaults to null mode when signed out', async () => {
    await act(async () => {
      renderer = create(
        React.createElement(SessionIntentProvider, null, React.createElement(Probe)),
      );
    });

    expect(latest?.mode).toBeNull();
    expect(latest?.loading).toBe(false);
  });

  it('restores stored owner mode when user signs in', async () => {
    await mocks.setItem('@mmg/session-mode/v1/owner-1', 'owner');

    mocks.setAuth({ signingOut: false, user: { uid: 'owner-1' } });

    await act(async () => {
      renderer = create(
        React.createElement(SessionIntentProvider, null, React.createElement(Probe)),
      );
    });

    await flushAsync();

    expect(latest?.mode).toBe('owner');
    expect(latest?.loading).toBe(false);
  });

  it('clears active mode on sign out and preserves isolation across UIDs', async () => {
    // 1. User A is an owner
    await mocks.setItem('@mmg/session-mode/v1/user-A', 'owner');
    mocks.setAuth({ signingOut: false, user: { uid: 'user-A' } });

    await act(async () => {
      renderer = create(
        React.createElement(SessionIntentProvider, null, React.createElement(Probe)),
      );
    });
    await flushAsync();

    expect(latest?.mode).toBe('owner');

    // 2. User A signs out
    mocks.setAuth({ signingOut: true, user: null });
    await act(async () => {
      renderer?.update(
        React.createElement(SessionIntentProvider, null, React.createElement(Probe)),
      );
    });
    await flushAsync();

    expect(latest?.mode).toBeNull();

    // 3. User B signs in (has no stored preference)
    mocks.setAuth({ signingOut: false, user: { uid: 'user-B' } });
    await act(async () => {
      renderer?.update(
        React.createElement(SessionIntentProvider, null, React.createElement(Probe)),
      );
    });
    await flushAsync();

    // User B must NOT inherit User A's owner mode
    expect(latest?.mode).toBeNull();

    // 4. User B signs out, User A signs back in
    mocks.setAuth({ signingOut: false, user: { uid: 'user-A' } });
    await act(async () => {
      renderer?.update(
        React.createElement(SessionIntentProvider, null, React.createElement(Probe)),
      );
    });
    await flushAsync();

    // User A's stored mode is restored
    expect(latest?.mode).toBe('owner');
  });

  it('clears active mode immediately while signingOut is true even before user is set to null', async () => {
    await mocks.setItem('@mmg/session-mode/v1/user-A', 'owner');
    mocks.setAuth({ signingOut: false, user: { uid: 'user-A' } });

    await act(async () => {
      renderer = create(
        React.createElement(SessionIntentProvider, null, React.createElement(Probe)),
      );
    });
    await flushAsync();

    expect(latest?.mode).toBe('owner');

    // Sign out initiated: signingOut becomes true, but native user is still present
    mocks.setAuth({ signingOut: true, user: { uid: 'user-A' } });
    await act(async () => {
      renderer?.update(
        React.createElement(SessionIntentProvider, null, React.createElement(Probe)),
      );
    });
    await flushAsync();

    expect(latest?.mode).toBeNull();
  });

  it('handles storage read failure gracefully without throwing or blocking', async () => {
    mocks.getItem.mockRejectedValueOnce(new Error('disk read error'));
    mocks.setAuth({ signingOut: false, user: { uid: 'user-corrupted' } });

    await act(async () => {
      renderer = create(
        React.createElement(SessionIntentProvider, null, React.createElement(Probe)),
      );
    });
    await flushAsync();

    expect(latest?.mode).toBeNull();
    expect(latest?.loading).toBe(false);
  });

  it('automatically persists owner or renter mode when route group changes', async () => {
    mocks.setAuth({ signingOut: false, user: { uid: 'switcher-user' } });

    await act(async () => {
      renderer = create(
        React.createElement(SessionIntentProvider, null, React.createElement(Probe)),
      );
    });
    await flushAsync();

    // Navigate to (owner)
    mocks.setSegments(['(owner)', 'fleet']);
    await act(async () => {
      renderer?.update(
        React.createElement(SessionIntentProvider, null, React.createElement(Probe)),
      );
    });
    await flushAsync();

    expect(latest?.mode).toBe('owner');
    expect(await mocks.getItem('@mmg/session-mode/v1/switcher-user')).toBe('owner');

    // Navigate to (renter)
    mocks.setSegments(['(renter)', 'browse']);
    await act(async () => {
      renderer?.update(
        React.createElement(SessionIntentProvider, null, React.createElement(Probe)),
      );
    });
    await flushAsync();

    expect(latest?.mode).toBe('renter');
    expect(await mocks.getItem('@mmg/session-mode/v1/switcher-user')).toBe('renter');
  });

  it('allows explicit setMode to update state and storage', async () => {
    mocks.setAuth({ signingOut: false, user: { uid: 'manual-mode-user' } });

    await act(async () => {
      renderer = create(
        React.createElement(SessionIntentProvider, null, React.createElement(Probe)),
      );
    });
    await flushAsync();

    await act(async () => {
      await latest?.setMode('owner');
    });

    expect(latest?.mode).toBe('owner');
    expect(await mocks.getItem('@mmg/session-mode/v1/manual-mode-user')).toBe('owner');
  });
});

