import type { EmailPasswordRegistration, EmailPasswordSignIn } from '@mmg/contracts';
import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

type PreviewUser = {
  displayName: string;
  email: string;
  emailVerified: boolean;
  uid: string;
};

type AuthContextValue = {
  errorMessage(error: unknown): string;
  initializing: boolean;
  refreshUser(): Promise<void>;
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
  uid: 'preview-renter',
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Native builds use auth-context.tsx and Firebase. Web previews stay deterministic
// so UI development and static rendering never require a configured Firebase app.
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<PreviewUser | null>(previewUser);

  const value = useMemo<AuthContextValue>(
    () => ({
      errorMessage(error) {
        return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      },
      initializing: false,
      async refreshUser() {},
      async register(input) {
        setUser({ ...previewUser, displayName: input.displayName, email: input.email });
      },
      async requestReset() {},
      async resendVerification() {},
      async signIn(input) {
        setUser({ ...previewUser, email: input.email });
      },
      async signInGoogle() {
        setUser(previewUser);
        return 'signed-in';
      },
      async signOut() {
        setUser(null);
      },
      user,
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
