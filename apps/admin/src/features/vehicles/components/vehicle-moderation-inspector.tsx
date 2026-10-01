'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VehicleModerationStatus } from '@mmg/contracts';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';

import { type VehicleChecklistKey, type VehicleModerationDetail, VEHICLE_CHECKLIST_ITEMS } from '../domain/types';

export type VehicleModerationInspectorProps = {
  vehicle: VehicleModerationDetail;
  staffEmail?: string;
  staffRole?: string;
};

const STATUS: Record<VehicleModerationStatus, string> = {
  draft: 'Draft', pending_review: 'Pending review', approved: 'Approved', rejected: 'Changes requested', suspended: 'Suspended',
};

function safeActionError(status: number): string {
  if (status === 409) return 'This vehicle changed while you were reviewing it. Refresh and review the current record.';
  if (status === 401 || status === 403) return 'Your staff session cannot perform this review action.';
  if (status >= 500) return 'The review service is temporarily unavailable. Try again.';
  return 'The review action could not be completed. Check the current record and try again.';
}

export async function extractSafeErrorMessage(res: Response): Promise<{ message: string; isStaleVersion: boolean }> {
  try {
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    if (typeof data.error === 'string') {
      const message = data.error.trim();
      if (message.length > 0 && message.length <= 256) return { message, isStaleVersion: message.includes('This vehicle changed') };
    }
  } catch {
    // Use the safe status-based message below.
  }
  return { message: safeActionError(res.status), isStaleVersion: false };
}

export function getVehicleActionWarning(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('warning' in body)) return null;
  const warning = (body as { warning?: unknown }).warning;
  return typeof warning === 'string' && warning ? warning : null;
}

function formatNaira(kobo: number): string {
  return `₦${Math.floor(kobo / 100).toLocaleString('en-NG')}`;
}

export function VehicleModerationInspector({ vehicle }: VehicleModerationInspectorProps) {
  const router = useRouter();
  const [checkedKeys, setCheckedKeys] = useState<Record<VehicleChecklistKey, boolean>>({
    images_complete_and_legible: false,
    specs_match_images: false,
    plate_matches_documents: false,
    lagos_base_plausible: false,
    rate_plausible: false,
    chauffeur_delivery_included: false,
    no_fraud_indicators: false,
  });
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [rejectionReason, setRejectionReason] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  const checkedCount = Object.values(checkedKeys).filter(Boolean).length;
  const allChecked = checkedCount === VEHICLE_CHECKLIST_ITEMS.length;
  const activeImage = vehicle.images[activeImageIndex] || vehicle.images[0] || {
    uploadId: 'thumbnail', originalFileName: 'Vehicle photo', previewUrl: vehicle.thumbnailUrl,
    isPrimary: true, byteSize: 0, contentType: 'image/jpeg',
  };

  const submitDecision = async (decision: 'approve' | 'reject' | 'suspend' | 'restore', reason?: string) => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const response = await fetch(`/api/vehicles/${vehicle.vehicleId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, expectedVersion: vehicle.version, ...(reason ? { reason: reason.trim() } : {}), ...(decision === 'approve' ? { checklist: checkedKeys } : {}) }),
      });
      if (!response.ok) {
        const result = await extractSafeErrorMessage(response);
        if (result.isStaleVersion) router.refresh();
        setErrorMsg(result.message);
        return;
      }

      const body = (await response.json().catch(() => ({}))) as { warning?: string };
      const warning = getVehicleActionWarning(body);
      if (warning) setErrorMsg(warning);
      else setSuccessMsg(`${decision === 'approve' ? 'Approval' : decision === 'reject' ? 'Review decision' : decision === 'suspend' ? 'Suspension' : 'Restore'} recorded. Reloading the authoritative vehicle state.`);
      router.refresh();
    } catch {
      setErrorMsg(safeActionError(500));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="review-inspector vehicle-review" aria-label="Vehicle moderation review">
      <div className="review-grid">
        <div className="review-evidence vehicle-review-evidence">
          <section className="review-section" aria-label="Vehicle photographs">
            <div className="vehicle-review-photo">
              {failedImageUrl === activeImage.previewUrl ? <div className="review-evidence-state"><AlertTriangle aria-hidden="true" /><strong>Photo preview unavailable</strong><span>The submitted image could not be loaded.</span></div> : <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={activeImage.previewUrl} alt={`${vehicle.make} ${vehicle.model}, photo ${activeImageIndex + 1}`} onError={() => setFailedImageUrl(activeImage.previewUrl)} ref={(node) => { if (node?.complete && node.naturalWidth === 0) setFailedImageUrl(activeImage.previewUrl); }} />
              </>}
              <a className="vehicle-photo-open" href={activeImage.previewUrl} target="_blank" rel="noreferrer" aria-label="Open vehicle photo in a new tab"><ExternalLink size={16} /></a>
            </div>
            <div className="review-summary">Photo {activeImageIndex + 1} of {Math.max(vehicle.images.length, 1)}</div>
            {vehicle.images.length > 1 && (
              <div className="vehicle-review-thumbnails" aria-label="Vehicle photos">
                {vehicle.images.map((image, index) => (
                  <button key={image.uploadId} type="button" aria-label={`Show photo ${index + 1}`} aria-pressed={activeImageIndex === index} onClick={() => setActiveImageIndex(index)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.previewUrl} alt="" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
                  </button>
                ))}
              </div>
            )}
            <details className="review-details"><summary>Photo file details</summary><dl className="review-facts review-facts-compact">{vehicle.images.map((image) => <div key={image.uploadId}><dt>{image.isPrimary ? 'Primary photo' : 'Vehicle photo'}</dt><dd>{image.originalFileName} · {(image.byteSize / (1024 * 1024)).toFixed(2)} MiB · {image.contentType}</dd></div>)}</dl></details>
          </section>

          <section className="review-section" aria-labelledby="vehicle-specs-title">
            <div className="vehicle-review-title">
              <div><h2 id="vehicle-specs-title">{vehicle.make} {vehicle.model}</h2><p>{vehicle.year} · {vehicle.category === 'executive_suv' ? 'SUV' : 'Sedan'} · {vehicle.seats} seats</p></div>
              <div><p>Daily rate</p><strong className="vehicle-review-price">{formatNaira(vehicle.dailyRateKobo)}</strong></div>
            </div>
            <dl className="review-facts">
              <div><dt>Owner</dt><dd>{vehicle.ownerLegalName || 'Name unavailable'}</dd></div>
              <div><dt>Registration plate</dt><dd>{vehicle.plateMasked}</dd></div>
              <div><dt>Transmission</dt><dd>{vehicle.transmission}</dd></div>
              <div><dt>Exterior colour</dt><dd>{vehicle.colour}</dd></div>
              <div><dt>Lagos base</dt><dd>{vehicle.areaLabel}</dd></div>
              <div><dt>Availability</dt><dd>{vehicle.visibility === 'active' ? 'Active' : vehicle.visibility === 'deleted' ? 'Deleted' : 'Unavailable'}</dd></div>
              <div><dt>Renter discovery</dt><dd>{vehicle.discoverable ? 'Discoverable' : 'Not discoverable'}</dd></div>
            </dl>
            {vehicle.description && <div className="vehicle-review-description"><h3>Owner description</h3><p>{vehicle.description}</p></div>}
            {vehicle.reviewedAt && <p className="review-muted">Reviewed {new Date(vehicle.reviewedAt).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos' })}{vehicle.reviewedByStaffEmail ? ` · ${vehicle.reviewedByStaffEmail}` : ''}</p>}
            {vehicle.lastDecisionReason && <p className="review-state-note"><strong>Latest decision reason:</strong> {vehicle.lastDecisionReason}</p>}
            {vehicle.auditTrailUnavailable && <p className="review-warning">Audit history could not be loaded. This does not mean no decisions were made.</p>}
            <details className="review-details"><summary>Record details</summary><dl className="review-facts review-facts-compact"><div><dt>Vehicle ID</dt><dd className="review-mono">{vehicle.vehicleId}</dd></div><div><dt>Owner ID</dt><dd className="review-mono">{vehicle.ownerId}</dd></div><div><dt>Version</dt><dd>{vehicle.version}</dd></div><div><dt>Image count</dt><dd>{vehicle.imageCount}</dd></div></dl></details>
          </section>
        </div>

        <aside className="review-decision vehicle-review-decision" aria-labelledby="vehicle-decision-title">
          <div className="review-decision-heading"><div><p className="review-eyebrow">VEHICLE REVIEW</p><h2 id="vehicle-decision-title">{STATUS[vehicle.moderationStatus]}</h2></div></div>
          {errorMsg && <p className="review-message review-error" role="alert"><AlertTriangle size={16} />{errorMsg}</p>}
          {successMsg && <p className="review-message review-success" role="status"><CheckCircle2 size={16} />{successMsg}</p>}

          {vehicle.moderationStatus === 'pending_review' && <>
            <fieldset className="review-checklist">
              <legend>Required inspection <span>{checkedCount} / {VEHICLE_CHECKLIST_ITEMS.length}</span></legend>
              <details className="review-inspection-guidance"><summary>Inspection guidance</summary><ul>{VEHICLE_CHECKLIST_ITEMS.map((item) => <li key={item.key}>{item.description}</li>)}</ul></details>
              {VEHICLE_CHECKLIST_ITEMS.map((item) => <label className="review-check" key={item.key}><input type="checkbox" checked={checkedKeys[item.key]} onChange={() => setCheckedKeys((current) => ({ ...current, [item.key]: !current[item.key] }))} /><span>{item.label.replace(/^\d+\.\s*/, '')}</span></label>)}
            </fieldset>
            <button className="review-button review-button-primary" type="button" disabled={isSubmitting || !allChecked} onClick={() => submitDecision('approve')}>{isSubmitting ? <Loader2 className="review-spinner" size={16} /> : <CheckCircle2 size={16} />}Approve listing</button>
            <details className="review-details review-more-actions"><summary>More actions</summary><div className="review-action-form"><label className="review-field-label" htmlFor="vehicle-reject-reason">Changes or rejection reason</label><textarea id="vehicle-reject-reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} minLength={10} maxLength={500} placeholder="At least 10 characters" /><button className="review-button review-button-danger" type="button" disabled={isSubmitting || rejectionReason.trim().length < 10} onClick={() => submitDecision('reject', rejectionReason)}>Confirm changes requested / rejection</button></div></details>
          </>}

          {vehicle.moderationStatus === 'approved' && <>
            <p className="review-state-note">Approved{vehicle.visibility === 'deleted' ? ' · listing deleted' : vehicle.visibility === 'active' ? ' · active' : ' · owner has paused availability'}{vehicle.discoverable ? ' · visible to renters' : ' · not visible to renters'}.</p>
            {vehicle.visibility !== 'deleted' && <details className="review-details review-more-actions"><summary>More actions</summary><div className="review-action-form"><label className="review-field-label" htmlFor="vehicle-suspend-reason">Suspension reason</label><textarea id="vehicle-suspend-reason" value={suspendReason} onChange={(event) => setSuspendReason(event.target.value)} minLength={10} maxLength={500} placeholder="At least 10 characters" /><button className="review-button review-button-danger" type="button" disabled={isSubmitting || suspendReason.trim().length < 10} onClick={() => submitDecision('suspend', suspendReason)}>Confirm suspension</button></div></details>}
          </>}

          {vehicle.moderationStatus === 'suspended' && <>
            <p className="review-state-note">This listing is suspended.{vehicle.lastDecisionReason ? ` ${vehicle.lastDecisionReason}` : ''}</p>
            <button className="review-button review-button-primary" type="button" disabled={isSubmitting} onClick={() => submitDecision('restore')}>{isSubmitting ? <Loader2 className="review-spinner" size={16} /> : <CheckCircle2 size={16} />}Restore to approved fleet</button>
          </>}

          {vehicle.moderationStatus === 'rejected' && <p className="review-state-note">Changes requested. The owner must update the submission before it can be reviewed again.{vehicle.lastDecisionReason ? ` ${vehicle.lastDecisionReason}` : ''}</p>}
          {vehicle.moderationStatus === 'draft' && <p className="review-state-note">This listing is still a draft and has not been submitted for review.</p>}
        </aside>
      </div>
    </section>
  );
}
