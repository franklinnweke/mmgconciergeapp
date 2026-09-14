import type {
  GovernmentIdKind,
  LagosAreaLabel,
  OwnerReviewChecklist,
  OwnerReviewDecision,
  OwnerVerificationStatus,
} from '@mmg/contracts';

export type OwnerVerificationListItem = {
  ownerId: string;
  legalName: string;
  emailMasked: string;
  phoneMasked: string | null;
  status: OwnerVerificationStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewerUid: string | null;
  version: number;
  updatedAt: string;
  areaLabel?: LagosAreaLabel;
};

export type OwnerDocumentDetail = {
  uploadId: string;
  documentKind: GovernmentIdKind;
  originalFileName: string;
  contentType: string;
  byteSize: number;
  uploadedAt: string;
  bytesState: 'present' | 'deletion_pending' | 'cleared';
  documentPreviewUrl: string | null;
};

export type OwnerAuditLogEntry = {
  logId: string;
  actorId: string;
  role: string;
  action: string;
  reason: string | null;
  createdAt: string;
};

export type OwnerVerificationDetail = {
  ownerId: string;
  legalName: string;
  emailMasked: string;
  phoneMasked: string | null;
  address: {
    line1: string;
    areaLabel: LagosAreaLabel;
    city: 'Lagos';
    country: 'NG';
  } | null;
  status: OwnerVerificationStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewerUid: string | null;
  lastDecision: OwnerReviewDecision | null;
  lastDecisionReason: string | null;
  previousDecisionReason: string | null;
  reviewChecklist: OwnerReviewChecklist | null;
  termsAcceptedAt: string | null;
  ownerTermsVersion: string | null;
  commissionTermsVersion: string | null;
  privacyNoticeVersion: string | null;
  governmentId: OwnerDocumentDetail | null;
  documentPreviewUrl: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  auditLogs?: OwnerAuditLogEntry[];
  /**
   * True when the audit-log query itself failed (missing index, transient
   * Firestore error). Distinct from an empty trail: staff must be able to tell
   * "no history exists" from "history could not be loaded".
   */
  auditTrailUnavailable?: boolean;
};
