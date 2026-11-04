import type { AccountType } from '@mmg/contracts';
import { useState } from 'react';
import { Redirect, type Href } from 'expo-router';

import { useAuth } from '@/core/auth/auth-context';
import { resolveIdentityDestination } from '@/core/auth/account-profile-domain';
import { useSessionIntent } from '@/core/auth/session-intent';
import { AccountSetupScreen } from '@/features/auth/screens/account-setup-screen';
import { AccountProfileErrorScreen } from '@/features/auth/screens/account-profile-error-screen';
import { AuthEntryScreen } from '@/features/auth/screens/auth-entry-screen';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import { AuthRoleChoiceScreen } from '@/features/auth/screens/auth-role-choice-screen';
import { VerifyEmailScreen } from '@/features/auth/screens/verify-email-screen';

export default function AccountEntryRoute() {
  const { initializing, profile, profileLoadFailed, signingOut, user } = useAuth();
  const { loading: sessionIntentLoading, mode: sessionMode } = useSessionIntent();

  if (signingOut) return <AuthLoadingScreen message="Signing out" />;
  if (initializing || (user && sessionIntentLoading)) return <AuthLoadingScreen />;
  if (profileLoadFailed) return <AccountProfileErrorScreen />;
  const destination = resolveIdentityDestination({
    emailVerified: user?.emailVerified ?? false,
    hasUser: Boolean(user),
    profile,
  });

  if (destination === 'auth') return <SignedOutEntry />;
  if (destination === 'account-setup') return <AccountSetupScreen />;
  if (destination === 'verify-email') return <VerifyEmailScreen />;

  if (sessionMode === 'owner') {
    return <Redirect href={'/(owner)' as Href} />;
  }
  return <Redirect href="/(renter)" />;
}

function SignedOutEntry() {
  const [intent, setIntent] = useState<AccountType | null>(null);
  const { prepareSignIn } = useSessionIntent();

  if (!intent) return <AuthRoleChoiceScreen onChooseRole={setIntent} />;
  return (
    <AuthEntryScreen
      accountType={intent}
      onAuthenticate={() => prepareSignIn(intent)}
      onBack={() => setIntent(null)}
    />
  );
}
