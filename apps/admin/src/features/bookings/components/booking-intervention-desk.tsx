import { AlertTriangle, Car, LayoutList, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { formatNairaFromKobo } from '@mmg/domain';

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
    <div className="operations-shell">
      <aside className="sidebar">
        <div className="brand-lockup" aria-label="MMG Concierge Operations">
          <span className="brand-mark">MMG</span>
        </div>
        <nav aria-label="Operations navigation" className="primary-nav">
          <a aria-current="page" href="#cases"><LayoutList size={17} />Interventions<span className="nav-count">{cases.length}</span></a>
          <Link href="/vehicles"><Car size={17} />Vehicle Moderation</Link>
          <Link href="/owners"><ShieldCheck size={17} />Owner Verification</Link>
        </nav>
      </aside>

      <main className="workspace" id="cases">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">READ-ONLY OPERATIONS</p>
            <h1>Booking interventions</h1>
          </div>
          <div className="header-status">
            <span className="environment-dot fixture" />
            <div>
              <strong>Development data</strong>
              <span>{snapshot?.projectId ?? 'mmg-concierge-dev'} · {session.role.replaceAll('_', ' ')}</span>
            </div>
          </div>
        </header>

        <section aria-label="Intervention summary" className="summary-strip">
          <div><span>OPEN CASES</span><strong>{cases.length}</strong><small>Trusted booking intervention records</small></div>
          <div><span>URGENT</span><strong>{urgentCount}</strong><small>Paid conflicts and urgent cases</small></div>
        </section>

        {error ? (
          <div className="inline-error" role="alert"><AlertTriangle size={16} />{error}</div>
        ) : null}

        {snapshot?.skippedInvalidCount ? (
          <div className="inline-error" role="status">
            <AlertTriangle size={16} />
            {snapshot.skippedInvalidCount} malformed case record{snapshot.skippedInvalidCount === 1 ? '' : 's'} were hidden.
          </div>
        ) : null}

        <section aria-label="Booking intervention cases" className="queue-panel" style={{ marginTop: 24 }}>
          <div className="queue-head"><span>CASE</span><span>JOURNEY</span><span>VALUE</span><span>STATUS</span></div>
          {cases.length === 0 ? (
            <div className="queue-state">
              <ShieldCheck size={24} />
              <strong>No intervention cases</strong>
              <span>Paid conflicts and owner-declined paid bookings will appear here.</span>
            </div>
          ) : (
            <div className="queue-list">
              {cases.map((item) => (
                <article className="booking-row" key={item.caseId} style={{ cursor: 'default' }}>
                  <span className="booking-identity">
                    <span>
                      <strong>{typeLabel(item.caseType)}</strong>
                      <small>{item.caseId}</small>
                    </span>
                  </span>
                  <span className="journey-cell">
                    <strong>{item.vehicleDisplayName}</strong>
                    <small>{formatDate(item.startDate)} to {formatDate(item.endDate)} · {item.areaLabel}</small>
                  </span>
                  <span className="value-cell">
                    <strong>{formatNairaFromKobo(item.renterTotalKobo)}</strong>
                    <small>{item.paymentId ? `Payment ••••${item.paymentId.slice(-6)}` : 'Trusted paid context'}</small>
                  </span>
                  <span className={`status-badge ${item.caseType === 'paid_conflict' ? 'red' : 'gold'}`}>
                    <i />{item.caseStatus.replaceAll('_', ' ').toUpperCase()}
                  </span>
                  <div style={{ gridColumn: '1 / -1', padding: '0 0 8px' }}>
                    <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>{item.reason}</p>
                    <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 12 }}>
                      Renter {item.renterReference} · Owner {item.ownerReference} · Vehicle {item.vehicleId} · Opened {formatTimestamp(item.openedAt)}
                    </p>
                    {item.bookingId ? <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>Booking {item.bookingId}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="locked-action" style={{ marginTop: 18 }}>
          <ShieldCheck size={17} />
          <span>
            <strong>Read-only desk</strong>
            Staff can inspect trusted intervention state here. Owner confirm/reject, refunds, reassignment and payment changes are not available from this desk.
          </span>
        </div>
      </main>
    </div>
  );
}
