import { Redirect, useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/core/auth/auth-context';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import { RentalRequestPaymentScreen } from '@/features/booking/screens/rental-request-payment-screen';

export default function RentalRequestPaymentRoute() {
  const { initializing, user } = useAuth();
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  if (initializing) return <AuthLoadingScreen />;
  if (!user || !user.emailVerified) return <Redirect href="/" />;
  const resolved = Array.isArray(journeyId) ? journeyId[0] : journeyId;
  if (!resolved) return <Redirect href="/(renter)/trips" />;
  return <RentalRequestPaymentScreen journeyId={resolved} />;
}
