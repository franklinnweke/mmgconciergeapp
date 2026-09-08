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

  try {
    const snapshot = await loadDevelopmentInterventionCases();
    return <BookingInterventionDesk session={session} snapshot={snapshot} />;
  } catch (error) {
    return (
      <BookingInterventionDesk
        error={error instanceof Error ? error.message : 'Booking intervention data could not be loaded.'}
        session={session}
        snapshot={null}
      />
    );
  }
}
