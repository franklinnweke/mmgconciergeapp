import { useLocalSearchParams } from 'expo-router';

import { SessionRouteGuard } from '@/features/auth/components/session-route-guard';
import VehicleDetailScreen from '@/features/discovery/screens/vehicle-detail-screen';

export default function VehicleDetailRoute() {
  const { endDate, pickup, startDate, vehicleId } = useLocalSearchParams<{
    endDate?: string;
    pickup?: string;
    startDate?: string;
    vehicleId: string;
  }>();

  return (
    <SessionRouteGuard expected="renter">
      <VehicleDetailScreen
        endDate={Array.isArray(endDate) ? endDate[0] : endDate}
        pickup={Array.isArray(pickup) ? pickup[0] : pickup}
        startDate={Array.isArray(startDate) ? startDate[0] : startDate}
        vehicleId={Array.isArray(vehicleId) ? vehicleId[0] : vehicleId}
      />
    </SessionRouteGuard>
  );
}
