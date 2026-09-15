import 'server-only';

import {
  requireStaffCapability,
  staffSessionHasCapability,
} from '@/features/auth/server/session';
import { BookingInterventionDesk } from '@/features/bookings/components/booking-intervention-desk';
import { BookingOperations } from '@/features/bookings/components/booking-operations';
import { loadDevelopmentInterventionCases } from '@/features/bookings/data/live-admin-booking-case-repository';
import { loadDevelopmentRentalRequests } from '@/features/bookings/data/live-admin-rental-request-repository';

export const dynamic = 'force-dynamic';

export default async function BookingsPage() {
  const session = await requireStaffCapability('bookings.read');
  const fixtureMode = process.env.NODE_ENV !== 'production' && process.env.MMG_ADMIN_FIXTURES === '1';

  if (fixtureMode) {
    return <BookingOperations mode="fixture" />;
  }

  let snapshot = null;
  let requestSnapshot = null;
  let loadError: string | null = null;
  let requestLoadError: string | null = null;

  try {
    snapshot = await loadDevelopmentInterventionCases();
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Booking intervention data could not be loaded.';
  }

  try {
    requestSnapshot = await loadDevelopmentRentalRequests();
  } catch (error) {
    requestLoadError = error instanceof Error ? error.message : 'Rental request data could not be loaded.';
  }

  return (
    <BookingInterventionDesk
      canManageRequests={staffSessionHasCapability(session, 'bookings.manage_requests')}
      error={loadError}
      requestError={requestLoadError}
      requestSnapshot={requestSnapshot}
      session={session}
      snapshot={snapshot}
    />
  );
}
