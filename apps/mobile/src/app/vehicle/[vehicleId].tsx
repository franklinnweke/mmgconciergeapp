import { Redirect, useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/core/auth/auth-context';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import VehicleDetailScreen from '@/features/discovery/screens/vehicle-detail-screen';

export default function VehicleDetailRoute() {
  const { initializing, signingOut, user } = useAuth();
  const { endDate, pickup, startDate, vehicleId } = useLocalSearchParams<{
    endDate?: string;
    pickup?: string;
    startDate?: string;
    vehicleId: string;
  }>();

  if (signingOut) return <AuthLoadingScreen message="Signing out" />;
  if (initializing) return <AuthLoadingScreen />;
  if (!user || !user.emailVerified) return <Redirect href="/auth" />;

  return (
    <VehicleDetailScreen
      endDate={Array.isArray(endDate) ? endDate[0] : endDate}
      pickup={Array.isArray(pickup) ? pickup[0] : pickup}
      startDate={Array.isArray(startDate) ? startDate[0] : startDate}
      vehicleId={Array.isArray(vehicleId) ? vehicleId[0] : vehicleId}
    />
  );
}
