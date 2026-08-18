import 'server-only';

import { requireStaffCapability } from '@/features/auth/server/session';
import { VEHICLE_QUEUE_PAGE_SIZE } from '@/features/vehicles/data/admin-vehicle-gateway';
import { FirestoreAdminVehicleGateway } from '@/features/vehicles/data/firestore-admin-vehicle-gateway';
import { FixtureAdminVehicleGateway } from '@/features/vehicles/data/fixture-admin-vehicle-gateway';
import { VehicleModerationQueue } from '@/features/vehicles/components/vehicle-moderation-queue';

export const dynamic = 'force-dynamic';

export default async function VehiclesQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const session = await requireStaffCapability('vehicles.read');
  const { cursor } = await searchParams;
  const requestedCursor = Array.isArray(cursor) ? cursor[0] : cursor;

  const isFixture =
    process.env.NODE_ENV !== 'production' && process.env.MMG_ADMIN_FIXTURES === '1';
  const gateway = isFixture
    ? new FixtureAdminVehicleGateway()
    : new FirestoreAdminVehicleGateway();

  const page = await gateway.listVehicles({
    cursor: requestedCursor,
    pageSize: VEHICLE_QUEUE_PAGE_SIZE,
  });

  return (
    <VehicleModerationQueue
      items={page.items}
      hasMore={page.hasMore}
      nextCursor={page.nextCursor}
      isFirstPage={!requestedCursor}
      staffEmail={session.email}
      staffRole={session.role}
    />
  );
}
