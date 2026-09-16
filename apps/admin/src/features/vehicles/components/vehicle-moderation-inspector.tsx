'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { VehicleModerationStatus } from '@mmg/contracts';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  FileText,
  Maximize2,
} from 'lucide-react';

import {
  type VehicleChecklistKey,
  type VehicleModerationDetail,
  VEHICLE_CHECKLIST_ITEMS,
} from '../domain/types';

export type VehicleModerationInspectorProps = {
  vehicle: VehicleModerationDetail;
  staffEmail?: string;
  staffRole?: string;
};

const STATUS_CONFIG: Record<
  VehicleModerationStatus,
  { label: string; text: string; icon: typeof CheckCircle2 }
> = {
  draft: { label: 'Draft', text: '#9AA0A6', icon: FileText },
  pending_review: { label: 'Pending review', text: '#EAB308', icon: Clock },
  approved: { label: 'Approved', text: '#4ADE80', icon: CheckCircle2 },
  rejected: { label: 'Rejected', text: '#F87171', icon: XCircle },
  suspended: { label: 'Suspended', text: '#EF4444', icon: AlertTriangle },
};

function safeActionError(status: number): string {
  if (status === 409) return 'This vehicle changed while you were reviewing it. Refresh and review the current record.';
  if (status === 401 || status === 403) return 'Your staff session cannot perform this review action.';
  if (status >= 500) return 'The review service is temporarily unavailable. Try again.';
  return 'The review action could not be completed. Check the current record and try again.';
}

function formatNaira(kobo: number): string {
  const naira = Math.floor(kobo / 100);
  return '₦' + naira.toLocaleString('en-NG');
}

export function VehicleModerationInspector({
  vehicle,
  staffEmail,
  staffRole,
}: VehicleModerationInspectorProps) {
  const router = useRouter();

  // Checklist state - starts unchecked so staff explicitly audits all 7 points
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showSuspendForm, setShowSuspendForm] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  const toggleCheck = (key: VehicleChecklistKey) => {
    setCheckedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const checkedCount = Object.values(checkedKeys).filter(Boolean).length;
  const isAllChecked = checkedCount === VEHICLE_CHECKLIST_ITEMS.length;

  const handleApprove = async () => {
    if (!isAllChecked) {
      setErrorMsg('Please complete all 7 inspection checklist items before approving.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/vehicles/${vehicle.vehicleId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'approve',
          expectedVersion: vehicle.version,
          checklist: checkedKeys,
        }),
      });

      if (!res.ok) {
        throw new Error(safeActionError(res.status));
      }

      // Publication is a second step after the decision commits, and it can
      // fail without failing the decision. Never claim the listing went live
      // when the server told us the photos did not publish.
      const body = (await res.json().catch(() => ({}))) as { warning?: string };
      if (typeof body.warning === 'string' && body.warning) {
        setErrorMsg(body.warning);
      } else {
        setSuccessMsg('Approval recorded.');
      }
      router.refresh();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : safeActionError(500));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim() || rejectionReason.trim().length < 10) {
      setErrorMsg('Please provide a specific rationale of at least 10 characters for rejecting.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/vehicles/${vehicle.vehicleId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'reject',
          reason: rejectionReason.trim(),
          expectedVersion: vehicle.version,
        }),
      });

      if (!res.ok) {
        throw new Error(safeActionError(res.status));
      }

      // Owner messaging is not live: reviewVehicle records the decision and
      // reason on the listing but enqueues no notification. Do not claim a
      // dispatch that did not happen.
        setSuccessMsg('Review decision recorded.');
      setShowRejectForm(false);
      router.refresh();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : safeActionError(500));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuspend = async () => {
    if (!suspendReason.trim() || suspendReason.trim().length < 10) {
      setErrorMsg('Please provide a specific rationale of at least 10 characters for suspending.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/vehicles/${vehicle.vehicleId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'suspend',
          reason: suspendReason.trim(),
          expectedVersion: vehicle.version,
        }),
      });

      if (!res.ok) {
        throw new Error(safeActionError(res.status));
      }

      const body = (await res.json().catch(() => ({}))) as { warning?: string };
      if (typeof body.warning === 'string' && body.warning) {
        setErrorMsg(body.warning);
      } else {
        setSuccessMsg('Suspension recorded.');
      }
      setShowSuspendForm(false);
      router.refresh();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : safeActionError(500));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestore = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/vehicles/${vehicle.vehicleId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'restore',
          expectedVersion: vehicle.version,
        }),
      });

      if (!res.ok) {
        throw new Error(safeActionError(res.status));
      }

      const body = (await res.json().catch(() => ({}))) as { warning?: string };
      if (typeof body.warning === 'string' && body.warning) {
        setErrorMsg(body.warning);
      } else {
        setSuccessMsg('Restore recorded.');
      }
      router.refresh();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : safeActionError(500));
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusInfo = STATUS_CONFIG[vehicle.moderationStatus] || STATUS_CONFIG.draft;
  const StatusIcon = statusInfo.icon;
  const activeImage = vehicle.images[activeImageIndex] || { previewUrl: vehicle.thumbnailUrl, originalFileName: 'photo.jpg' };

  return (
    <div className="vehicle-inspector-page" style={{ minHeight: '100vh', backgroundColor: '#090A0C', color: '#F3F4F6' }}>
      <header
        style={{
          borderBottom: '1px solid #1E232E',
          backgroundColor: '#101318',
          padding: '14px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div className="vehicle-inspector-header-main" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link
            href="/vehicles"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#9AA0A6',
              textDecoration: 'none',
              fontSize: '13px',
              padding: '10px 12px',
              minHeight: '44px',
              borderRadius: '6px',
              backgroundColor: '#181D26',
              border: '1px solid #1E232E',
            }}
          >
            <ArrowLeft size={14} />
            <span>Back to Queue</span>
          </Link>
          <nav className="vehicle-inspector-nav" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }} aria-label="Admin sections">
            <Link href="/" style={{ color: '#9AA0A6', textDecoration: 'none', fontSize: '13px', padding: '10px 12px', minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}>Bookings</Link>
            <Link href="/vehicles" aria-current="page" style={{ color: '#F3F4F6', textDecoration: 'none', fontSize: '13px', fontWeight: '600', padding: '10px 12px', minHeight: '44px', display: 'inline-flex', alignItems: 'center', borderBottom: '2px solid #C89D46' }}>Vehicles</Link>
            <Link href="/owners" style={{ color: '#9AA0A6', textDecoration: 'none', fontSize: '13px', padding: '10px 12px', minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}>Owners</Link>
          </nav>
        </div>

        <div className="vehicle-inspector-staff" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {staffEmail && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#F3F4F6' }}>{staffEmail}</div>
              <div style={{ fontSize: '12px', color: '#9AA0A6', textTransform: 'capitalize' }}>
                {staffRole || 'Staff Operator'}
              </div>
            </div>
          )}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '12px',
              fontWeight: '600',
              minHeight: '44px',
              color: statusInfo.text,
            }}
          >
            <StatusIcon size={13} />
            {statusInfo.label}
          </span>
          <div style={{ fontSize: '12px', color: '#6B7280' }}>v{vehicle.version}</div>
        </div>
      </header>

      {/* Main Grid */}
      <main
        className="vehicle-inspector-grid"
        style={{
          maxWidth: '1440px',
          margin: '0 auto',
          padding: '32px',
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: '32px',
        }}
      >
        {/* LEFT COLUMN: Vehicle Details & Photos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Main Photo & Lightbox Frame */}
          <div
            style={{
              backgroundColor: '#101318',
              border: '1px solid #1E232E',
              borderRadius: '10px',
              padding: '16px',
            }}
          >
            <div
              style={{
                position: 'relative',
                height: '340px',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: '#050608',
                border: '1px solid #1E232E',
                backgroundImage: `url(${activeImage.previewUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  backgroundColor: 'rgba(9,10,12,0.85)',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#C89D46',
                  border: '1px solid #28303F',
                }}
              >
                Photo {activeImageIndex + 1} of {Math.max(vehicle.images.length, 1)}
              </div>

              <a
                href={activeImage.previewUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  backgroundColor: 'rgba(9,10,12,0.85)',
                  padding: '10px',
                  minHeight: '44px',
                  minWidth: '44px',
                  borderRadius: '4px',
                  color: '#F9FAFB',
                  border: '1px solid #28303F',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Open high resolution in new tab"
              >
                <Maximize2 size={14} />
              </a>

              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  backgroundColor: 'rgba(9,10,12,0.75)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#9AA0A6',
                }}
              >
                {activeImage.originalFileName}
              </div>
            </div>

            {/* Thumbnail Strip */}
            {vehicle.images.length > 1 && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
                {vehicle.images.map((img, idx) => (
                  <button
                    key={img.uploadId || idx}
                    onClick={() => setActiveImageIndex(idx)}
                    style={{
                      width: '72px',
                      height: '52px',
                      borderRadius: '4px',
                      border: '2px solid',
                      borderColor: activeImageIndex === idx ? '#C89D46' : '#1E232E',
                      backgroundImage: `url(${img.previewUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                      backgroundColor: '#141820',
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Vehicle Specifications Card */}
          <div
            style={{
              backgroundColor: '#101318',
              border: '1px solid #1E232E',
              borderRadius: '10px',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h2
                  style={{
                    fontFamily: 'var(--font-display), Georgia, serif',
                    fontSize: '22px',
                    fontWeight: '600',
                    color: '#F9FAFB',
                    margin: '0 0 4px 0',
                  }}
                >
                  {vehicle.make} {vehicle.model}
                </h2>
                <div style={{ fontSize: '12px', color: '#9AA0A6' }}>
                  Model year {vehicle.year} · {vehicle.category === 'executive_suv' ? 'SUV' : 'Sedan'}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: '#9AA0A6' }}>Daily rate</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#C89D46' }}>
                  {formatNaira(vehicle.dailyRateKobo)}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                padding: '16px',
                backgroundColor: '#141820',
                borderRadius: '8px',
                border: '1px solid #1E232E',
                marginBottom: '16px',
                fontSize: '12px',
              }}
            >
              <div>
                <div style={{ color: '#6B7280', fontSize: '12px' }}>Registration plate</div>
                <div style={{ color: '#F9FAFB', fontWeight: '600', marginTop: '2px' }}>{vehicle.plateMasked}</div>
              </div>
              <div>
                <div style={{ color: '#6B7280', fontSize: '12px' }}>Seating capacity</div>
                <div style={{ color: '#F9FAFB', fontWeight: '600', marginTop: '2px' }}>{vehicle.seats} Passengers</div>
              </div>
              <div>
                <div style={{ color: '#6B7280', fontSize: '12px' }}>Transmission</div>
                <div style={{ color: '#F9FAFB', fontWeight: '600', marginTop: '2px' }}>{vehicle.transmission}</div>
              </div>
              <div>
                <div style={{ color: '#6B7280', fontSize: '12px' }}>Exterior colour</div>
                <div style={{ color: '#F9FAFB', fontWeight: '600', marginTop: '2px' }}>{vehicle.colour}</div>
              </div>
              <div>
                <div style={{ color: '#6B7280', fontSize: '12px' }}>Lagos dispatch area</div>
                <div style={{ color: '#F9FAFB', fontWeight: '600', marginTop: '2px' }}>{vehicle.areaLabel}</div>
              </div>
            </div>

            {vehicle.description && (
              <div>
                <div style={{ fontSize: '12px', color: '#9AA0A6', fontWeight: '600', marginBottom: '6px' }}>
                  Owner Listing Description
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#D1D5DB', lineHeight: '1.6', backgroundColor: '#141820', padding: '12px', borderRadius: '6px', border: '1px solid #1E232E' }}>
                  {vehicle.description}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: 7-Point Inspection & Moderation Action */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 7-Point Inspection Card */}
          <div
            style={{
              backgroundColor: '#101318',
              border: '1px solid #1E232E',
              borderRadius: '10px',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#F9FAFB', margin: '0 0 2px 0' }}>
                  7-Point Inspection Checklist
                </h3>
                <div style={{ fontSize: '12px', color: '#9AA0A6' }}>
                  All 7 verification points must be audited before approving.
                </div>
              </div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: '700',
                  color: isAllChecked ? '#4ADE80' : '#EAB308',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: isAllChecked ? 'rgba(34, 197, 94, 0.12)' : 'rgba(234, 179, 8, 0.12)',
                }}
              >
                {checkedCount} / 7 Verified
              </div>
            </div>

            {/* Checklist items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {VEHICLE_CHECKLIST_ITEMS.map((item) => {
                const isChecked = Boolean(checkedKeys[item.key]);
                return (
                  <button
                    key={item.key}
                    onClick={() => toggleCheck(item.key)}
                    type="button"
                    role="checkbox"
                    aria-checked={isChecked}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '6px',
                      backgroundColor: isChecked ? 'rgba(34, 197, 94, 0.05)' : '#141820',
                      border: '1px solid',
                      borderColor: isChecked ? 'rgba(34, 197, 94, 0.3)' : '#1E232E',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      textAlign: 'left',
                      width: '100%',
                      minHeight: '44px',
                    }}
                  >
                    <div
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        border: '1.5px solid',
                        borderColor: isChecked ? '#4ADE80' : '#4B5563',
                        backgroundColor: isChecked ? '#4ADE80' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: '2px',
                        flexShrink: 0,
                      }}
                    >
                      {isChecked && <CheckCircle2 size={14} color="#090A0C" />}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: isChecked ? '#F9FAFB' : '#D1D5DB' }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: '12px', color: '#9AA0A6', marginTop: '2px', lineHeight: '1.4' }}>
                        {item.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Messages */}
            {errorMsg && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '12px',
                  minHeight: '44px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#F87171',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertTriangle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  color: '#4ADE80',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle2 size={16} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                disabled={isSubmitting || !isAllChecked}
                onClick={handleApprove}
                style={{
                  backgroundColor: isAllChecked ? '#4ADE80' : '#1E232E',
                  color: isAllChecked ? '#090A0C' : '#6B7280',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '12px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: isAllChecked && !isSubmitting ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle2 size={16} />
                <span>{isSubmitting ? 'Processing Decision…' : 'Approve & Activate Listing'}</span>
              </button>

              {!showRejectForm ? (
                <button
                  onClick={() => setShowRejectForm(true)}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#F87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    padding: '10px',
                    minHeight: '44px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <XCircle size={14} />
                  <span>Request Changes / Reject Listing</span>
                </button>
              ) : (
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '6px',
                    backgroundColor: '#141820',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#F87171' }}>
                    REASON FOR REJECTION / REQUIRED CHANGES
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Please re-upload clearer photos of the interior cabin and confirm registration plate..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#181D26',
                      border: '1px solid #28303F',
                      borderRadius: '4px',
                      padding: '8px',
                      fontSize: '12px',
                      color: '#F9FAFB',
                      outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setShowRejectForm(false)}
                      style={{
                        backgroundColor: 'transparent',
                        color: '#9AA0A6',
                        border: '1px solid #28303F',
                        borderRadius: '4px',
                        padding: '10px',
                        minHeight: '44px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      disabled={isSubmitting}
                      onClick={handleReject}
                      style={{
                        backgroundColor: '#EF4444',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '10px 12px',
                        minHeight: '44px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                      }}
                    >
                      Confirm Rejection
                    </button>
                  </div>
                </div>
              )}

              {/* Suspend Action (for approved vehicles) */}
              {vehicle.moderationStatus === 'approved' && !showSuspendForm && (
                <button
                  onClick={() => setShowSuspendForm(true)}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#EF4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    padding: '10px',
                    minHeight: '44px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <AlertTriangle size={14} />
                  <span>Suspend Active Listing</span>
                </button>
              )}

              {showSuspendForm && (
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '6px',
                    backgroundColor: '#141820',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#EF4444' }}>
                    REASON FOR SUSPENSION (REQUIRED)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Host failed dispatch SLA or vehicle undergoing unscheduled maintenance..."
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#181D26',
                      border: '1px solid #28303F',
                      borderRadius: '4px',
                      padding: '8px',
                      fontSize: '12px',
                      color: '#F9FAFB',
                      outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setShowSuspendForm(false)}
                      style={{
                        backgroundColor: 'transparent',
                        color: '#9AA0A6',
                        border: '1px solid #28303F',
                        borderRadius: '4px',
                        padding: '10px',
                        minHeight: '44px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      disabled={isSubmitting}
                      onClick={handleSuspend}
                      style={{
                        backgroundColor: '#DC2626',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '10px 12px',
                        minHeight: '44px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                      }}
                    >
                      Confirm Suspension
                    </button>
                  </div>
                </div>
              )}

              {/* Restore Action (for suspended vehicles) */}
              {vehicle.moderationStatus === 'suspended' && (
                <button
                  disabled={isSubmitting}
                  onClick={handleRestore}
                  style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    color: '#4ADE80',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: '6px',
                    padding: '12px',
                    minHeight: '44px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>Restore to Approved Fleet</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
