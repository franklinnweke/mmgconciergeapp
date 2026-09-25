import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppErrorBoundary } from '../../components/error-boundary';
import { AuthProvider, useAuth } from './auth-context';
import OwnerLayout from '../../app/(owner)/_layout';

(globalThis as typeof globalThis & { __DEV__?: boolean; IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as typeof globalThis & { __DEV__?: boolean; IS_REACT_ACT_ENVIRONMENT?: boolean }).__DEV__ = true;

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

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
}));

vi.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    routerMocks.replace(href);
    return React.createElement('Redirect', { href });
  },
  Stack: () => React.createElement('Stack'),
  useRouter: () => routerMocks,
  useSegments: () => ['(owner)'],
  usePathname: () => '/(owner)',
}));

vi.mock('../../features/auth/screens/auth-loading-screen', () => ({
  AuthLoadingScreen: ({ message }: { message?: string }) =>
    React.createElement('AuthLoadingScreen', { message }),
}));

vi.mock('../../features/owner/domain/owner-id-upload-context', () => ({
  OwnerIdUploadProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('OwnerIdUploadProvider', null, children),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  SafeAreaView: 'SafeAreaView',
  ScrollView: 'ScrollView',
  Share: { share: vi.fn() },
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
}));

const fakeOwnerUser = {
  displayName: 'Test Owner',
  email: 'owner@example.com',
  emailVerified: true,
  phoneNumber: '+2348012345678',
  photoURL: null,
  uid: 'owner-1',
};

const fakeOwnerProfile = {
  accountType: 'owner',
  uid: 'owner-1',
};

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('Owner sign-out lifecycle', () => {
  let renderer: ReactTestRenderer | null = null;
  let authContext: ReturnType<typeof useAuth> | null = null;

  function AuthCaptor() {
    authContext = useAuth();
    return null;
  }

  beforeEach(() => {
    renderer = null;
    authContext = null;
    authMocks.resetHarness();
    vi.clearAllMocks();
    authMocks.loadAccountProfile.mockResolvedValue(fakeOwnerProfile);
  });

  afterEach(() => {
    renderer?.unmount();
  });

  it('runs sign-out lifecycle through OwnerLayout without crashing AppErrorBoundary', async () => {
    await act(async () => {
      renderer = create(
        React.createElement(
          AppErrorBoundary,
          null,
          React.createElement(
            AuthProvider,
            null,
            React.createElement(AuthCaptor),
            React.createElement(OwnerLayout),
          ),
        ),
      );
    });

    // Authenticate as owner
    await act(async () => {
      authMocks.emitAuth(fakeOwnerUser);
      await flushMicrotasks();
    });

    expect(authContext?.user?.uid).toBe('owner-1');
    expect(renderer!.root.findAll((node) => (node.type as unknown) === 'Stack')).toHaveLength(1);

    // Initiate sign out
    let signOutPromise!: Promise<void>;
    act(() => {
      signOutPromise = authContext!.signOut();
    });

    expect(authContext?.signingOut).toBe(true);
    // While signing out, OwnerLayout displays AuthLoadingScreen
    expect(renderer!.root.findAll((node) => (node.type as unknown) === 'AuthLoadingScreen')).toHaveLength(1);

    // Native sign-out finishes
    await act(async () => {
      authMocks.finishSignOut();
      await signOutPromise;
      await flushMicrotasks();
    });

    expect(authContext?.signingOut).toBe(false);
    expect(authContext?.user).toBeNull();

    // After sign-out, OwnerLayout renders Redirect href="/"
    expect(renderer!.root.findAll((node) => (node.type as unknown) === 'Redirect')).toHaveLength(1);
    expect(routerMocks.replace).toHaveBeenCalledWith('/');

    // AppErrorBoundary was not triggered
    expect(renderer!.root.findAll((node) => (node.type as unknown) === 'Text').map((t) => t.props.children))
      .not.toContain("We couldn't display this screen.");
  });
});
