import { useLocalSearchParams } from 'expo-router';

import { SessionRouteGuard } from '@/features/auth/components/session-route-guard';
import BookingReviewScreen from '@/features/booking/screens/booking-review-screen';

export default function BookingReviewRoute() {
  const { endDate, pickup, startDate, vehicleId } = useLocalSearchParams<{
    endDate?: string;
    pickup?: string;
    startDate?: string;
    vehicleId: string;
  }>();

  return (
    <SessionRouteGuard expected="renter">
      <BookingReviewScreen
        endDate={Array.isArray(endDate) ? endDate[0] : endDate}
        pickup={Array.isArray(pickup) ? pickup[0] : pickup}
        startDate={Array.isArray(startDate) ? startDate[0] : startDate}
        vehicleId={Array.isArray(vehicleId) ? vehicleId[0] : vehicleId}
      />
    </SessionRouteGuard>
  );
}
