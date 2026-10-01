import 'server-only';

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AdminOperationsShell } from '@/components/admin-operations-shell';
import { requireStaffCapability } from '@/features/auth/server/session';
import { OwnerVerificationInspector } from '@/features/owners/components/owner-verification-inspector';
import { FirestoreAdminOwnerGateway } from '@/features/owners/data/firestore-admin-owner-gateway';
import { FixtureAdminOwnerGateway } from '@/features/owners/data/fixture-admin-owner-gateway';

export const dynamic = 'force-dynamic';

export type OwnerInspectorPageProps = {
  params: Promise<{
    ownerId: string;
  }>;
};

export default async function OwnerInspectorPage({ params }: OwnerInspectorPageProps) {
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
    <AdminOperationsShell
      activeSection="owners"
      eyebrow="OWNER VERIFICATION"
      headerMeta={(
        <>
          <strong>{detail.status.replaceAll('_', ' ')}</strong>
          <span>Owner review</span>
        </>
      )}
      staffEmail={session.email}
      staffRole={session.role}
      title={detail.legalName || 'Owner review'}
    >
      <div className="admin-detail-back">
        <Link className="admin-page-link" href="/owners">Back to owners</Link>
      </div>
      <OwnerVerificationInspector
        key={`${detail.ownerId}:${detail.version}:${detail.status}`}
        detail={detail}
        staffEmail={session.email}
        staffRole={session.role}
      />
    </AdminOperationsShell>
  );
}
