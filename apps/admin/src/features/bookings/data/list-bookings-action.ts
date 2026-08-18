'use server';

import 'server-only';

import { headers } from 'next/headers';

import { assertSameOrigin } from '@/features/auth/server/same-origin';
import { requireLiveStaffSession, staffSessionHasCapability } from '@/features/auth/server/session';

import type { AdminBooking } from '../domain/admin-booking';
import { createFixtureAdminBookingGateway } from './fixture-admin-booking-gateway';
import { FirestoreAdminBookingGateway } from './firestore-admin-booking-gateway';

export async function fetchAdminBookingsAction(): Promise<
  { success: true; bookings: readonly AdminBooking[] } | { success: false; error: string }
> {
  try {
    assertSameOrigin(await headers());
    const session = await requireLiveStaffSession();
    if (!staffSessionHasCapability(session, 'bookings.read')) {
      return { success: false, error: 'You are not authorized to view bookings.' };
    }

    const isFixture =
      process.env.NODE_ENV !== 'production' && process.env.MMG_ADMIN_FIXTURES === '1';
    const gateway = isFixture
      ? createFixtureAdminBookingGateway()
      : new FirestoreAdminBookingGateway();
    const bookings = await gateway.listBookings();
    return { success: true, bookings };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch bookings.' };
  }
}
