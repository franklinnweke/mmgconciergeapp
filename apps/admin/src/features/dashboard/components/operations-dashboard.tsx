import { Activity, ArrowRight, CreditCard, ListChecks } from 'lucide-react';
import Link from 'next/link';

import { AdminOperationsShell } from '@/components/admin-operations-shell';
import type { StaffSession } from '@/features/auth/server/session';
import type { OperationsDashboardSnapshot } from '../data/operations-dashboard-repository';

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  }).format(new Date(value));
}

export function OperationsDashboard({
  session,
  snapshot,
  error,
}: {
  session: StaffSession;
  snapshot: OperationsDashboardSnapshot | null;
  error?: string | null;
}) {
  const metrics = snapshot?.metrics ?? [];
  const activity = snapshot?.activity ?? [];

  return (
    <AdminOperationsShell
      activeSection="dashboard"
      eyebrow="OPERATIONS OVERVIEW"
      headerMeta={(
        <>
          <strong>{snapshot?.projectId ?? 'Development data'}</strong>
          <span>{session.role.replaceAll('_', ' ')}</span>
        </>
      )}
      staffEmail={session.email}
      staffRole={session.role}
      title="Dashboard"
    >
      {error ? <div className="admin-inline-error" role="alert">{error}</div> : null}

      <section aria-label="Operational metrics" className="ops-metric-grid">
        {metrics.map((metric) => (
          <Link className="ops-metric-card" href={metric.href} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value.toLocaleString('en-NG')}</strong>
            <small>{metric.helper}</small>
          </Link>
        ))}
        {metrics.length === 0 ? (
          <div className="ops-empty-panel">No dashboard metrics are available for this staff role.</div>
        ) : null}
      </section>

      <section className="ops-dashboard-section" aria-label="Recent operational activity">
        <div className="ops-section-heading">
          <div>
            <p className="eyebrow">LIVE OPERATIONS</p>
            <h2>Recent activity</h2>
          </div>
          <Activity size={20} />
        </div>

        <div className="ops-activity-list">
          {activity.length === 0 ? (
            <div className="ops-empty-panel">Recent booking and payment activity will appear here.</div>
          ) : activity.map((item) => (
            <Link className="ops-activity-row" href={item.href} key={item.id}>
              <div className="ops-activity-icon" aria-hidden="true">
                {item.kind === 'payment' ? <CreditCard size={17} /> : <ListChecks size={17} />}
              </div>
              <div className="ops-activity-copy">
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
              <div className="ops-activity-meta">
                <span className="admin-status">{item.status}</span>
                <small>{formatTimestamp(item.occurredAt)}</small>
              </div>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
      </section>
    </AdminOperationsShell>
  );
}
