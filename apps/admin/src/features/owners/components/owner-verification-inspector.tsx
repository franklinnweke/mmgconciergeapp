'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { OwnerReviewDecision, OwnerVerificationStatus } from '@mmg/contracts';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Clock,
  UserCheck,
  Shield,
  MapPin,
  Phone,
  Mail,
  ExternalLink,
  History,
  Lock,
  Loader2,
} from 'lucide-react';

import type { OwnerVerificationDetail } from '../domain/types';
import { executeReviewDecisionAction } from '../data/review-owner-verification-action';

export type OwnerVerificationInspectorProps = {
  detail: OwnerVerificationDetail;
  staffEmail?: string;
  staffRole?: string;
};

const STATUS_CONFIG: Record<
  OwnerVerificationStatus,
  { label: string; text: string; icon: typeof CheckCircle2 }
> = {
  draft: { label: 'Draft', text: '#9AA0A6', icon: FileText },
  submitted: { label: 'Submitted', text: '#EAB308', icon: Clock },
  under_review: { label: 'Under Review', text: '#60A5FA', icon: UserCheck },
  approved: { label: 'Approved', text: '#4ADE80', icon: CheckCircle2 },
  rejected: { label: 'Rejected', text: '#F87171', icon: XCircle },
  suspended: { label: 'Suspended', text: '#FB923C', icon: AlertTriangle },
  revoked: { label: 'Revoked', text: '#EF4444', icon: XCircle },
};

export function OwnerVerificationInspector({
  detail,
  staffEmail,
  staffRole,
}: OwnerVerificationInspectorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  // Review checklist state (all 5 required for approval)
  const [checklist, setChecklist] = useState({
    identity_matches_id: false,
    document_legible: false,
    lagos_address_plausible: false,
    current_terms_accepted: false,
    no_fraud_indicators: false,
  });

  const allChecklistItemsChecked =
    checklist.identity_matches_id &&
    checklist.document_legible &&
    checklist.lagos_address_plausible &&
    checklist.current_terms_accepted &&
    checklist.no_fraud_indicators;

  // Reason inputs for rejection, suspension, revocation
  const [rejectReason, setRejectReason] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [revokeReason, setRevokeReason] = useState('');

  const statusInfo = STATUS_CONFIG[detail.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusInfo.icon;

  const handleDecision = (decision: OwnerReviewDecision, reason?: string) => {
    setActionError(null);
    startTransition(async () => {
      const res = await executeReviewDecisionAction({
        ownerId: detail.ownerId,
        expectedVersion: detail.version,
        decision,
        reason: reason?.trim(),
        checklist: decision === 'approve' ? checklist : undefined,
      });

      if (!res.success) {
        setActionError(res.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="owner-inspector-page" style={{ minHeight: '100vh', backgroundColor: '#090A0C', color: '#F3F4F6' }}>
      {/* Top Header */}
      <header
        className="owner-inspector-header"
        style={{
          borderBottom: '1px solid #1E232E',
          backgroundColor: '#101318',
          padding: '16px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div className="owner-inspector-header-main" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link
            className="owner-inspector-back"
            href="/owners"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#8E95A3',
              textDecoration: 'none',
              fontSize: '13px',
              padding: '6px 10px',
              borderRadius: '6px',
              backgroundColor: '#181D26',
            }}
          >
            <ArrowLeft size={16} />
            <span>Back to Queue</span>
          </Link>

          <nav aria-label="Operations navigation" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
            <Link href="/" style={{ color: '#8E95A3', textDecoration: 'none', fontSize: '12px', minHeight: '44px', display: 'inline-flex', alignItems: 'center', padding: '0 10px' }}>Bookings</Link>
            <Link href="/vehicles" style={{ color: '#8E95A3', textDecoration: 'none', fontSize: '12px', minHeight: '44px', display: 'inline-flex', alignItems: 'center', padding: '0 10px' }}>Vehicles</Link>
            <Link aria-current="page" href="/owners" style={{ color: '#F3F4F6', textDecoration: 'none', fontSize: '12px', minHeight: '44px', display: 'inline-flex', alignItems: 'center', padding: '0 10px', backgroundColor: '#181D26', borderRadius: '6px' }}>Owners</Link>
          </nav>
          <div className="owner-inspector-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '-0.02em', margin: 0 }}>
                {detail.legalName || 'Owner Inspection'}
              </h1>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  borderRadius: '10px',
                  color: statusInfo.text,
                  fontSize: '12px',
                  fontWeight: '600',
                }}
              >
                <StatusIcon size={12} />
                <span>{statusInfo.label}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="owner-inspector-staff" style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#F3F4F6' }}>
            {staffEmail || 'Staff Operator'}
          </div>
          <div style={{ fontSize: '12px', color: '#7E8695' }}>{staffRole || 'verification_admin'}</div>
        </div>
      </header>

      {/* Main Grid */}
      <main style={{ maxWidth: '1360px', margin: '0 auto', padding: '32px 24px' }}>
        {actionError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#EF4444',
              padding: '14px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '24px',
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>{actionError}</span>
          </div>
        )}

        <div
          className="owner-inspector-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '360px 1fr 380px',
            gap: '24px',
            alignItems: 'start',
          }}
        >
          {/* Column 1: Owner Profile & Terms */}
          <div className="owner-inspector-column" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Identity Card */}
            <div
              style={{
                backgroundColor: '#12151B',
                border: '1px solid #1E232E',
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <h2 style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#C89D46', margin: '0 0 16px' }}>
                Owner Identity Profile
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
                <div>
                  <div className="owner-field-label" style={{ fontSize: '11px', color: '#7E8695', textTransform: 'uppercase' }}>Full Legal Name</div>
                  <div style={{ fontWeight: '600', color: '#FFFFFF', marginTop: '2px' }}>{detail.legalName}</div>
                </div>

                <div>
                  <div className="owner-field-label" style={{ fontSize: '11px', color: '#7E8695', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Mail size={12} />
                    <span>Email Address</span>
                  </div>
                  <div style={{ color: '#FFFFFF', marginTop: '2px' }}>{detail.emailMasked}</div>
                </div>

                <div>
                  <div className="owner-field-label" style={{ fontSize: '11px', color: '#7E8695', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Phone size={12} />
                    <span>Verified Nigerian Phone</span>
                  </div>
                  <div style={{ color: '#C89D46', fontFamily: 'monospace', fontWeight: '600', marginTop: '2px' }}>
                    {detail.phoneMasked || '—'}
                  </div>
                </div>

                <div>
                  <div className="owner-field-label" style={{ fontSize: '11px', color: '#7E8695', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} />
                    <span>Lagos Address</span>
                  </div>
                  <div style={{ color: '#FFFFFF', marginTop: '2px' }}>
                    {detail.address ? (
                      <>
                        <div>{detail.address.line1}</div>
                        <div style={{ color: '#A0A8B8' }}>{detail.address.areaLabel}, Lagos, Nigeria</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Terms & Legal Acceptance Card */}
            <div
              style={{
                backgroundColor: '#12151B',
                border: '1px solid #1E232E',
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <h2 style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#C89D46', margin: '0 0 16px' }}>
                Legal Terms Acceptance
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1A1F29', paddingBottom: '8px' }}>
                  <span style={{ color: '#7E8695' }}>Owner Terms:</span>
                  <span style={{ color: '#FFFFFF', fontFamily: 'monospace' }}>{detail.ownerTermsVersion || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1A1F29', paddingBottom: '8px' }}>
                  <span style={{ color: '#7E8695' }}>Commission Schedule:</span>
                  <span style={{ color: '#FFFFFF', fontFamily: 'monospace' }}>{detail.commissionTermsVersion || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1A1F29', paddingBottom: '8px' }}>
                  <span style={{ color: '#7E8695' }}>Privacy Notice:</span>
                  <span style={{ color: '#FFFFFF', fontFamily: 'monospace' }}>{detail.privacyNoticeVersion || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px' }}>
                  <span style={{ color: '#7E8695' }}>Accepted At:</span>
                  <span style={{ color: '#A0A8B8' }}>
                    {detail.termsAcceptedAt
                      ? new Date(detail.termsAcceptedAt).toLocaleString('en-GB')
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Government ID Private Viewer */}
          <div className="owner-inspector-column"
            style={{
              backgroundColor: '#12151B',
              border: '1px solid #1E232E',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={18} color="#C89D46" />
                <h2 style={{ fontSize: '14px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#F3F4F6', margin: 0 }}>
                  Government Identification Document
                </h2>
              </div>
              <div className="owner-security-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#7E8695' }}>
                <Lock size={12} />
                <span>Zero-Client Signed URL (15m)</span>
              </div>
            </div>

            {detail.governmentId ? (
              <div>
                {/* Metadata Pill Bar */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '12px',
                    backgroundColor: '#181D26',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    marginBottom: '18px',
                    color: '#A0A8B8',
                  }}
                >
                  <div>
                    <span style={{ color: '#6B7280' }}>Type: </span>
                    <strong style={{ color: '#F3F4F6', textTransform: 'capitalize' }}>
                      {detail.governmentId.documentKind.replace('_', ' ')}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280' }}>File: </span>
                    <span style={{ color: '#F3F4F6' }}>{detail.governmentId.originalFileName}</span>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280' }}>Size: </span>
                    <span style={{ color: '#F3F4F6' }}>
                      {(detail.governmentId.byteSize / (1024 * 1024)).toFixed(2)} MiB
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280' }}>MIME: </span>
                    <span style={{ color: '#F3F4F6', fontFamily: 'monospace' }}>
                      {detail.governmentId.contentType}
                    </span>
                  </div>
                </div>

                {/* Preview Frame */}
                <div
                  style={{
                    backgroundColor: '#090A0C',
                    border: '1px solid #1E232E',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '380px',
                    maxHeight: '520px',
                    position: 'relative',
                  }}
                >
                  {detail.governmentId.bytesState === 'cleared' ? (
                    <div style={{ textAlign: 'center', color: '#7E8695', padding: '40px' }}>
                      <AlertTriangle size={32} color="#EF4444" style={{ marginBottom: '8px' }} />
                      <div style={{ fontWeight: '600', color: '#F3F4F6' }}>Document expired / re-upload required</div>
                      <p style={{ fontSize: '12px', color: '#7E8695', margin: '6px 0 0' }}>
                        Image bytes were cleared per data retention policies.
                      </p>
                    </div>
                  ) : detail.documentPreviewUrl ? (
                    detail.governmentId.contentType === 'application/pdf' ? (
                      <div style={{ textAlign: 'center', padding: '40px' }}>
                        <FileText size={48} color="#C89D46" style={{ marginBottom: '16px' }} />
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#F3F4F6' }}>PDF Document Attached</div>
                        <p style={{ fontSize: '12px', color: '#7E8695', margin: '8px 0 16px' }}>
                          Protected document viewable in isolated viewer.
                        </p>
                        <a
                          href={detail.documentPreviewUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          referrerPolicy="no-referrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: '#C89D46',
                            color: '#090A0C',
                            padding: '8px 16px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            textDecoration: 'none',
                          }}
                        >
                          <span>Open PDF Securely</span>
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    ) : (
                      // Image Document Preview (with no-referrer)
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={detail.documentPreviewUrl}
                        alt="Government ID Document"
                        referrerPolicy="no-referrer"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '520px',
                          objectFit: 'contain',
                        }}
                      />
                    )
                  ) : (
                    <div style={{ textAlign: 'center', color: '#7E8695', padding: '40px' }}>
                      <AlertTriangle size={32} color="#EF4444" style={{ marginBottom: '8px' }} />
                      <div>Signed preview URL could not be minted.</div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#7E8695', padding: '60px 20px' }}>
                <FileText size={36} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <div>No government identification document has been submitted yet.</div>
              </div>
            )}

            {/* Decision History & Audit Trail */}
            <div className="owner-audit" style={{ marginTop: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <History size={16} color="#7E8695" />
                <h3 style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#7E8695', margin: 0 }}>
                  Audit Trail & Decision Evidence
                </h3>
              </div>

              {detail.lastDecisionReason && (
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    marginBottom: '12px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ fontWeight: '600', color: '#F87171', marginBottom: '4px' }}>
                    Current Decision Reason:
                  </div>
                  <div style={{ color: '#F3F4F6' }}>{detail.lastDecisionReason}</div>
                </div>
              )}

              {detail.previousDecisionReason && (
                <div
                  style={{
                    backgroundColor: '#181D26',
                    border: '1px solid #282F3D',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    marginBottom: '12px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ fontWeight: '600', color: '#9AA0A6', marginBottom: '4px' }}>
                    Previous Rejection Reason:
                  </div>
                  <div style={{ color: '#D1D5DB' }}>{detail.previousDecisionReason}</div>
                </div>
              )}

              {detail.auditTrailUnavailable ? (
                <div
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: '6px',
                    padding: '10px 14px',
                  fontSize: '12px',
                    color: '#F59E0B',
                  }}
                >
                  Audit trail is temporarily unavailable — decision history could
                  not be loaded. This does not mean no decisions were made.
                </div>
              ) : detail.auditLogs && detail.auditLogs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {detail.auditLogs.map((log) => (
                    <div
                      key={log.logId}
                      style={{
                        backgroundColor: '#181D26',
                        padding: '10px 14px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: '600', color: '#F3F4F6' }}>{log.action}</span>
                        <span style={{ color: '#7E8695', marginLeft: '8px' }}>by {log.actorId}</span>
                        {log.reason && <div style={{ color: '#A0A8B8', marginTop: '2px' }}>{log.reason}</div>}
                      </div>
                      <span style={{ color: '#6B7280' }}>
                        {new Date(log.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Column 3: Decision Console */}
          <div className="owner-inspector-column"
            style={{
              backgroundColor: '#12151B',
              border: '1px solid #1E232E',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <h2 style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#C89D46', margin: '0 0 16px' }}>
              Verification Decision Console
            </h2>

            {/* State-Specific Decision Controls */}
            {detail.status === 'submitted' && (
              <div>
                <p style={{ fontSize: '13px', color: '#A0A8B8', lineHeight: 1.5, marginBottom: '20px' }}>
                  This application has been submitted and is waiting for review assignment. Click below to lock the record and begin inspection.
                </p>
                <button
                  onClick={() => handleDecision('start_review')}
                  disabled={isPending}
                  style={{
                    width: '100%',
                    backgroundColor: '#C89D46',
                    color: '#090A0C',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '14px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: isPending ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                  <span>Start Verification Review</span>
                </button>
              </div>
            )}

            {detail.status === 'under_review' && (
              <div>
                {/* 5-item Checklist */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#F3F4F6', marginBottom: '10px' }}>
                    Approval Verification Checklist
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                    {[
                      { key: 'identity_matches_id', label: 'Full legal name matches government ID' },
                      { key: 'document_legible', label: 'Document image is authentic and clearly legible' },
                      { key: 'lagos_address_plausible', label: 'Lagos residence / operating address is plausible' },
                      { key: 'current_terms_accepted', label: 'Current terms & 15% commission schedule accepted' },
                      { key: 'no_fraud_indicators', label: 'No fraud, sanction, or blacklisted indicators' },
                    ].map((item) => (
                      <label
                        key={item.key}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          cursor: 'pointer',
                          color: checklist[item.key as keyof typeof checklist] ? '#F3F4F6' : '#8E95A3',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checklist[item.key as keyof typeof checklist]}
                          onChange={(e) =>
                            setChecklist({
                              ...checklist,
                              [item.key]: e.target.checked,
                            })
                          }
                          style={{ marginTop: '2px' }}
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Approve Button */}
                <button
                  onClick={() => handleDecision('approve')}
                  disabled={isPending || !allChecklistItemsChecked}
                  style={{
                    width: '100%',
                    backgroundColor: allChecklistItemsChecked ? '#22C55E' : '#1C2620',
                    color: allChecklistItemsChecked ? '#090A0C' : '#4B6354',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: allChecklistItemsChecked && !isPending ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '24px',
                  }}
                >
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  <span>Approve & Authorize Host</span>
                </button>

                {/* Rejection Form */}
                <div style={{ borderTop: '1px solid #1E232E', paddingTop: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#F87171', marginBottom: '8px' }}>
                    Or Reject Application
                  </div>
                  <textarea
                    placeholder="Provide clear reason for rejection (min 10 characters)..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: '#181D26',
                      border: '1px solid #2C323D',
                      borderRadius: '6px',
                      color: '#F3F4F6',
                      fontSize: '12px',
                      outline: 'none',
                      marginBottom: '10px',
                    }}
                  />
                  <button
                    onClick={() => handleDecision('reject', rejectReason)}
                    disabled={isPending || rejectReason.trim().length < 10}
                    style={{
                      width: '100%',
                      backgroundColor: rejectReason.trim().length >= 10 ? '#EF4444' : '#2A1A1A',
                      color: rejectReason.trim().length >= 10 ? '#FFFFFF' : '#6E3A3A',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: rejectReason.trim().length >= 10 && !isPending ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    {isPending ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                    <span>Reject Application</span>
                  </button>
                </div>
              </div>
            )}

            {detail.status === 'approved' && (
              <div>
                <div
                  style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    borderRadius: '8px',
                    padding: '14px',
                    fontSize: '12px',
                    color: '#4ADE80',
                    marginBottom: '20px',
                  }}
                >
                  Status: Approved. Further changes require a reasoned review action.
                </div>

                {/* Suspend Section */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#FB923C', marginBottom: '8px' }}>
                    Temporary Suspension
                  </div>
                  <input
                    type="text"
                    placeholder="Reason for suspension (min 10 chars)..."
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: '#181D26',
                      border: '1px solid #2C323D',
                      borderRadius: '6px',
                      color: '#F3F4F6',
                      fontSize: '12px',
                      outline: 'none',
                      marginBottom: '8px',
                    }}
                  />
                  <button
                    onClick={() => handleDecision('suspend', suspendReason)}
                    disabled={isPending || suspendReason.trim().length < 10}
                    style={{
                      width: '100%',
                      backgroundColor: suspendReason.trim().length >= 10 ? '#F97316' : '#2A1F18',
                      color: suspendReason.trim().length >= 10 ? '#090A0C' : '#6E4D38',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: suspendReason.trim().length >= 10 && !isPending ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Suspend Host
                  </button>
                </div>

                {/* Revoke Section */}
                <div style={{ borderTop: '1px solid #1E232E', paddingTop: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#EF4444', marginBottom: '8px' }}>
                    Permanent Revocation
                  </div>
                  <input
                    type="text"
                    placeholder="Reason for revocation (min 10 chars)..."
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: '#181D26',
                      border: '1px solid #2C323D',
                      borderRadius: '6px',
                      color: '#F3F4F6',
                      fontSize: '12px',
                      outline: 'none',
                      marginBottom: '8px',
                    }}
                  />
                  <button
                    onClick={() => handleDecision('revoke', revokeReason)}
                    disabled={isPending || revokeReason.trim().length < 10}
                    style={{
                      width: '100%',
                      backgroundColor: revokeReason.trim().length >= 10 ? '#EF4444' : '#2A1A1A',
                      color: revokeReason.trim().length >= 10 ? '#FFFFFF' : '#6E3A3A',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: revokeReason.trim().length >= 10 && !isPending ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Revoke Host Account
                  </button>
                </div>
              </div>
            )}

            {detail.status === 'suspended' && (
              <div>
                <div
                  style={{
                    backgroundColor: 'rgba(249, 115, 22, 0.08)',
                    border: '1px solid rgba(249, 115, 22, 0.2)',
                    borderRadius: '8px',
                    padding: '14px',
                    fontSize: '12px',
                    color: '#FB923C',
                    marginBottom: '20px',
                  }}
                >
                  This host is currently suspended.
                </div>

                <button
                  onClick={() => handleDecision('restore')}
                  disabled={isPending}
                  style={{
                    width: '100%',
                    backgroundColor: '#22C55E',
                    color: '#090A0C',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: isPending ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '20px',
                  }}
                >
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  <span>Restore Host Account</span>
                </button>

                {/* Revoke Section */}
                <div style={{ borderTop: '1px solid #1E232E', paddingTop: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#EF4444', marginBottom: '8px' }}>
                    Permanent Revocation
                  </div>
                  <input
                    type="text"
                    placeholder="Reason for revocation (min 10 chars)..."
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: '#181D26',
                      border: '1px solid #2C323D',
                      borderRadius: '6px',
                      color: '#F3F4F6',
                      fontSize: '12px',
                      outline: 'none',
                      marginBottom: '8px',
                    }}
                  />
                  <button
                    onClick={() => handleDecision('revoke', revokeReason)}
                    disabled={isPending || revokeReason.trim().length < 10}
                    style={{
                      width: '100%',
                      backgroundColor: revokeReason.trim().length >= 10 ? '#EF4444' : '#2A1A1A',
                      color: revokeReason.trim().length >= 10 ? '#FFFFFF' : '#6E3A3A',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: revokeReason.trim().length >= 10 && !isPending ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Revoke Host Account
                  </button>
                </div>
              </div>
            )}

            {detail.status === 'rejected' && (
              <div style={{ fontSize: '13px', color: '#8E95A3', lineHeight: 1.5 }}>
                <p>
                  This application was rejected. The host has been notified with the rejection reason and can update their profile or re-upload ID from their mobile app.
                </p>
              </div>
            )}

            {detail.status === 'revoked' && (
              <div style={{ fontSize: '13px', color: '#EF4444', lineHeight: 1.5 }}>
                <p>This host account is permanently revoked.</p>
              </div>
            )}

            {detail.status === 'draft' && (
              <div style={{ fontSize: '13px', color: '#8E95A3', lineHeight: 1.5 }}>
                <p>This owner has started profile completion but has not yet submitted their application.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
