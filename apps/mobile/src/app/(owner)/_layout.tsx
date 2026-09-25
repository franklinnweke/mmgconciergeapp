import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../core/auth/auth-context';
import { AuthLoadingScreen } from '../../features/auth/screens/auth-loading-screen';
import { OwnerIdUploadProvider } from '../../features/owner/domain/owner-id-upload-context';

export default function OwnerLayout() {
  const { initializing, signingOut, user } = useAuth();

  if (signingOut) return <AuthLoadingScreen message="Signing out" />;
  if (initializing) return <AuthLoadingScreen />;
  if (!user || !user.emailVerified) {
    return <Redirect href="/" />;
  }

  return (
    <OwnerIdUploadProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </OwnerIdUploadProvider>
  );
}
