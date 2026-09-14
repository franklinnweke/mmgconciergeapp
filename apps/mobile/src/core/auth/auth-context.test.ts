import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth-context';

const authMocks = vi.hoisted(() => {
  let authListener: ((user: unknown) => void) | null = null;
  let resolveSignOut: (() => void) | null = null;

  return {
    createAccountProfile: vi.fn(),
    getFriendlyAuthError: vi.fn(() => 'friendly error'),
    loadAccountProfile: vi.fn(),
    refreshCurrentUser: vi.fn(),
    registerWithEmailPassword: vi.fn(),
    requestPasswordReset: vi.fn(),
    resendVerificationEmail: vi.fn(),
    signInWithApple: vi.fn(),
    signInWithEmailPassword: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOutCurrentUser: vi.fn(() => new Promise<void>((resolve) => {
      resolveSignOut = resolve;
    })),
    subscribeToAuthState: vi.fn((listener: (user: unknown) => void) => {
      authListener = listener;
      return vi.fn();
    }),
    emitAuth(user: unknown) {
      if (!authListener) throw new Error('Auth listener has not been registered.');
      authListener(user);
    },
    finishSignOut() {
      if (!resolveSignOut) throw new Error('Sign-out has not started.');
      const resolve = resolveSignOut;
      resolveSignOut = null;
      resolve();
    },
    resetHarness() {
      authListener = null;
      resolveSignOut = null;
    },
  };
});

vi.mock('./account-profile', () => ({
  createAccountProfile: authMocks.createAccountProfile,
  loadAccountProfile: authMocks.loadAccountProfile,
}));

vi.mock('./firebase-auth', () => ({
  getFriendlyAuthError: authMocks.getFriendlyAuthError,
  refreshCurrentUser: authMocks.refreshCurrentUser,
  registerWithEmailPassword: authMocks.registerWithEmailPassword,
  requestPasswordReset: authMocks.requestPasswordReset,
  resendVerificationEmail: authMocks.resendVerificationEmail,
  signInWithApple: authMocks.signInWithApple,
  signInWithEmailPassword: authMocks.signInWithEmailPassword,
  signInWithGoogle: authMocks.signInWithGoogle,
  signOutCurrentUser: authMocks.signOutCurrentUser,
  subscribeToAuthState: authMocks.subscribeToAuthState,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fakeUser = {
  displayName: 'Test Renter',
  email: 'renter@example.com',
  emailVerified: true,
  photoURL: null,
  uid: 'renter-1',
};

const fakeProfile = {
  accountType: 'renter',
  uid: 'renter-1',
};

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('AuthProvider sign-out transition', () => {
  let latest: ReturnType<typeof useAuth> | null = null;
  let renderer: ReactTestRenderer | null = null;

  function Probe() {
    latest = useAuth();
    return React.createElement('Probe');
  }

  beforeEach(() => {
    latest = null;
    renderer = null;
    authMocks.resetHarness();
    vi.clearAllMocks();
    authMocks.loadAccountProfile.mockResolvedValue(fakeProfile);
  });

  it('keeps the authenticated session published until native sign-out completes', async () => {
    await act(async () => {
      renderer = create(
        React.createElement(AuthProvider, null, React.createElement(Probe)),
      );
    });

    await act(async () => {
      authMocks.emitAuth(fakeUser);
      await flushMicrotasks();
    });

    expect(latest?.user).toBe(fakeUser);
    expect(latest?.profile).toBe(fakeProfile);
    expect(latest?.signingOut).toBe(false);

    let signOutPromise!: Promise<void>;
    act(() => {
      signOutPromise = latest!.signOut();
    });

    expect(latest?.signingOut).toBe(true);
    expect(latest?.user).toBe(fakeUser);
    expect(latest?.profile).toBe(fakeProfile);

    // Firebase may publish its null auth snapshot before native sign-out work
    // has fully settled. The provider must suppress that half-signed-out state.
    act(() => {
      authMocks.emitAuth(null);
    });

    expect(latest?.user).toBe(fakeUser);
    expect(latest?.profile).toBe(fakeProfile);

    await act(async () => {
      authMocks.finishSignOut();
      await signOutPromise;
    });

    expect(latest?.signingOut).toBe(false);
    expect(latest?.user).toBeNull();
    expect(latest?.profile).toBeNull();

    act(() => {
      renderer?.unmount();
    });
  });
});
