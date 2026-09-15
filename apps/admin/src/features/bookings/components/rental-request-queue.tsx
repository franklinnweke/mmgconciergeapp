'use client';

import { Check, Copy, Phone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { formatNairaFromKobo } from '@mmg/domain';

import type { AdminRentalRequestRecord } from '../data/live-admin-rental-request-repository';
import type { RentalRequestAdminAction } from '../data/rental-request-action';

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

function stateTone(state: AdminRentalRequestRecord['state']) {
  if (state === 'confirmed') return 'green';
  if (state === 'ready_for_payment') return 'gold';
  if (state === 'needs_attention' || state === 'declined') return 'red';
  return 'muted';
}

function canApprove(state: AdminRentalRequestRecord['state']) {
  return state === 'requested';
}

function canDecline(state: AdminRentalRequestRecord['state']) {
  return state === 'requested' || state === 'approved';
}

function canOpenPayment(state: AdminRentalRequestRecord['state']) {
  return state === 'approved';
}

function PaymentWindowCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const expiry = Date.parse(expiresAt);
  const remaining = Number.isFinite(expiry) ? Math.max(0, expiry - now) : 0;
  const totalSeconds = Math.floor(remaining / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const urgent = remaining > 0 && remaining <= 5 * 60 * 1_000;

  return (
    <div className={`admin-countdown${urgent ? ' urgent' : ''}`} aria-live="polite">
      {remaining <= 0
        ? 'Payment window ended'
        : `Payment window closes in ${minutes}m ${seconds.toString().padStart(2, '0')}s`}
    </div>
  );
}

export function RentalRequestQueue({
  requests,
  canManage,
}: {
  requests: AdminRentalRequestRecord[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedRequestId, setCopiedRequestId] = useState<string | null>(null);

  const copyPhone = async (requestId: string, phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedRequestId(requestId);
      window.setTimeout(() => setCopiedRequestId((current) => current === requestId ? null : current), 1_500);
    } catch {
      setError('The phone number could not be copied. You can still tap it to call.');
    }
  };

  const execute = async (
    request: AdminRentalRequestRecord,
    action: RentalRequestAdminAction,
  ) => {
    if (busyId) return;

    if (action === 'open_payment_window') {
      const approved = window.confirm(
        'Open the 30-minute payment window now? This will create the authoritative availability hold immediately.',
      );
      if (!approved) return;
    }
    if (action === 'decline') {
      const approved = window.confirm(
        'Decline this rental request? No payment will be taken and no availability hold will be created.',
      );
      if (!approved) return;
    }

    setBusyId(request.requestId);
    setError(null);
    try {
      const response = await fetch(`/api/rental-requests/${encodeURIComponent(request.requestId)}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          expectedVersion: request.version,
          ...(action === 'decline' ? { reason: 'Declined by MMG Concierge' } : {}),
        }),
      });
      const result = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || result.success !== true) {
        throw new Error(result.error || 'The request action could not be completed.');
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request action could not be completed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-label="Concierge rental requests" style={{ marginTop: 22 }}>
      <div className="admin-summary-row" aria-label="Rental request summary">
        <div className="admin-summary-item"><span>Rental requests</span><strong>{requests.length}</strong></div>
        <div className="admin-summary-item"><span>Awaiting approval</span><strong>{requests.filter((item) => item.state === 'requested').length}</strong></div>
        <div className="admin-summary-item"><span>Approved</span><strong>{requests.filter((item) => item.state === 'approved').length}</strong></div>
        <div className="admin-summary-item"><span>Payment windows</span><strong>{requests.filter((item) => item.state === 'ready_for_payment').length}</strong></div>
      </div>

      {error ? <div className="admin-inline-error" role="alert" style={{ marginTop: 14 }}>{error}</div> : null}

      <div className="admin-table-panel" style={{ marginTop: 18 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Request</th>
              <th>Journey</th>
              <th>Concierge contact</th>
              <th>Value</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr><td className="admin-empty" colSpan={6}>No concierge rental requests yet.</td></tr>
            ) : requests.map((item) => {
              const busy = busyId === item.requestId;
              const copied = copiedRequestId === item.requestId;
              return (
                <tr key={item.requestId}>
                  <td>
                    <div className="admin-primary">{item.vehicleDisplayName}</div>
                    <div className="admin-secondary admin-mono">{item.requestId}</div>
                    <div className="admin-secondary">Updated {formatTimestamp(item.updatedAt)}</div>
                  </td>
                  <td>
                    <div className="admin-primary">{formatDate(item.startDate)} to {formatDate(item.endDate)}</div>
                    <div className="admin-secondary">{item.serviceAreaLabel}</div>
                    <div className="admin-secondary">Owner {item.ownerReference}</div>
                  </td>
                  <td>
                    {item.contactPhone ? (
                      <div className="admin-contact-actions">
                        <a className="admin-phone-link" href={`tel:${item.contactPhone}`}>
                          <Phone size={14} />
                          <span>{item.contactPhone}</span>
                        </a>
                        <button
                          aria-label={`Copy renter phone ${item.contactPhone}`}
                          className="admin-copy-button"
                          onClick={() => void copyPhone(item.requestId, item.contactPhone!)}
                          title="Copy phone"
                          type="button"
                        >
                          {copied ? <Check size={14} /> : <Copy size={14} />}
                          <span>{copied ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    ) : <div className="admin-primary">Contact unavailable</div>}
                    <div className="admin-secondary">Renter {item.renterReference}</div>
                    <div className="admin-secondary">Private concierge PII</div>
                  </td>
                  <td>
                    <div className="admin-primary">{formatNairaFromKobo(item.renterTotalKobo)}</div>
                    <div className="admin-secondary">Server-derived total</div>
                  </td>
                  <td>
                    <span className={`admin-status ${stateTone(item.state)}`}>{item.state.replaceAll('_', ' ')}</span>
                    {item.state === 'ready_for_payment' && item.holdExpiresAt ? (
                      <PaymentWindowCountdown expiresAt={item.holdExpiresAt} />
                    ) : item.holdExpiresAt ? (
                      <div className="admin-secondary">Window ended {formatTimestamp(item.holdExpiresAt)}</div>
                    ) : null}
                  </td>
                  <td>
                    {!canManage ? <div className="admin-secondary">Read only</div> : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 150 }}>
                        {canApprove(item.state) ? (
                          <button
                            disabled={busy}
                            onClick={() => void execute(item, 'approve')}
                            style={{ minHeight: 34, cursor: busy ? 'wait' : 'pointer' }}
                            type="button"
                          >Approve</button>
                        ) : null}
                        {canOpenPayment(item.state) ? (
                          <button
                            disabled={busy}
                            onClick={() => void execute(item, 'open_payment_window')}
                            style={{ minHeight: 34, cursor: busy ? 'wait' : 'pointer' }}
                            type="button"
                          >Open 30-minute payment</button>
                        ) : null}
                        {canDecline(item.state) ? (
                          <button
                            disabled={busy}
                            onClick={() => void execute(item, 'decline')}
                            style={{ minHeight: 34, cursor: busy ? 'wait' : 'pointer' }}
                            type="button"
                          >Decline</button>
                        ) : null}
                        {!canApprove(item.state) && !canOpenPayment(item.state) && !canDecline(item.state) ? (
                          <div className="admin-secondary">No action available</div>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
