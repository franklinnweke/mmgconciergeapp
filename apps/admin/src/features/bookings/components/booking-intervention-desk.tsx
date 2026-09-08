import { AlertTriangle, ShieldCheck } from 'lucide-react';

import { formatNairaFromKobo } from '@mmg/domain';

import { AdminOperationsShell } from '@/components/admin-operations-shell';
import type { StaffSession } from '@/features/auth/server/session';
import type { StaffInterventionSnapshot } from '../data/live-admin-booking-case-repository';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  }).format(new Date(`${value}T12:00:00+01:00`));
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  }).format(new Date(value));
}

function typeLabel(type: 'paid_conflict' | 'owner_rejection') {
  return type === 'paid_conflict' ? 'Paid conflict' : 'Owner declined';
}

export function BookingInterventionDesk({
  session,
  snapshot,
  error,
}: {
  session: StaffSession;
  snapshot: StaffInterventionSnapshot | null;
  error?: string | null;
}) {
  const cases = snapshot?.cases ?? [];
  const urgentCount = cases.filter((item) => item.priority === 'urgent' || item.caseType === 'paid_conflict').length;

  return (
    <AdminOperationsShell
      activeSection="bookings"
      eyebrow="READ-ONLY OPERATIONS"
      headerMeta={(
        <>
          <strong>Development data</strong>
          <span>{snapshot?.projectId ?? 'mmg-concierge-dev'} · {session.role.replaceAll('_', ' ')}</span>
        </>
      )}
      staffEmail={session.email}
      staffRole={session.role}
      title="Booking interventions"
    >
      <section className="admin-summary-row" aria-label="Intervention summary">
        <div className="admin-summary-item"><span>Open cases</span><strong>{cases.length}</strong></div>
        <div className="admin-summary-item"><span>Urgent</span><strong>{urgentCount}</strong></div>
      </section>

      {error ? <div className="admin-inline-error" role="alert"><AlertTriangle size={16} />{error}</div> : null}
      {snapshot?.skippedInvalidCount ? (
        <div className="admin-inline-error" role="status">
          <AlertTriangle size={16} />
          {snapshot.skippedInvalidCount} malformed case record{snapshot.skippedInvalidCount === 1 ? '' : 's'} were hidden.
        </div>
      ) : null}

      <div className="admin-table-panel" style={{ marginTop: 22 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Case</th>
              <th>Journey</th>
              <th>Value</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 ? (
              <tr><td className="admin-empty" colSpan={4}>No intervention cases. Paid conflicts and owner-declined paid bookings will appear here.</td></tr>
            ) : cases.map((item) => (
              <tr key={item.caseId}>
                <td>
                  <div className="admin-primary">{typeLabel(item.caseType)}</div>
                  <div className="admin-secondary admin-mono">{item.caseId}</div>
                  <div className="admin-secondary">Opened {formatTimestamp(item.openedAt)}</div>
                </td>
                <td>
                  <div className="admin-primary">{item.vehicleDisplayName}</div>
                  <div className="admin-secondary">{formatDate(item.startDate)} to {formatDate(item.endDate)} · {item.areaLabel}</div>
                  <div className="admin-secondary">{item.reason}</div>
                </td>
                <td>
                  <div className="admin-primary">{formatNairaFromKobo(item.renterTotalKobo)}</div>
                  <div className="admin-secondary">{item.paymentId ? `Payment ••••${item.paymentId.slice(-6)}` : 'Trusted paid context'}</div>
                </td>
                <td>
                  <span className={`admin-status ${item.caseType === 'paid_conflict' ? 'red' : 'gold'}`}>
                    {item.caseStatus.replaceAll('_', ' ')}
                  </span>
                  <div className="admin-secondary">Renter {item.renterReference}</div>
                  <div className="admin-secondary">Owner {item.ownerReference}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="locked-action" style={{ marginTop: 16 }}>
        <ShieldCheck size={17} />
        <span>
          <strong>Read-only desk</strong>
          Staff can inspect trusted intervention state here. Owner confirm/reject, refunds, reassignment and payment changes are not available from this desk.
        </span>
      </div>
    </AdminOperationsShell>
  );
}
