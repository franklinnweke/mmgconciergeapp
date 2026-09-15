import 'server-only';

import { requireLiveStaffSession } from '@/features/auth/server/session';
import { OperationsDashboard } from '@/features/dashboard/components/operations-dashboard';
import {
  loadOperationsDashboard,
  type OperationsDashboardSnapshot,
} from '@/features/dashboard/data/operations-dashboard-repository';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await requireLiveStaffSession();
  let snapshot: OperationsDashboardSnapshot | null = null;
  let error: string | null = null;

  try {
    snapshot = await loadOperationsDashboard(session);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Operations dashboard data could not be loaded.';
  }

  return <OperationsDashboard error={error} session={session} snapshot={snapshot} />;
}
