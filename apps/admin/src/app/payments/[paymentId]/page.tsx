import 'server-only';

import { ArrowLeft, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatNairaFromKobo } from '@mmg/domain';

import { AdminOperationsShell } from '@/components/admin-operations-shell';
import { requireStaffCapability } from '@/features/auth/server/session';
import { loadAdminPaymentDetail } from '@/features/payments/data/admin-payment-repository';

export const dynamic = 'force-dynamic';

function formatTimestamp(value: string | null) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Africa/Lagos',
  }).format(new Date(value));
}

export default async function PaymentDetailPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const session = await requireStaffCapability('payments.read');
  const { paymentId } = await params;
  const detail = await loadAdminPaymentDetail(paymentId);
  if (!detail) notFound();

  const { payment, events } = detail;

  return (
    <AdminOperationsShell
      activeSection="payments"
      eyebrow="PAYMENT DETAIL"
      staffEmail={session.email}
      staffRole={session.role}
      title="Transaction"
      headerMeta={<Link className="ops-inline-link" href="/payments"><ArrowLeft size={15} />Payments</Link>}
    >
      <section className="ops-detail-grid" aria-label="Payment transaction detail">
        <div className="ops-detail-panel">
          <p className="eyebrow">TRANSACTION</p>
          <h2>{formatNairaFromKobo(payment.amountKobo)}</h2>
          <dl className="ops-definition-list">
            <div><dt>MMG payment ID</dt><dd className="admin-mono">{payment.paymentId}</dd></div>
            <div><dt>Paystack reference</dt><dd className="admin-mono">{payment.reference}</dd></div>
            <div><dt>Payment state</dt><dd>{payment.state.replaceAll('_', ' ')}</dd></div>
            <div><dt>Provider status</dt><dd>{payment.providerStatus ?? 'Not verified yet'}</dd></div>
            <div><dt>Verification</dt><dd>{payment.verificationOutcome?.replaceAll('_', ' ') ?? 'Pending'}</dd></div>
            <div><dt>Environment</dt><dd>{payment.environment ?? 'Not initialized'}</dd></div>
            <div><dt>Renter</dt><dd>{payment.renterReference}</dd></div>
            <div><dt>Intent</dt><dd className="admin-mono">{payment.intentId}</dd></div>
            <div><dt>Rental request</dt><dd className="admin-mono">{payment.rentalRequestId ?? 'Historical pay-first flow'}</dd></div>
            <div><dt>Vehicle</dt><dd className="admin-mono">{payment.vehicleId ?? 'Not recorded on payment'}</dd></div>
            <div><dt>Payment window / hold</dt><dd>{formatTimestamp(payment.holdExpiresAt)}</dd></div>
            <div><dt>Last verified</dt><dd>{formatTimestamp(payment.lastVerifiedAt)}</dd></div>
            <div><dt>Created</dt><dd>{formatTimestamp(payment.createdAt)}</dd></div>
            <div><dt>Updated</dt><dd>{formatTimestamp(payment.updatedAt)}</dd></div>
          </dl>
        </div>

        <div className="ops-detail-panel">
          <p className="eyebrow">VERIFICATION TIMELINE</p>
          <h2>{events.length} event{events.length === 1 ? '' : 's'}</h2>
          <div className="ops-event-list">
            {events.length === 0 ? <div className="ops-empty-panel">No verification events are linked to this reference yet.</div> : events.map((event) => (
              <div className="ops-event-row" key={event.eventId}>
                <div>
                  <strong>{event.status.replaceAll('_', ' ')}</strong>
                  <span>{event.source} · {event.providerStatus ?? 'provider pending'}</span>
                </div>
                <div>
                  <span>{formatTimestamp(event.receivedAt)}</span>
                  {event.paidAtIso ? <span>Paid {formatTimestamp(event.paidAtIso)}</span> : null}
                </div>
                {event.gatewayResponse ? <p>{event.gatewayResponse}</p> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="locked-action" style={{ marginTop: 18 }}>
        <ShieldCheck size={17} />
        <span><strong>Read-only finance view</strong> Payment truth remains server-authoritative. This desk does not expose refunds, payouts, state mutation, or manual confirmation.</span>
      </div>
    </AdminOperationsShell>
  );
}
