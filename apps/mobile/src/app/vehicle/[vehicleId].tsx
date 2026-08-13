import { Redirect, useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/core/auth/auth-context';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import VehicleDetailScreen from '@/features/discovery/screens/vehicle-detail-screen';

export default function VehicleDetailRoute() {
  const { initializing, user } = useAuth();
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();

  if (initializing) return <AuthLoadingScreen />;
  if (!user || !user.emailVerified) return <Redirect href="/" />;

  return <VehicleDetailScreen vehicleId={vehicleId} />;
}
