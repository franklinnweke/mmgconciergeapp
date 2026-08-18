import { useEffect, useState } from 'react';
import { Redirect, type Href } from 'expo-router';

import { useAuth } from '@/core/auth/auth-context';
import { resolveIdentityDestination } from '@/core/auth/account-profile-domain';
import { AccountSetupScreen } from '@/features/auth/screens/account-setup-screen';
import { AccountProfileErrorScreen } from '@/features/auth/screens/account-profile-error-screen';
import { AuthEntryScreen } from '@/features/auth/screens/auth-entry-screen';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import { VerifyEmailScreen } from '@/features/auth/screens/verify-email-screen';

export default function IndexRoute() {
  const { initializing, profile, profileLoadFailed, user } = useAuth();
  const [minSplashDone, setMinSplashDone] = useState(false);

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

  if (destination === 'auth') return <AuthEntryScreen />;
  if (destination === 'account-setup') return <AccountSetupScreen />;
  if (destination === 'verify-email') return <VerifyEmailScreen />;
  // Expo's generated route types refresh when the dev server sees the new group.
  if (destination === 'owner') return <Redirect href={'/(owner)' as Href} />;

  return <Redirect href="/(renter)" />;
}
