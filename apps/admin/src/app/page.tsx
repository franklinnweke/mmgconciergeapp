import 'server-only';

import { requireStaffCapability } from '@/features/auth/server/session';
import { BookingInterventionDesk } from '@/features/bookings/components/booking-intervention-desk';
import { BookingOperations } from '@/features/bookings/components/booking-operations';
import { loadDevelopmentInterventionCases } from '@/features/bookings/data/live-admin-booking-case-repository';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  const session = await requireStaffCapability('bookings.read');
  const fixtureMode = process.env.NODE_ENV !== 'production' && process.env.MMG_ADMIN_FIXTURES === '1';

  if (fixtureMode) {
    return <BookingOperations mode="fixture" />;
  }

  let snapshot = null;
  let loadError: string | null = null;
  try {
    snapshot = await loadDevelopmentInterventionCases();
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Booking intervention data could not be loaded.';
  }

  return (
    <BookingInterventionDesk
      error={loadError}
      session={session}
      snapshot={snapshot}
    />
  );
}
