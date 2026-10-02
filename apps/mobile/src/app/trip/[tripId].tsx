import { Redirect, useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/core/auth/auth-context';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import TripDetailScreen from '@/features/booking/screens/trip-detail-screen';

export default function TripDetailRoute() {
  const { initializing, signingOut, user } = useAuth();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();

  if (signingOut) return <AuthLoadingScreen message="Signing out" />;
  if (initializing) return <AuthLoadingScreen />;
  if (!user || !user.emailVerified) return <Redirect href="/auth" />;
  return <TripDetailScreen tripId={tripId ?? ''} />;
}
