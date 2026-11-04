import { Redirect, type Href } from 'expo-router';
import type { PropsWithChildren } from 'react';

import { useAuth } from '../../../core/auth/auth-context';
import { useSessionIntent, type SessionMode } from '../../../core/auth/session-intent';
import { AuthLoadingScreen } from '../screens/auth-loading-screen';

/** A navigation boundary only. Backend authorization remains independent. */
export function SessionRouteGuard({ children, expected }: PropsWithChildren<{ expected: SessionMode }>) {
  const { initializing, signingOut, user } = useAuth();
  const { loading, mode } = useSessionIntent();

  if (signingOut) return <AuthLoadingScreen message="Signing out" />;
  if (initializing || loading) return <AuthLoadingScreen />;
  if (!user?.emailVerified || !mode) return <Redirect href="/auth" />;
  if (mode !== expected) return <Redirect href={(mode === 'owner' ? '/(owner)' : '/(renter)') as Href} />;
  return <>{children}</>;
}
