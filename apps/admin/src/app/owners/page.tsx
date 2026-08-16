import 'server-only';

import { requireLiveStaffSession } from '@/features/auth/server/session';
import { FirestoreAdminOwnerGateway } from '@/features/owners/data/firestore-admin-owner-gateway';
import { FixtureAdminOwnerGateway } from '@/features/owners/data/fixture-admin-owner-gateway';
import { OwnerVerificationQueue } from '@/features/owners/components/owner-verification-queue';

export const dynamic = 'force-dynamic';

export default async function OwnersQueuePage() {
  const session = await requireLiveStaffSession();

  const isFixture =
    process.env.NODE_ENV !== 'production' && process.env.MMG_ADMIN_FIXTURES === '1';
  const gateway = isFixture
    ? new FixtureAdminOwnerGateway()
    : new FirestoreAdminOwnerGateway();

  const items = await gateway.listOwnerVerifications();

  return (
    <OwnerVerificationQueue
      items={items}
      staffEmail={session.email}
      staffRole={session.role}
    />
  );
}
