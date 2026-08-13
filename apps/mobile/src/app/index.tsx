import { Redirect } from 'expo-router';

import { useAuth } from '@/core/auth/auth-context';
import { AuthEntryScreen } from '@/features/auth/screens/auth-entry-screen';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import { VerifyEmailScreen } from '@/features/auth/screens/verify-email-screen';

export default function IndexRoute() {
  const { initializing, user } = useAuth();

  if (initializing) return <AuthLoadingScreen />;
  if (!user) return <AuthEntryScreen />;
  if (!user.emailVerified) return <VerifyEmailScreen />;

  return <Redirect href="/(renter)" />;
}
