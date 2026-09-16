import { AlertTriangle, ArrowRight, CreditCard } from 'lucide-react';
import Link from 'next/link';

import { formatNairaFromKobo } from '@mmg/domain';

import { AdminOperationsShell } from '@/components/admin-operations-shell';
import type { StaffSession } from '@/features/auth/server/session';
import type { AdminPaymentsSnapshot } from '../data/admin-payment-repository';

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  }).format(new Date(value));
}

function statusTone(state: string) {
  if (state === 'succeeded' || state === 'refunded') return 'green';
  if (state === 'failed' || state === 'refund_failed') return 'red';
  return 'gold';
}

export function PaymentsDesk({
  session,
  snapshot,
  error,
}: {
  session: StaffSession;
  snapshot: AdminPaymentsSnapshot | null;
  error?: string | null;
}) {
  const payments = snapshot?.payments ?? [];
  const successful = payments.filter((payment) => payment.state === 'succeeded');
  const successfulVolumeKobo = successful.reduce((total, payment) => total + payment.amountKobo, 0);
  const pending = payments.filter((payment) => payment.state === 'pending' || payment.state === 'initialized').length;

  return (
    <AdminOperationsShell
      activeSection="payments"
      eyebrow="FINANCE OPERATIONS"
      headerMeta={(
        <>
          <strong>{snapshot?.projectId ?? 'Development data'}</strong>
          <span>{session.role.replaceAll('_', ' ')}</span>
        </>
      )}
      staffEmail={session.email}
      staffRole={session.role}
      title="Payments"
    >
      {error ? <div className="admin-inline-error" role="alert"><AlertTriangle size={16} />{error}</div> : null}
      {snapshot?.skippedInvalidCount ? (
        <div className="admin-inline-error" role="status">
          <AlertTriangle size={16} />
          {snapshot.skippedInvalidCount} record{snapshot.skippedInvalidCount === 1 ? '' : 's'} could not be shown.
        </div>
      ) : null}

      <div className="admin-summary-row" aria-label="Payment summary">
        <div className="admin-summary-item"><span>Recent payments</span><strong>{payments.length}</strong></div>
        <div className="admin-summary-item"><span>Successful</span><strong>{successful.length}</strong></div>
        <div className="admin-summary-item"><span>Verified volume</span><strong>{formatNairaFromKobo(successfulVolumeKobo)}</strong></div>
        <div className="admin-summary-item"><span>Pending</span><strong>{pending}</strong></div>
      </div>

      <div className="admin-table-panel" style={{ marginTop: 18 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Payment</th>
              <th>Booking context</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Updated</th>
              <th aria-label="Open transaction" />
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr><td className="admin-empty" colSpan={6}>No payment records yet.</td></tr>
            ) : payments.map((payment) => (
              <tr key={payment.paymentId}>
                <td>
                  <div className="admin-primary admin-mono">{payment.reference}</div>
                  <div className="admin-secondary admin-mono">{payment.paymentId}</div>
                  <div className="admin-secondary">Renter {payment.renterReference}</div>
                </td>
                <td>
                  <div className="admin-primary">Intent {payment.intentId}</div>
                  <div className="admin-secondary">{payment.rentalRequestId ? `Request ${payment.rentalRequestId}` : 'Historical pay-first flow'}</div>
                  <div className="admin-secondary">{payment.vehicleId ? `Vehicle ${payment.vehicleId}` : 'Vehicle context unavailable'}</div>
                </td>
                <td>
                  <div className="admin-primary">{formatNairaFromKobo(payment.amountKobo)}</div>
                  <div className="admin-secondary">{payment.environment ?? 'environment pending'} · NGN</div>
                </td>
                <td>
                  <span className={`admin-status ${statusTone(payment.state)}`}>{payment.state.replaceAll('_', ' ')}</span>
                  <div className="admin-secondary">Provider {payment.providerStatus ?? 'not verified yet'}</div>
                  <div className="admin-secondary">{payment.verificationOutcome?.replaceAll('_', ' ') ?? 'Verification pending'}</div>
                </td>
                <td>
                  <div className="admin-primary">{formatTimestamp(payment.updatedAt)}</div>
                  <div className="admin-secondary">Created {formatTimestamp(payment.createdAt)}</div>
                </td>
                <td>
                  <Link className="ops-row-action" href={`/payments/${encodeURIComponent(payment.paymentId)}`} aria-label={`Open payment ${payment.reference}`}>
                    <CreditCard size={16} />
                    <ArrowRight size={15} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminOperationsShell>
  );
}
