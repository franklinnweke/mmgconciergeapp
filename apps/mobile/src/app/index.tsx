import type { AccountType } from '@mmg/contracts';
import { useEffect, useState } from 'react';
import { Redirect, type Href } from 'expo-router';

import { useAuth } from '@/core/auth/auth-context';
import { resolveIdentityDestination } from '@/core/auth/account-profile-domain';
import { AccountSetupScreen } from '@/features/auth/screens/account-setup-screen';
import { AccountProfileErrorScreen } from '@/features/auth/screens/account-profile-error-screen';
import { AuthEntryScreen } from '@/features/auth/screens/auth-entry-screen';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import { AuthRoleChoiceScreen } from '@/features/auth/screens/auth-role-choice-screen';
import { VerifyEmailScreen } from '@/features/auth/screens/verify-email-screen';

export default function IndexRoute() {
  const { initializing, profile, profileLoadFailed, user } = useAuth();
  const [minSplashDone, setMinSplashDone] = useState(false);
  const [authIntent, setAuthIntent] = useState<AccountType | 'sign-in' | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinSplashDone(true);
    }, 1300);
    return () => clearTimeout(timer);
  }, []);

  if (initializing || !minSplashDone) return <AuthLoadingScreen />;
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
  // Expo's generated route types refresh when the dev server sees the new group.
  if (destination === 'owner') return <Redirect href={'/(owner)' as Href} />;

  return <Redirect href="/(renter)" />;
}
