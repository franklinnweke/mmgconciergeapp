import 'server-only';

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AdminOperationsShell } from '@/components/admin-operations-shell';
import { requireStaffCapability } from '@/features/auth/server/session';
import { VehicleModerationInspector } from '@/features/vehicles/components/vehicle-moderation-inspector';
import { FirestoreAdminVehicleGateway } from '@/features/vehicles/data/firestore-admin-vehicle-gateway';
import { FixtureAdminVehicleGateway } from '@/features/vehicles/data/fixture-admin-vehicle-gateway';

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
    <AdminOperationsShell
      activeSection="vehicles"
      eyebrow="VEHICLE MODERATION"
      headerMeta={(
        <>
          <strong>{vehicle.moderationStatus.replaceAll('_', ' ')}</strong>
          <span>{vehicle.areaLabel} · v{vehicle.version}</span>
        </>
      )}
      staffEmail={session.email}
      staffRole={session.role}
      title={`${vehicle.make} ${vehicle.model}`}
    >
      <div className="admin-detail-back">
        <Link className="admin-page-link" href="/vehicles">Back to vehicles</Link>
      </div>
      <VehicleModerationInspector
        vehicle={vehicle}
        staffEmail={session.email}
        staffRole={session.role}
      />
    </AdminOperationsShell>
  );
}
