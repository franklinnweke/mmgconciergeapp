'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  type OwnerReviewDecision,
  type OwnerVerificationStatus,
} from '@mmg/contracts';
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Loader2 } from 'lucide-react';

import type { OwnerVerificationDetail } from '../domain/types';
import { executeReviewDecisionAction } from '../data/review-owner-verification-action';

export type OwnerVerificationInspectorProps = {
  detail: OwnerVerificationDetail;
  staffEmail?: string;
  staffRole?: string;
};

const CHECKS = [
  ['identity_matches_id', 'Legal name matches government ID'],
  ['document_legible', 'ID document is authentic and legible'],
  ['lagos_address_plausible', 'Lagos address is plausible'],
  ['current_terms_accepted', 'Current terms and commission schedule accepted'],
  ['no_fraud_indicators', 'No fraud or sanction indicators'],
] as const;

const STATUS: Record<OwnerVerificationStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under review', approved: 'Approved',
  rejected: 'Rejected', suspended: 'Suspended', revoked: 'Revoked',
};

function dateLabel(value: string | null): string {
  return value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' }) : '—';
}

export function OwnerVerificationInspector({ detail }: OwnerVerificationInspectorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState({
    identity_matches_id: false,
    document_legible: false,
    lagos_address_plausible: false,
    current_terms_accepted: false,
    no_fraud_indicators: false,
  });
  const [rejectReason, setRejectReason] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeConfirmed, setRevokeConfirmed] = useState(false);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);

  const allChecked = Object.values(checklist).every(Boolean);
  const acceptedCurrentTerms = detail.ownerTermsVersion === CURRENT_OWNER_TERMS_VERSION &&
    detail.commissionTermsVersion === CURRENT_COMMISSION_TERMS_VERSION &&
    detail.privacyNoticeVersion === CURRENT_PRIVACY_NOTICE_VERSION;
  const handleDecision = (decision: OwnerReviewDecision, reason?: string) => {
    setActionError(null);
    startTransition(async () => {
      try {
        const result = await executeReviewDecisionAction({
          ownerId: detail.ownerId,
          expectedVersion: detail.version,
          decision,
          reason: reason?.trim(),
          checklist: decision === 'approve' ? checklist : undefined,
        });
        if (!result.success) {
          setActionError(result.error);
          if (/changed|stale/i.test(result.error)) router.refresh();
        } else router.refresh();
      } catch {
        setActionError('The review action could not be completed. Try again.');
      }
    });
  };

  const revokeAction = (
    <div className="review-action-form">
      <label className="review-field-label" htmlFor="owner-revoke-reason">Reason for revocation</label>
      <textarea id="owner-revoke-reason" value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} minLength={10} maxLength={500} placeholder="At least 10 characters" />
      <label className="review-confirm"><input type="checkbox" checked={revokeConfirmed} onChange={(event) => setRevokeConfirmed(event.target.checked)} /> I understand this permanently revokes owner approval.</label>
      <button className="review-button review-button-danger" type="button" disabled={isPending || revokeReason.trim().length < 10 || !revokeConfirmed} onClick={() => handleDecision('revoke', revokeReason)}>Revoke owner</button>
    </div>
  );

  return (
    <section className="review-inspector owner-review" aria-label="Owner verification review">
      <div className="review-grid">
        <div className="review-evidence">
          <section className="review-section" aria-labelledby="owner-profile-title">
            <h2 id="owner-profile-title">Owner details</h2>
            <dl className="review-facts">
              <div><dt>Legal name</dt><dd>{detail.legalName || '—'}</dd></div>
              <div><dt>Email</dt><dd>{detail.emailMasked || '—'}</dd></div>
              <div><dt>Phone</dt><dd>{detail.phoneMasked || '—'}</dd></div>
              <div><dt>Address</dt><dd>{detail.address ? <>{detail.address.line1}<br />{detail.address.areaLabel}, Lagos, Nigeria</> : '—'}</dd></div>
            </dl>
          </section>

          <section className="review-section" aria-labelledby="owner-id-title">
            <div className="review-section-heading">
              <h2 id="owner-id-title">Government ID</h2>
              <span className="review-private">Private evidence</span>
            </div>
            {detail.governmentId ? (
              <>
                <div className="review-id-preview">
                  {detail.governmentId.bytesState === 'cleared' ? (
                    <div className="review-evidence-state"><AlertTriangle aria-hidden="true" /><strong>Document removed under retention policy</strong><span>The retained image bytes are no longer available for preview.</span></div>
                  ) : detail.governmentId.bytesState === 'deletion_pending' && !detail.documentPreviewUrl ? (
                    <div className="review-evidence-state"><AlertTriangle aria-hidden="true" /><strong>Document removal pending</strong><span>Preview is unavailable while retained bytes are being removed.</span></div>
                  ) : failedPreviewUrl === detail.documentPreviewUrl ? (
                    <div className="review-evidence-state"><AlertTriangle aria-hidden="true" /><strong>Preview unavailable</strong><span>The document could not be loaded securely.</span></div>
                  ) : detail.documentPreviewUrl ? detail.governmentId.contentType === 'application/pdf' ? (
                    <div className="review-evidence-state"><FileText aria-hidden="true" /><strong>PDF document</strong><a href={detail.documentPreviewUrl} target="_blank" rel="noreferrer noopener" referrerPolicy="no-referrer">Open secure preview <ExternalLink size={14} /></a></div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={detail.documentPreviewUrl} alt="Owner government ID document" referrerPolicy="no-referrer" onError={() => setFailedPreviewUrl(detail.documentPreviewUrl)} ref={(node) => { if (node?.complete && node.naturalWidth === 0) setFailedPreviewUrl(detail.documentPreviewUrl); }} />
                  ) : (
                    <div className="review-evidence-state"><AlertTriangle aria-hidden="true" /><strong>Preview unavailable</strong><span>A secure preview could not be prepared.</span></div>
                  )}
                </div>
                <details className="review-details">
                  <summary>Document details</summary>
                  <dl className="review-facts review-facts-compact">
                    <div><dt>Document type</dt><dd>{detail.governmentId.documentKind.replaceAll('_', ' ')}</dd></div>
                    <div><dt>File name</dt><dd>{detail.governmentId.originalFileName}</dd></div>
                    <div><dt>File size</dt><dd>{(detail.governmentId.byteSize / (1024 * 1024)).toFixed(2)} MiB</dd></div>
                    <div><dt>Format</dt><dd>{detail.governmentId.contentType}</dd></div>
                    <div><dt>Upload</dt><dd>{dateLabel(detail.governmentId.uploadedAt)}</dd></div>
                    <div><dt>Retention state</dt><dd>{detail.governmentId.bytesState.replaceAll('_', ' ')}</dd></div>
                    <div><dt>Upload ID</dt><dd className="review-mono">{detail.governmentId.uploadId}</dd></div>
                  </dl>
                </details>
              </>
            ) : detail.documentPreviewUrl ? (
              // Compatibility for records where only the safe preview projection exists.
              // eslint-disable-next-line @next/next/no-img-element
              <div className="review-id-preview"><img src={detail.documentPreviewUrl} alt="Owner government ID document" referrerPolicy="no-referrer" /></div>
            ) : <p className="review-muted">No government ID document is available.</p>}
          </section>

          <section className="review-section" aria-labelledby="owner-terms-title">
            <h2 id="owner-terms-title">Terms acceptance</h2>
            <p className="review-summary">{detail.termsAcceptedAt ? `Accepted ${dateLabel(detail.termsAcceptedAt)} · ${acceptedCurrentTerms ? 'accepted versions are current' : 'review accepted versions'}` : 'Acceptance not recorded'}</p>
            <details className="review-details">
              <summary>Accepted terms and versions</summary>
              <dl className="review-facts review-facts-compact">
                <div><dt>Owner terms</dt><dd>{detail.ownerTermsVersion || '—'}</dd></div>
                <div><dt>Commission schedule</dt><dd>{detail.commissionTermsVersion || '—'}</dd></div>
                <div><dt>Privacy notice</dt><dd>{detail.privacyNoticeVersion || '—'}</dd></div>
              </dl>
            </details>
          </section>

          {(detail.lastDecisionReason || detail.previousDecisionReason || detail.auditLogs || detail.auditTrailUnavailable) && (
            <details className="review-details review-audit">
              <summary>Decision history</summary>
              {detail.lastDecisionReason && <p><strong>Current reason:</strong> {detail.lastDecisionReason}</p>}
              {detail.previousDecisionReason && <p><strong>Previous reason:</strong> {detail.previousDecisionReason}</p>}
              {detail.auditTrailUnavailable ? <p className="review-warning">Audit history could not be loaded. This does not mean no decisions were made.</p> : detail.auditLogs?.length ? (
                <ul className="review-audit-list">{detail.auditLogs.map((log) => <li key={log.logId}><strong>{log.action}</strong><span>{log.role} · {log.actorId} · {dateLabel(log.createdAt)}</span>{log.reason && <p>{log.reason}</p>}</li>)}</ul>
              ) : <p className="review-muted">No recorded review decisions.</p>}
            </details>
          )}
          <details className="review-details review-record-details"><summary>Record details</summary><dl className="review-facts review-facts-compact"><div><dt>Owner ID</dt><dd className="review-mono">{detail.ownerId}</dd></div><div><dt>Version</dt><dd>{detail.version}</dd></div><div><dt>Submitted</dt><dd>{dateLabel(detail.submittedAt)}</dd></div></dl></details>
        </div>

        <aside className="review-decision" aria-labelledby="owner-decision-title">
          <div className="review-decision-heading"><div><p className="review-eyebrow">OWNER REVIEW</p><h2 id="owner-decision-title">{STATUS[detail.status]}</h2></div></div>
          {actionError && <p className="review-message review-error" role="alert"><AlertTriangle size={16} />{actionError}</p>}

          {detail.status === 'submitted' && <>
            <p className="review-muted">The application is submitted and ready for inspection.</p>
            <button className="review-button review-button-primary" type="button" disabled={isPending} onClick={() => handleDecision('start_review')}>{isPending ? <Loader2 className="review-spinner" size={16} /> : null}Start review</button>
          </>}

          {detail.status === 'under_review' && <>
            <fieldset className="review-checklist">
              <legend>Required checks <span>{Object.values(checklist).filter(Boolean).length} / 5</span></legend>
              {CHECKS.map(([key, label]) => <label className="review-check" key={key}><input type="checkbox" checked={checklist[key]} onChange={(event) => setChecklist((current) => ({ ...current, [key]: event.target.checked }))} /><span>{label}</span></label>)}
            </fieldset>
            <button className="review-button review-button-primary" type="button" disabled={isPending || !allChecked} onClick={() => handleDecision('approve')}>{isPending ? <Loader2 className="review-spinner" size={16} /> : <CheckCircle2 size={16} />}Approve owner</button>
            <details className="review-details review-more-actions"><summary>More actions</summary><div className="review-action-form"><label className="review-field-label" htmlFor="owner-reject-reason">Rejection reason</label><textarea id="owner-reject-reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} minLength={10} maxLength={500} placeholder="At least 10 characters" /><button className="review-button review-button-danger" type="button" disabled={isPending || rejectReason.trim().length < 10} onClick={() => handleDecision('reject', rejectReason)}>Reject application</button></div></details>
          </>}

          {detail.status === 'approved' && <>
            <p className="review-state-note">Owner approval is active.</p>
            <details className="review-details review-more-actions"><summary>More actions</summary>
              <div className="review-action-form"><label className="review-field-label" htmlFor="owner-suspend-reason">Suspension reason</label><textarea id="owner-suspend-reason" value={suspendReason} onChange={(event) => setSuspendReason(event.target.value)} minLength={10} maxLength={500} placeholder="At least 10 characters" /><button className="review-button review-button-secondary" type="button" disabled={isPending || suspendReason.trim().length < 10} onClick={() => handleDecision('suspend', suspendReason)}>Suspend owner</button></div>
              {revokeAction}
            </details>
          </>}

          {detail.status === 'suspended' && <>
            <p className="review-state-note">This owner is suspended.{detail.lastDecisionReason ? ` ${detail.lastDecisionReason}` : ''}</p>
            <button className="review-button review-button-primary" type="button" disabled={isPending} onClick={() => handleDecision('restore')}>{isPending ? <Loader2 className="review-spinner" size={16} /> : <CheckCircle2 size={16} />}Restore owner</button>
            <details className="review-details review-more-actions"><summary>More actions</summary>{revokeAction}</details>
          </>}

          {detail.status === 'rejected' && <p className="review-state-note">Application rejected. Updated details may be submitted for another review.</p>}
          {detail.status === 'revoked' && <p className="review-state-note">Owner approval has been revoked.</p>}
          {detail.status === 'draft' && <p className="review-state-note">This owner has not submitted an application for review.</p>}
        </aside>
      </div>
    </section>
  );
}
