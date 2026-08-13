import { Redirect, useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/core/auth/auth-context';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import BookingReviewScreen from '@/features/booking/screens/booking-review-screen';

export default function BookingReviewRoute() {
  const { initializing, user } = useAuth();
  const { durationDays, vehicleId } = useLocalSearchParams<{
    durationDays: string;
    vehicleId: string;
  }>();

  if (initializing) return <AuthLoadingScreen />;
  if (!user || !user.emailVerified) return <Redirect href="/" />;

  return (
    <BookingReviewScreen
      durationDays={Number.parseInt(durationDays, 10)}
      vehicleId={vehicleId}
    />
  );
}
