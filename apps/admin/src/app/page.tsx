import 'server-only';

import { requireLiveStaffSession } from '@/features/auth/server/session';
import { BookingOperations } from '@/features/bookings/components/booking-operations';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  // Every privileged page enforces the staff session server-side. This route
  // renders operational booking data, so it must not be reachable without a
  // verified staff claim just because it has no live data source yet.
  await requireLiveStaffSession();

  const fixtureMode =
    process.env.NODE_ENV !== 'production' && process.env.MMG_ADMIN_FIXTURES === '1';
  return <BookingOperations mode={fixtureMode ? 'fixture' : 'unavailable'} />;
}
