import { AlertTriangle, ShieldCheck } from 'lucide-react';

import { formatNairaFromKobo } from '@mmg/domain';

import { AdminOperationsShell } from '@/components/admin-operations-shell';
import type { StaffSession } from '@/features/auth/server/session';
import type { StaffInterventionSnapshot } from '../data/live-admin-booking-case-repository';
import type { AdminRentalRequestSnapshot } from '../data/live-admin-rental-request-repository';
import { RentalRequestQueue } from './rental-request-queue';

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
  requestSnapshot,
  error,
  requestError,
  canManageRequests,
}: {
  session: StaffSession;
  snapshot: StaffInterventionSnapshot | null;
  requestSnapshot: AdminRentalRequestSnapshot | null;
  error?: string | null;
  requestError?: string | null;
  canManageRequests: boolean;
}) {
  const cases = snapshot?.cases ?? [];
  const requests = requestSnapshot?.requests ?? [];
  const urgentCount = cases.filter((item) => item.priority === 'urgent' || item.caseType === 'paid_conflict').length;

  return (
    <AdminOperationsShell
      activeSection="bookings"
      eyebrow="REQUEST-FIRST OPERATIONS"
      headerMeta={(
        <>
          <strong>Development data</strong>
          <span>{requestSnapshot?.projectId ?? snapshot?.projectId ?? 'mmg-concierge-dev'} · {session.role.replaceAll('_', ' ')}</span>
        </>
      )}
      staffEmail={session.email}
      staffRole={session.role}
      title="Booking concierge"
    >
      {requestError ? <div className="admin-inline-error" role="alert"><AlertTriangle size={16} />{requestError}</div> : null}
      {requestSnapshot?.skippedInvalidCount ? (
        <div className="admin-inline-error" role="status">
          <AlertTriangle size={16} />
          {requestSnapshot.skippedInvalidCount} malformed request/contact record{requestSnapshot.skippedInvalidCount === 1 ? '' : 's'} were partially hidden.
        </div>
      ) : null}

      <RentalRequestQueue requests={requests} canManage={canManageRequests} />

      <section style={{ marginTop: 36 }} aria-label="Booking interventions">
        <div className="admin-summary-row" aria-label="Intervention summary">
          <div className="admin-summary-item"><span>Open intervention cases</span><strong>{cases.length}</strong></div>
          <div className="admin-summary-item"><span>Urgent</span><strong>{urgentCount}</strong></div>
        </div>

        {error ? <div className="admin-inline-error" role="alert" style={{ marginTop: 14 }}><AlertTriangle size={16} />{error}</div> : null}
        {snapshot?.skippedInvalidCount ? (
          <div className="admin-inline-error" role="status" style={{ marginTop: 14 }}>
            <AlertTriangle size={16} />
            {snapshot.skippedInvalidCount} malformed case record{snapshot.skippedInvalidCount === 1 ? '' : 's'} were hidden.
          </div>
        ) : null}

        <div className="admin-table-panel" style={{ marginTop: 18 }}>
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
      </section>

      <div className="locked-action" style={{ marginTop: 18 }}>
        <ShieldCheck size={17} />
        <span>
          <strong>Bounded concierge authority</strong>
          Support and super-admin may approve or decline soft requests and open the 30-minute payment window. Refunds, payouts, reassignment and arbitrary paid-booking changes remain unavailable from this desk.
        </span>
      </div>
    </AdminOperationsShell>
  );
}
