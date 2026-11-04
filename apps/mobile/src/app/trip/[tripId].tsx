import { useLocalSearchParams } from 'expo-router';

import { SessionRouteGuard } from '@/features/auth/components/session-route-guard';
import TripDetailScreen from '@/features/booking/screens/trip-detail-screen';

export default function TripDetailRoute() {
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();

  return (
    <SessionRouteGuard expected="renter">
      <TripDetailScreen tripId={tripId ?? ''} />
    </SessionRouteGuard>
  );
}
