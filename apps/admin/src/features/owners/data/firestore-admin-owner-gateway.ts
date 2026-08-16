import 'server-only';

import { cursorSchema, pageSizeSchema } from '@mmg/contracts';
import { maskEmail, maskPhoneE164, type OwnerVerificationStatus } from '@mmg/domain';

// Relative, not `@/…`: the `@` alias is a Next/tsconfig path that the
// config-free root `vitest run` cannot resolve, so an aliased import here
// makes this gateway impossible to unit test. `session.ts` imports it the
// same way.
import { getAdminFirestore, getAdminStorage } from '../../auth/server/firebase-admin';
import type {
  OwnerAuditLogEntry,
  OwnerVerificationDetail,
  OwnerVerificationListItem,
} from '../domain/types';
import type {
  AdminOwnerGateway,
  OwnerVerificationPage,
  OwnerVerificationQuery,
} from './admin-owner-gateway';

/** Default rows per queue page. Bounded so one bad query cannot read the collection. */
export const OWNER_QUEUE_PAGE_SIZE = 25;

/**
 * Masking must never take the queue down. `maskEmail`/`maskPhoneE164` throw on
 * malformed input by design (they refuse to emit something that only looks
 * masked), so a single legacy or partially-written verification document would
 * otherwise 500 the whole page. These adapters degrade one row instead.
 */
function safeMaskEmail(email: string | null | undefined): string {
  if (!email) return 'unknown';
  try {
    return maskEmail(email);
  } catch {
    return 'unknown';
  }
}

function safeMaskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  try {
    return maskPhoneE164(phone);
  } catch {
    return `${phone.slice(0, 4)}****`;
  }
}

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

  async listOwnerVerifications(query?: OwnerVerificationQuery): Promise<OwnerVerificationPage> {
    const pageSize = pageSizeSchema.catch(OWNER_QUEUE_PAGE_SIZE).parse(
      query?.pageSize ?? OWNER_QUEUE_PAGE_SIZE,
    );

    let firestoreQuery: FirebaseFirestore.Query =
      this.firestore.collection('ownerVerifications');

    if (query?.status) {
      firestoreQuery = firestoreQuery.where('status', '==', query.status);
    }

    firestoreQuery = firestoreQuery.orderBy('updatedAt', 'desc');

    // Forward-only cursor. `startAfter(snapshot)` reuses the query's own sort
    // fields plus Firestore's implicit `__name__` tiebreak, so it needs no
    // index beyond the one the filtered query already requires. A cursor
    // pointing at a deleted document is ignored rather than throwing.
    const cursor = cursorSchema.safeParse(query?.cursor);
    if (cursor.success) {
      const cursorSnapshot = await this.firestore
        .doc(`ownerVerifications/${cursor.data}`)
        .get();
      if (cursorSnapshot.exists) {
        firestoreQuery = firestoreQuery.startAfter(cursorSnapshot);
      }
    }

    // Over-fetch by one to learn whether another page exists without a count.
    const snapshot = await firestoreQuery.limit(pageSize + 1).get();
    const pageDocs = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;

    const items: OwnerVerificationListItem[] = pageDocs.map((doc) => {
      const data = doc.data();
      return {
        ownerId: doc.id,
        legalName: data.legalName || 'Unknown Owner',
        emailMasked: safeMaskEmail(data.email),
        phoneMasked: safeMaskPhone(data.phoneE164 || null),
        status: (data.status as OwnerVerificationStatus) || 'draft',
        submittedAt: toNullableIsoString(data.submittedAt),
        reviewedAt: toNullableIsoString(data.reviewedAt),
        reviewerUid: data.reviewerUid || null,
        version: Number(data.version) || 1,
        updatedAt: toIsoString(data.updatedAt),
        areaLabel: data.address?.areaLabel,
      };
    });

    return {
      items,
      nextCursor: hasMore ? (pageDocs[pageDocs.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  async getOwnerVerificationDetail(ownerId: string): Promise<OwnerVerificationDetail | null> {
    const docSnap = await this.firestore.doc(`ownerVerifications/${ownerId}`).get();
    if (!docSnap.exists) {
      return null;
    }

    const data = docSnap.data()!;

    // Fetch recent admin audit logs for this target. A failure here (missing
    // composite index, transient Firestore error) must surface to staff as
    // "unavailable" — an empty list would claim no decisions were ever made.
    let auditLogs: OwnerAuditLogEntry[] = [];
    let auditTrailUnavailable = false;
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
      // Audit log failure should not break verification inspection, but it
      // must not masquerade as an empty history either.
      auditTrailUnavailable = true;
    }

    let documentPreviewUrl: string | null = null;
    if (data.governmentId?.storagePath && data.governmentId?.bytesState !== 'cleared') {
      documentPreviewUrl = await this.mintSignedDocumentUrl(data.governmentId.storagePath);
    }

    return {
      ownerId: docSnap.id,
      legalName: data.legalName || '',
      emailMasked: safeMaskEmail(data.email),
      phoneMasked: safeMaskPhone(data.phoneE164 || null),
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
      auditTrailUnavailable,
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
