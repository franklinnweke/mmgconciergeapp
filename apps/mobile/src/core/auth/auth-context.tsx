import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';

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
import type { EmailPasswordRegistration, EmailPasswordSignIn } from '@mmg/contracts';

type AuthContextValue = {
  errorMessage(error: unknown): string;
  initializing: boolean;
  refreshUser(): Promise<void>;
  register(input: EmailPasswordRegistration): Promise<void>;
  requestReset(email: string): Promise<void>;
  resendVerification(): Promise<void>;
  signIn(input: EmailPasswordSignIn): Promise<void>;
  signInGoogle(): Promise<GoogleSignInResult>;
  signOut(): Promise<void>;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [, setRefreshVersion] = useState(0);

  useEffect(
    () =>
      subscribeToAuthState((nextUser) => {
        setUser(nextUser);
        setInitializing(false);
      }),
    [],
  );

  const value: AuthContextValue = {
    errorMessage: getFriendlyAuthError,
    initializing,
    async refreshUser() {
      const nextUser = await refreshCurrentUser();
      setUser(nextUser);
      setRefreshVersion((version) => version + 1);
    },
    register: registerWithEmailPassword,
    requestReset: requestPasswordReset,
    resendVerification: resendVerificationEmail,
    signIn: signInWithEmailPassword,
    signInGoogle: signInWithGoogle,
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
