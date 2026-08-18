import 'server-only';

import { notFound } from 'next/navigation';
import { requireStaffCapability } from '@/features/auth/server/session';
import { FirestoreAdminVehicleGateway } from '@/features/vehicles/data/firestore-admin-vehicle-gateway';
import { FixtureAdminVehicleGateway } from '@/features/vehicles/data/fixture-admin-vehicle-gateway';
import { VehicleModerationInspector } from '@/features/vehicles/components/vehicle-moderation-inspector';

export const dynamic = 'force-dynamic';

export default async function VehicleInspectorPage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const session = await requireStaffCapability('vehicles.read');
  const { vehicleId } = await params;

  const isFixture =
    process.env.NODE_ENV !== 'production' && process.env.MMG_ADMIN_FIXTURES === '1';
  const gateway = isFixture
    ? new FixtureAdminVehicleGateway()
    : new FirestoreAdminVehicleGateway();

  const vehicle = await gateway.getVehicleDetail(vehicleId);
  if (!vehicle) {
    notFound();
  }

  return (
    <VehicleModerationInspector
      vehicle={vehicle}
      staffEmail={session.email}
      staffRole={session.role}
    />
  );
}
