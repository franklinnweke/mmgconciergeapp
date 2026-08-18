import 'server-only';

import { notFound } from 'next/navigation';

import { requireStaffCapability } from '@/features/auth/server/session';
import { FirestoreAdminOwnerGateway } from '@/features/owners/data/firestore-admin-owner-gateway';
import { FixtureAdminOwnerGateway } from '@/features/owners/data/fixture-admin-owner-gateway';
import { OwnerVerificationInspector } from '@/features/owners/components/owner-verification-inspector';

export const dynamic = 'force-dynamic';

export type OwnerInspectorPageProps = {
  params: Promise<{
    ownerId: string;
  }>;
};

export default async function OwnerInspectorPage({ params }: OwnerInspectorPageProps) {
  // This page mints ≤15-minute signed URLs to government ID documents, so the
  // capability check must pass before any gateway read happens.
  const session = await requireStaffCapability('owners.read');
  const { ownerId } = await params;

  const isFixture =
    process.env.NODE_ENV !== 'production' && process.env.MMG_ADMIN_FIXTURES === '1';
  const gateway = isFixture
    ? new FixtureAdminOwnerGateway()
    : new FirestoreAdminOwnerGateway();

  const detail = await gateway.getOwnerVerificationDetail(ownerId);
  if (!detail) {
    notFound();
  }

  return (
    <OwnerVerificationInspector
      detail={detail}
      staffEmail={session.email}
      staffRole={session.role}
    />
  );
}
