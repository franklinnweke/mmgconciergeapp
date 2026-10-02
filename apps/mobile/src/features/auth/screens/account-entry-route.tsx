import type { AccountType } from '@mmg/contracts';
import { useEffect, useRef, useState } from 'react';
import { Redirect, type Href } from 'expo-router';

import { useAuth } from '@/core/auth/auth-context';
import {
  resolveIdentityDestination,
  preserveAuthIntent,
} from '@/core/auth/account-profile-domain';
import { useSessionIntent } from '@/core/auth/session-intent';
import { resolveAuthenticatedSessionMode } from '@/core/auth/session-intent-domain';
import { AccountSetupScreen } from '@/features/auth/screens/account-setup-screen';
import { AccountProfileErrorScreen } from '@/features/auth/screens/account-profile-error-screen';
import { AuthEntryScreen } from '@/features/auth/screens/auth-entry-screen';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import { AuthRoleChoiceScreen } from '@/features/auth/screens/auth-role-choice-screen';
import { VerifyEmailScreen } from '@/features/auth/screens/verify-email-screen';

export default function AccountEntryRoute() {
  const { initializing, profile, profileLoadFailed, signingOut, user } = useAuth();
  const { loading: sessionIntentLoading, mode: sessionMode } = useSessionIntent();
  const [authIntent, setAuthIntent] = useState<AccountType | 'sign-in' | null>(null);

  const userId = user?.uid ?? null;
  const previousUserId = useRef(userId);

  useEffect(() => {
    if (previousUserId.current !== userId) {
      const prev = previousUserId.current;
      previousUserId.current = userId;
      setAuthIntent((current) => preserveAuthIntent(current, prev, userId));
    }
  }, [userId]);

  if (signingOut) return <AuthLoadingScreen message="Signing out" />;
  if (initializing || (user && sessionIntentLoading)) return <AuthLoadingScreen />;
  if (profileLoadFailed) return <AccountProfileErrorScreen />;
  const destination = resolveIdentityDestination({
    emailVerified: user?.emailVerified ?? false,
    hasUser: Boolean(user),
    profile,
  });

  if (destination === 'auth') {
    if (!authIntent) {
      return (
        <AuthRoleChoiceScreen
          onChooseRole={setAuthIntent}
          onSignIn={() => setAuthIntent('sign-in')}
        />
      );
    }

    return (
      <AuthEntryScreen
        accountType={authIntent === 'sign-in' ? null : authIntent}
        initialMode={authIntent === 'sign-in' ? 'sign-in' : 'register'}
        onBack={() => setAuthIntent(null)}
      />
    );
  }
  if (destination === 'account-setup') return <AccountSetupScreen />;
  if (destination === 'verify-email') return <VerifyEmailScreen />;

  const authenticatedDestination = resolveAuthenticatedSessionMode(authIntent, sessionMode);
  if (authenticatedDestination === 'owner') {
    return <Redirect href={'/(owner)' as Href} />;
  }
  return <Redirect href="/(renter)" />;
}
