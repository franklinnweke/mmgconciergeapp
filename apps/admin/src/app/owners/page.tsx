import 'server-only';

import { requireStaffCapability } from '@/features/auth/server/session';
import {
  FirestoreAdminOwnerGateway,
  OWNER_QUEUE_PAGE_SIZE,
} from '@/features/owners/data/firestore-admin-owner-gateway';
import { FixtureAdminOwnerGateway } from '@/features/owners/data/fixture-admin-owner-gateway';
import { OwnerVerificationQueue } from '@/features/owners/components/owner-verification-queue';

export const dynamic = 'force-dynamic';

export default async function OwnersQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  // Gated here as well as in the layout: App Router pages fetch independently
  // of their layout, so the layout check alone is not an authorization boundary.
  const session = await requireStaffCapability('owners.read');
  const { cursor } = await searchParams;
  const requestedCursor = Array.isArray(cursor) ? cursor[0] : cursor;

  const isFixture =
    process.env.NODE_ENV !== 'production' && process.env.MMG_ADMIN_FIXTURES === '1';
  const gateway = isFixture
    ? new FixtureAdminOwnerGateway()
    : new FirestoreAdminOwnerGateway();

  const page = await gateway.listOwnerVerifications({
    cursor: requestedCursor,
    pageSize: OWNER_QUEUE_PAGE_SIZE,
  });

  return (
    <OwnerVerificationQueue
      items={page.items}
      hasMore={page.hasMore}
      nextCursor={page.nextCursor}
      isFirstPage={!requestedCursor}
      staffEmail={session.email}
      staffRole={session.role}
    />
  );
}
