import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/core/auth/auth-context';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';

export default function OwnerLayout() {
  const { initializing, user } = useAuth();

  if (initializing) return <AuthLoadingScreen />;
  if (!user || !user.emailVerified) {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
