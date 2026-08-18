import 'server-only';

import { requireStaffCapability } from '@/features/auth/server/session';
import { BookingOperations } from '@/features/bookings/components/booking-operations';
import { createFixtureAdminBookingGateway } from '@/features/bookings/data/fixture-admin-booking-gateway';
import { FirestoreAdminBookingGateway } from '@/features/bookings/data/firestore-admin-booking-gateway';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  // Privileged booking operations desk. Enforces the 'bookings.read' capability
  // server-side so unauthorized staff members are redirected to /access-denied.
  const session = await requireStaffCapability('bookings.read');

  const fixtureMode =
    process.env.NODE_ENV !== 'production' && process.env.MMG_ADMIN_FIXTURES === '1';

  const gateway = fixtureMode
    ? createFixtureAdminBookingGateway()
    : new FirestoreAdminBookingGateway();

  const initialBookings = await gateway.listBookings();

  return (
    <BookingOperations
      initialBookings={initialBookings}
      mode={fixtureMode ? 'fixture' : 'live'}
      staffEmail={session.email}
      staffRole={session.role}
    />
  );
}
