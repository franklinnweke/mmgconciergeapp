import 'server-only';

import { maskEmail, maskPhone, type OwnerVerificationStatus } from '@mmg/contracts';

import { getAdminFirestore, getAdminStorage } from '@/features/auth/server/firebase-admin';
import type {
  OwnerAuditLogEntry,
  OwnerVerificationDetail,
  OwnerVerificationListItem,
} from '../domain/types';
import type { AdminOwnerGateway } from './admin-owner-gateway';

function hasToDate(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  );
}

function toIsoString(value: unknown, fallback: Date = new Date()): string {
  if (hasToDate(value)) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return fallback.toISOString();
}

function toNullableIsoString(value: unknown): string | null {
  if (!value) return null;
  return toIsoString(value);
}

export class FirestoreAdminOwnerGateway implements AdminOwnerGateway {
  constructor(
    private readonly firestore = getAdminFirestore(),
    private readonly storage = getAdminStorage(),
  ) {}

  async listOwnerVerifications(filter?: {
    status?: OwnerVerificationStatus;
  }): Promise<OwnerVerificationListItem[]> {
    let query: FirebaseFirestore.Query = this.firestore.collection('ownerVerifications');

    if (filter?.status) {
      query = query.where('status', '==', filter.status);
    }

    query = query.orderBy('updatedAt', 'desc');

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ownerId: doc.id,
        legalName: data.legalName || 'Unknown Owner',
        emailMasked: maskEmail(data.email || ''),
        phoneMasked: maskPhone(data.phoneE164 || null),
        status: (data.status as OwnerVerificationStatus) || 'draft',
        submittedAt: toNullableIsoString(data.submittedAt),
        reviewedAt: toNullableIsoString(data.reviewedAt),
        reviewerUid: data.reviewerUid || null,
        version: Number(data.version) || 1,
        updatedAt: toIsoString(data.updatedAt),
        areaLabel: data.address?.areaLabel,
      };
    });
  }

  async getOwnerVerificationDetail(ownerId: string): Promise<OwnerVerificationDetail | null> {
    const docSnap = await this.firestore.doc(`ownerVerifications/${ownerId}`).get();
    if (!docSnap.exists) {
      return null;
    }

    const data = docSnap.data()!;

    // Fetch recent admin audit logs for this target
    let auditLogs: OwnerAuditLogEntry[] = [];
    try {
      const logsSnap = await this.firestore
        .collection('adminAuditLogs')
        .where('target', '==', `ownerVerifications/${ownerId}`)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      auditLogs = logsSnap.docs.map((logDoc) => {
        const logData = logDoc.data();
        const createdAtDate = logData.createdAt?.toDate
          ? logData.createdAt.toDate()
          : new Date(logData.createdAt || Date.now());
        return {
          logId: logDoc.id,
          actorId: logData.actorId || 'unknown',
          role: logData.role || 'staff',
          action: logData.action || 'owner.verification_decided',
          reason: logData.reason || null,
          createdAt: createdAtDate.toISOString(),
        };
      });
    } catch {
      // Audit logs failure should not break verification inspection
      auditLogs = [];
    }

    let documentPreviewUrl: string | null = null;
    if (data.governmentId?.storagePath && data.governmentId?.bytesState !== 'cleared') {
      documentPreviewUrl = await this.mintSignedDocumentUrl(data.governmentId.storagePath);
    }

    return {
      ownerId: docSnap.id,
      legalName: data.legalName || '',
      emailMasked: maskEmail(data.email || ''),
      phoneMasked: maskPhone(data.phoneE164 || null),
      address: data.address
        ? {
            line1: data.address.line1 || '',
            areaLabel: data.address.areaLabel || 'Other Lagos',
            city: 'Lagos',
            country: 'NG',
          }
        : null,
      status: (data.status as OwnerVerificationStatus) || 'draft',
      submittedAt: toNullableIsoString(data.submittedAt),
      reviewedAt: toNullableIsoString(data.reviewedAt),
      reviewerUid: data.reviewerUid || null,
      lastDecision: data.lastDecision || null,
      lastDecisionReason: data.lastDecisionReason || null,
      previousDecisionReason: data.previousDecisionReason || null,
      reviewChecklist: data.reviewChecklist || null,
      termsAcceptedAt: toNullableIsoString(data.termsAcceptedAt),
      ownerTermsVersion: data.ownerTermsVersion || null,
      commissionTermsVersion: data.commissionTermsVersion || null,
      privacyNoticeVersion: data.privacyNoticeVersion || null,
      governmentId: data.governmentId
        ? {
            uploadId: data.governmentId.uploadId || '',
            documentKind: data.governmentId.documentKind || 'national_id',
            originalFileName: data.governmentId.originalFileName || 'government-id',
            contentType: data.governmentId.contentType || 'image/jpeg',
            byteSize: Number(data.governmentId.byteSize) || 0,
            uploadedAt: toIsoString(data.governmentId.uploadedAt),
            bytesState: data.governmentId.bytesState === 'cleared' ? 'cleared' : 'present',
            documentPreviewUrl,
          }
        : null,
      documentPreviewUrl,
      version: Number(data.version) || 1,
      createdAt: toIsoString(data.createdAt),
      updatedAt: toIsoString(data.updatedAt),
      auditLogs,
    };
  }

  async mintSignedDocumentUrl(storagePath: string): Promise<string | null> {
    if (!storagePath.startsWith('private/owner-verification/')) {
      return null;
    }

    try {
      const file = this.storage.bucket().file(storagePath);
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      });
      return url;
    } catch {
      return null;
    }
  }
}
