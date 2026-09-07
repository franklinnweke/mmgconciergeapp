import type {
  AccountProfile,
  AccountType,
  EmailPasswordRegistration,
  EmailPasswordSignIn,
} from '@mmg/contracts';
import { createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';

import { createAccountProfile, loadAccountProfile } from './account-profile';
import {
  resolveRegistrationAccountProfile,
  shouldPublishAuthSnapshot,
} from './account-profile-domain';
import {
  getFriendlyAuthError,
  refreshCurrentUser,
  registerWithEmailPassword,
  requestPasswordReset,
  resendVerificationEmail,
  signInWithEmailPassword,
  signInWithGoogle,
  signOutCurrentUser,
  subscribeToAuthState,
  type GoogleSignInResult,
  type User,
} from './firebase-auth';

type AuthContextValue = {
  completeAccountSetup(accountType: AccountType): Promise<void>;
  errorMessage(error: unknown): string;
  initializing: boolean;
  profile: AccountProfile | null;
  profileLoadFailed: boolean;
  refreshUser(): Promise<void>;
  retryProfile(): Promise<void>;
  register(input: EmailPasswordRegistration, accountType: AccountType): Promise<void>;
  requestReset(email: string): Promise<void>;
  resendVerification(): Promise<void>;
  signIn(input: EmailPasswordSignIn): Promise<void>;
  signInGoogle(accountType?: AccountType): Promise<GoogleSignInResult>;
  signOut(): Promise<void>;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [authInitializing, setAuthInitializing] = useState(true);
  const [profileInitializing, setProfileInitializing] = useState(false);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [, setRefreshVersion] = useState(0);
  const profileMutationVersion = useRef(0);

  useEffect(() => {
    let active = true;
    let requestVersion = 0;
    const unsubscribe = subscribeToAuthState((nextUser) => {
      const currentRequest = ++requestVersion;
      const currentMutation = profileMutationVersion.current;
      if (!active) return;

      if (!shouldPublishAuthSnapshot(currentMutation)) {
        return;
      }

      setUser(nextUser);
      setAuthInitializing(false);
      if (!nextUser) {
        setProfile(null);
        setProfileLoadFailed(false);
        setProfileInitializing(false);
        return;
      }

      setProfileLoadFailed(false);
      setProfileInitializing(true);
      void loadAccountProfile(nextUser.uid)
        .then((nextProfile) => {
          if (
            active
            && currentRequest === requestVersion
            && currentMutation === profileMutationVersion.current
            && shouldPublishAuthSnapshot(currentMutation)
          ) setProfile(nextProfile);
        })
        .catch(() => {
          if (
            active
            && currentRequest === requestVersion
            && currentMutation === profileMutationVersion.current
            && shouldPublishAuthSnapshot(currentMutation)
          ) {
            setProfile(null);
            setProfileLoadFailed(true);
          }
        })
        .finally(() => {
          if (
            active
            && currentRequest === requestVersion
            && currentMutation === profileMutationVersion.current
            && shouldPublishAuthSnapshot(currentMutation)
          ) setProfileInitializing(false);
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    async completeAccountSetup(accountType) {
      if (!user) throw new Error('Sign in before choosing an account type.');
      profileMutationVersion.current += 1;
      try {
        const nextProfile = await createAccountProfile(user, accountType);
        setProfile(nextProfile);
        setProfileLoadFailed(false);
      } finally {
        profileMutationVersion.current += 1;
      }
    },
    errorMessage: getFriendlyAuthError,
    initializing: authInitializing || profileInitializing,
    profile,
    profileLoadFailed,
    async refreshUser() {
      const nextUser = await refreshCurrentUser();
      setUser(nextUser ? (Object.assign(Object.create(Object.getPrototypeOf(nextUser)), nextUser) as User) : null);
      setRefreshVersion((version) => version + 1);
    },
    async register(input, accountType) {
      profileMutationVersion.current += 1;
      try {
        const nextUser = await registerWithEmailPassword(input);
        const nextProfile = await createAccountProfile(nextUser, accountType);
        setProfile(nextProfile);
        setProfileLoadFailed(false);
        setUser(nextUser);
      } catch (error) {
        await signOutCurrentUser();
        setUser(null);
        setProfile(null);
        setProfileLoadFailed(false);
        throw error;
      } finally {
        profileMutationVersion.current += 1;
      }
    },
    requestReset: requestPasswordReset,
    resendVerification: resendVerificationEmail,
    async retryProfile() {
      if (!user) return;
      setProfileInitializing(true);
      setProfileLoadFailed(false);
      try {
        setProfile(await loadAccountProfile(user.uid));
      } catch {
        setProfileLoadFailed(true);
      } finally {
        setProfileInitializing(false);
      }
    },
    signIn: signInWithEmailPassword,
    async signInGoogle(accountType) {
      if (!accountType) {
        const result = await signInWithGoogle();
        return result.status;
      }

      profileMutationVersion.current += 1;
      try {
        const result = await signInWithGoogle();
        if (result.status === 'cancelled') {
          return 'cancelled';
        }

        const existingProfile = await loadAccountProfile(result.user.uid);
        const nextProfile = await resolveRegistrationAccountProfile(
          existingProfile,
          () => createAccountProfile(result.user, accountType),
        );
        setProfile(nextProfile);
        setProfileLoadFailed(false);
        setUser(result.user);
        return 'signed-in';
      } catch (error) {
        await signOutCurrentUser();
        setUser(null);
        setProfile(null);
        setProfileLoadFailed(false);
        throw error;
      } finally {
        profileMutationVersion.current += 1;
      }
    },
    signOut: signOutCurrentUser,
    user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
