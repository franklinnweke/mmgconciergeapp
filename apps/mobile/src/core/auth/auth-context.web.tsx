import type {
  AccountProfile,
  AccountType,
  EmailPasswordRegistration,
  EmailPasswordSignIn,
} from '@mmg/contracts';
import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

import { safeProviderError } from '@/core/errors/safe-provider-error';

type PreviewUser = {
  displayName: string;
  email: string;
  emailVerified: boolean;
  phoneNumber: string | null;
  uid: string;
};

type AuthContextValue = {
  completeAccountSetup(accountType: AccountType): Promise<void>;
  errorMessage(error: unknown): string;
  initializing: boolean;
  profile: AccountProfile | null;
  profileLoadFailed: boolean;
  refreshUser(): Promise<void>;
  retryProfile(): Promise<void>;
  register(input: EmailPasswordRegistration): Promise<void>;
  requestReset(email: string): Promise<void>;
  resendVerification(): Promise<void>;
  signIn(input: EmailPasswordSignIn): Promise<void>;
  signInGoogle(): Promise<'signed-in' | 'cancelled'>;
  signOut(): Promise<void>;
  user: PreviewUser | null;
};

const previewUser: PreviewUser = {
  displayName: 'Preview Guest',
  email: 'preview@mmgconcierge.local',
  emailVerified: true,
  phoneNumber: null,
  uid: 'preview-renter',
};

const previewProfile: AccountProfile = {
  uid: previewUser.uid,
  accountType: 'renter',
  displayName: previewUser.displayName,
  email: previewUser.email,
};

function initialPreviewProfile(): AccountProfile {
  if (typeof window === 'undefined') return previewProfile;
  const previewRole = new URLSearchParams(window.location.search).get('previewRole');
  return previewRole === 'owner'
    ? { ...previewProfile, accountType: 'owner' }
    : previewProfile;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Native builds use auth-context.tsx and Firebase. Web previews stay deterministic
// so UI development and static rendering never require a configured Firebase app.
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<PreviewUser | null>(previewUser);
  const [profile, setProfile] = useState<AccountProfile | null>(initialPreviewProfile);

  const value = useMemo<AuthContextValue>(
    () => ({
      async completeAccountSetup(accountType) {
        if (!user) throw new Error('Sign in before choosing an account type.');
        setProfile({
          uid: user.uid,
          accountType,
          displayName: user.displayName,
          email: user.email,
        });
      },
      errorMessage(error) {
        return safeProviderError(error, 'Something went wrong. Please try again.');
      },
      initializing: false,
      async refreshUser() {},
      async register(input) {
        setUser({ ...previewUser, displayName: input.displayName, email: input.email });
        setProfile(null);
      },
      async requestReset() {},
      async resendVerification() {},
      async signIn(input) {
        setUser({ ...previewUser, email: input.email });
        setProfile({ ...previewProfile, email: input.email });
      },
      async signInGoogle() {
        setUser(previewUser);
        setProfile(null);
        return 'signed-in';
      },
      async signOut() {
        setUser(null);
        setProfile(null);
      },
      profile,
      profileLoadFailed: false,
      async retryProfile() {},
      user,
    }),
    [profile, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
