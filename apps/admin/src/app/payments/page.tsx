import 'server-only';

import { requireStaffCapability } from '@/features/auth/server/session';
import { PaymentsDesk } from '@/features/payments/components/payments-desk';
import {
  loadAdminPayments,
  type AdminPaymentsSnapshot,
} from '@/features/payments/data/admin-payment-repository';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const session = await requireStaffCapability('payments.read');
  const fixtureMode = process.env.NODE_ENV !== 'production' && process.env.MMG_ADMIN_FIXTURES === '1';

  let snapshot: AdminPaymentsSnapshot | null = null;
  let error: string | null = null;

  if (fixtureMode) {
    snapshot = { projectId: 'fixture', payments: [], skippedInvalidCount: 0 };
  } else {
    try {
      snapshot = await loadAdminPayments();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Payment operations data could not be loaded.';
    }
  }

  return <PaymentsDesk error={error} session={session} snapshot={snapshot} />;
}
