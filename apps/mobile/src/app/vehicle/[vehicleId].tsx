import { Redirect, useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/core/auth/auth-context';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import VehicleDetailScreen from '@/features/discovery/screens/vehicle-detail-screen';

export default function VehicleDetailRoute() {
  const { initializing, user } = useAuth();
  const { endDate, startDate, vehicleId } = useLocalSearchParams<{
    endDate?: string;
    startDate?: string;
    vehicleId: string;
  }>();

  if (initializing) return <AuthLoadingScreen />;
  if (!user || !user.emailVerified) return <Redirect href="/" />;

  return (
    <VehicleDetailScreen
      endDate={Array.isArray(endDate) ? endDate[0] : endDate}
      startDate={Array.isArray(startDate) ? startDate[0] : startDate}
      vehicleId={Array.isArray(vehicleId) ? vehicleId[0] : vehicleId}
    />
  );
}
