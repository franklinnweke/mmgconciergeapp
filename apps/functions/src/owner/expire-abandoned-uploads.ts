import { ownerVisibleProfileSchema, type OwnerVisibleProfile } from '@mmg/contracts';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

export type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

export type StorageObjectSummary = {
  name: string; // e.g. private/owner-verification/{ownerId}/{uploadId}
  ownerId: string;
  uploadId: string;
  timeCreated: Date;
};

export type VerificationCleanupCandidate = {
  ownerId: string;
  uploadId: string;
  storagePath: string | null;
  status: 'draft' | 'rejected';
  /** Version observed in the snapshot; cleanup must never act on a stale version. */
  version: number;
};

type CleanupVerificationState = {
  status: string;
  version: unknown;
  governmentId?: {
    uploadId?: unknown;
    storagePath?: unknown;
    bytesState?: unknown;
  } | null;
};

export function isCurrentCleanupCandidate(
  current: CleanupVerificationState,
  candidate: VerificationCleanupCandidate,
): boolean {
  const expectedPath = `private/owner-verification/${candidate.ownerId}/${candidate.uploadId}`;
  return (
    current.status === candidate.status &&
    Number(current.version) === candidate.version &&
    current.governmentId?.uploadId === candidate.uploadId &&
    current.governmentId?.bytesState !== 'cleared' &&
    current.governmentId?.storagePath === expectedPath
  );
}

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
}

function toTimestamp(value: unknown, fallback: Date = new Date()): Timestamp {
  if (value instanceof Timestamp) {
    return value;
  }
  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return Timestamp.fromDate(parsed);
    }
  }
  return Timestamp.fromDate(fallback);
}

export function parseStoragePath(path: string): { ownerId: string; uploadId: string } | null {
  const match = path.match(/^private\/owner-verification\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return { ownerId: match[1], uploadId: match[2] };
}

export function selectAbandonedUploads(
  files: readonly StorageObjectSummary[],
  activeUploadIdsByOwner: ReadonlyMap<string, string>, // ownerId -> active submitted/referenced uploadId
  cutoffTime: Date,
): readonly StorageObjectSummary[] {
  return files.filter((file) => {
    if (file.timeCreated.getTime() >= cutoffTime.getTime()) {
      return false; // Not older than cutoff
    }
    const activeUploadId = activeUploadIdsByOwner.get(file.ownerId);
    return activeUploadId !== file.uploadId;
  });
}

export function selectDraftsForCleanup(
  verifications: readonly {
    ownerId: string;
    status: string;
    updatedAt: string | Timestamp | Date;
    governmentId?: {
      uploadId?: string;
      documentKind?: string;
      contentType?: string;
      byteSize?: number;
      uploadedAt?: string | Timestamp | Date;
      storagePath?: string | null;
      bytesState?: string;
    } | null;
  }[],
  cutoff30Days: Date,
): readonly VerificationCleanupCandidate[] {
  const candidates: VerificationCleanupCandidate[] = [];
  for (const v of verifications) {
    if (v.status !== 'draft') continue;
    const updatedAtIso = toIsoString(v.updatedAt);
    const updatedAt = new Date(updatedAtIso);
    if (isNaN(updatedAt.getTime()) || updatedAt.getTime() >= cutoff30Days.getTime()) continue;
    if (v.governmentId?.bytesState === 'cleared') continue;
    if (!v.governmentId?.uploadId) continue;

    candidates.push({
      ownerId: v.ownerId,
      uploadId: v.governmentId.uploadId,
      storagePath: v.governmentId.storagePath ?? `private/owner-verification/${v.ownerId}/${v.governmentId.uploadId}`,
      status: 'draft',
      version: Number((v as { version?: unknown }).version) || 1,
    });
  }
  return candidates;
}

export function selectRejectedForCleanup(
  verifications: readonly {
    ownerId: string;
    status: string;
    reviewedAt?: string | Timestamp | Date | null;
    governmentId?: {
      uploadId?: string;
      documentKind?: string;
      contentType?: string;
      byteSize?: number;
      uploadedAt?: string | Timestamp | Date;
      storagePath?: string | null;
      bytesState?: string;
    } | null;
  }[],
  cutoff90Days: Date,
): readonly VerificationCleanupCandidate[] {
  const candidates: VerificationCleanupCandidate[] = [];
  for (const v of verifications) {
    if (v.status !== 'rejected') continue;
    if (!v.reviewedAt) continue;
    const reviewedAtIso = toIsoString(v.reviewedAt);
    const reviewedAt = new Date(reviewedAtIso);
    if (isNaN(reviewedAt.getTime()) || reviewedAt.getTime() >= cutoff90Days.getTime()) continue;
    if (v.governmentId?.bytesState === 'cleared') continue;
    if (!v.governmentId?.uploadId) continue;

    candidates.push({
      ownerId: v.ownerId,
      uploadId: v.governmentId.uploadId,
      storagePath: v.governmentId.storagePath ?? `private/owner-verification/${v.ownerId}/${v.governmentId.uploadId}`,
      status: 'rejected',
      version: Number((v as { version?: unknown }).version) || 1,
    });
  }
  return candidates;
}

export type ExpireAbandonedUploadsDependencies = {
  firestore?: Firestore;
  bucket?: Bucket;
  now?: () => Date;
};

export async function processAbandonedUploadsCleanup(
  dependencies: ExpireAbandonedUploadsDependencies = {},
): Promise<{ deletedAbandonedCount: number; clearedDraftCount: number; clearedRejectedCount: number }> {
  const firestore = dependencies.firestore ?? getFirestore();
  const bucket = dependencies.bucket ?? getStorage().bucket();
  const now = (dependencies.now ?? (() => new Date()))();

  const cutoff24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const cutoff30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const cutoff90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // 1. Initial snapshot of owner verifications
  const verificationsSnapshot = await firestore.collection('ownerVerifications').get();
  const allVerifications: any[] = [];
  const activeUploadIdsByOwner = new Map<string, string>();

  for (const doc of verificationsSnapshot.docs) {
    const data = doc.data();
    allVerifications.push({ ownerId: doc.id, ...data });
    if (
      data.governmentId?.uploadId &&
      typeof data.governmentId.uploadId === 'string' &&
      data.governmentId.bytesState !== 'cleared'
    ) {
      activeUploadIdsByOwner.set(doc.id, data.governmentId.uploadId);
    }
  }

  // 2. Identify candidates
  const draftCandidates = selectDraftsForCleanup(allVerifications, cutoff30Days);
  const rejectedCandidates = selectRejectedForCleanup(allVerifications, cutoff90Days);

  let clearedDraftCount = 0;
  let clearedRejectedCount = 0;

  // Process 30-day draft split-writes with transactional revalidation
  for (const candidate of draftCandidates) {
    try {
      let stateUpdated = false;
      let pathToDelete: string | null = null;

      await firestore.runTransaction(async (tx) => {
        const profileRef = firestore.collection('ownerProfiles').doc(candidate.ownerId);
        const verificationRef = firestore.collection('ownerVerifications').doc(candidate.ownerId);

        const [profileSnap, verifSnap] = await Promise.all([tx.get(profileRef), tx.get(verificationRef)]);
        if (!verifSnap.exists) return;

        const currentVerif = verifSnap.data() as any;
        const updatedAt = new Date(toIsoString(currentVerif.updatedAt));

        // Revalidate invariants inside transaction before applying updates
        if (
          !isCurrentCleanupCandidate(currentVerif, candidate) ||
          isNaN(updatedAt.getTime()) ||
          updatedAt.getTime() >= cutoff30Days.getTime()
        ) {
          return; // Abort cleanup because document state changed concurrently
        }

        // The path is derived from the transactionally verified owner/upload pair.
        // Never trust a stale snapshot's path or delete an owner prefix.
        pathToDelete = `private/owner-verification/${candidate.ownerId}/${candidate.uploadId}`;

        const updatedVerifGovId = {
          uploadId: currentVerif.governmentId.uploadId,
          documentKind: currentVerif.governmentId.documentKind,
          originalFileName: currentVerif.governmentId.originalFileName,
          contentType: currentVerif.governmentId.contentType,
          byteSize: currentVerif.governmentId.byteSize,
          uploadedAt: toTimestamp(currentVerif.governmentId.uploadedAt, now),
          storagePath: null,
          bytesState: 'cleared' as const,
        };

        tx.update(verificationRef, {
          governmentId: updatedVerifGovId,
          updatedAt: Timestamp.fromDate(now),
          version: Number(currentVerif.version) + 1,
        });

        if (profileSnap.exists) {
          const currentProfile = profileSnap.data() as any;
          const sourceGovId = currentVerif.governmentId;
          const updatedProfileGovId = sourceGovId
            ? {
                uploadId: sourceGovId.uploadId,
                documentKind: sourceGovId.documentKind,
                contentType: sourceGovId.contentType,
                byteSize: sourceGovId.byteSize,
                uploadedAt: toIsoString(sourceGovId.uploadedAt),
                status: 'cleared' as const,
              }
            : null;

          const updatedProfileData = {
            ownerId: currentProfile.ownerId,
            legalName: currentProfile.legalName,
            displayName: currentProfile.displayName,
            address: currentProfile.address,
            verificationStatus: currentProfile.verificationStatus,
            verificationUpdatedAt: toTimestamp(currentProfile.verificationUpdatedAt, now),
            lastDecisionReason: currentProfile.lastDecisionReason ?? null,
            ownerTermsVersion: currentProfile.ownerTermsVersion,
            commissionTermsVersion: currentProfile.commissionTermsVersion,
            privacyNoticeVersion: currentProfile.privacyNoticeVersion,
            termsAcceptedAt: toTimestamp(currentProfile.termsAcceptedAt, now),
            governmentId: updatedProfileGovId
              ? {
                  ...updatedProfileGovId,
                  uploadedAt: toTimestamp(updatedProfileGovId.uploadedAt, now),
                }
              : null,
            createdAt: toTimestamp(currentProfile.createdAt, now),
            updatedAt: Timestamp.fromDate(now),
            version: (currentProfile.version || 1) + 1,
          };

          // Strict validation ensures no field is dropped
          const parsed = ownerVisibleProfileSchema.parse({
            ...updatedProfileData,
            verificationUpdatedAt: toIsoString(updatedProfileData.verificationUpdatedAt),
            termsAcceptedAt: toIsoString(updatedProfileData.termsAcceptedAt),
            createdAt: toIsoString(updatedProfileData.createdAt),
            updatedAt: toIsoString(updatedProfileData.updatedAt),
            governmentId: updatedProfileGovId,
          });

          tx.set(profileRef, updatedProfileData);
        }

        stateUpdated = true;
      });

      // ONLY delete exact Storage path after state update succeeds
      if (stateUpdated && pathToDelete) {
        await bucket.file(pathToDelete).delete({ ignoreNotFound: true });
        clearedDraftCount += 1;
        logger.info('owner.verification_upload_expired', {
          ownerId: candidate.ownerId,
          uploadId: candidate.uploadId,
        });
      }
    } catch (err) {
      logger.warn('owner.draft_cleanup_failed', {
        ownerId: candidate.ownerId,
        uploadId: candidate.uploadId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Process 90-day rejected split-writes with transactional revalidation
  for (const candidate of rejectedCandidates) {
    try {
      let stateUpdated = false;
      let pathToDelete: string | null = null;

      await firestore.runTransaction(async (tx) => {
        const profileRef = firestore.collection('ownerProfiles').doc(candidate.ownerId);
        const verificationRef = firestore.collection('ownerVerifications').doc(candidate.ownerId);

        const [profileSnap, verifSnap] = await Promise.all([tx.get(profileRef), tx.get(verificationRef)]);
        if (!verifSnap.exists) return;

        const currentVerif = verifSnap.data() as any;
        const reviewedAt = currentVerif.reviewedAt ? new Date(toIsoString(currentVerif.reviewedAt)) : null;

        // Revalidate inside transaction
        if (
          !isCurrentCleanupCandidate(currentVerif, candidate) ||
          !reviewedAt ||
          isNaN(reviewedAt.getTime()) ||
          reviewedAt.getTime() >= cutoff90Days.getTime()
        ) {
          return;
        }

        pathToDelete = `private/owner-verification/${candidate.ownerId}/${candidate.uploadId}`;

        const updatedVerifGovId = {
          uploadId: currentVerif.governmentId.uploadId,
          documentKind: currentVerif.governmentId.documentKind,
          originalFileName: currentVerif.governmentId.originalFileName,
          contentType: currentVerif.governmentId.contentType,
          byteSize: currentVerif.governmentId.byteSize,
          uploadedAt: toTimestamp(currentVerif.governmentId.uploadedAt, now),
          storagePath: null,
          bytesState: 'cleared' as const,
        };

        tx.update(verificationRef, {
          governmentId: updatedVerifGovId,
          updatedAt: Timestamp.fromDate(now),
          version: Number(currentVerif.version) + 1,
        });

        if (profileSnap.exists) {
          const currentProfile = profileSnap.data() as any;
          const sourceGovId = currentVerif.governmentId;
          const updatedProfileGovId = sourceGovId
            ? {
                uploadId: sourceGovId.uploadId,
                documentKind: sourceGovId.documentKind,
                contentType: sourceGovId.contentType,
                byteSize: sourceGovId.byteSize,
                uploadedAt: toIsoString(sourceGovId.uploadedAt),
                status: 'cleared' as const,
              }
            : null;

          const updatedProfileData = {
            ownerId: currentProfile.ownerId,
            legalName: currentProfile.legalName,
            displayName: currentProfile.displayName,
            address: currentProfile.address,
            verificationStatus: currentProfile.verificationStatus,
            verificationUpdatedAt: toTimestamp(currentProfile.verificationUpdatedAt, now),
            lastDecisionReason: currentProfile.lastDecisionReason ?? null,
            ownerTermsVersion: currentProfile.ownerTermsVersion,
            commissionTermsVersion: currentProfile.commissionTermsVersion,
            privacyNoticeVersion: currentProfile.privacyNoticeVersion,
            termsAcceptedAt: toTimestamp(currentProfile.termsAcceptedAt, now),
            governmentId: updatedProfileGovId
              ? {
                  ...updatedProfileGovId,
                  uploadedAt: toTimestamp(updatedProfileGovId.uploadedAt, now),
                }
              : null,
            createdAt: toTimestamp(currentProfile.createdAt, now),
            updatedAt: Timestamp.fromDate(now),
            version: (currentProfile.version || 1) + 1,
          };

          const parsed = ownerVisibleProfileSchema.parse({
            ...updatedProfileData,
            verificationUpdatedAt: toIsoString(updatedProfileData.verificationUpdatedAt),
            termsAcceptedAt: toIsoString(updatedProfileData.termsAcceptedAt),
            createdAt: toIsoString(updatedProfileData.createdAt),
            updatedAt: toIsoString(updatedProfileData.updatedAt),
            governmentId: updatedProfileGovId,
          });

          tx.set(profileRef, updatedProfileData);
        }

        stateUpdated = true;
      });

      if (stateUpdated && pathToDelete) {
        await bucket.file(pathToDelete).delete({ ignoreNotFound: true });
        clearedRejectedCount += 1;
        logger.info('owner.verification_upload_expired', {
          ownerId: candidate.ownerId,
          uploadId: candidate.uploadId,
        });
      }
    } catch (err) {
      logger.warn('owner.rejected_cleanup_failed', {
        ownerId: candidate.ownerId,
        uploadId: candidate.uploadId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3. List and clean unreferenced storage files (>24 hours) with immediate recheck
  const [files] = await bucket.getFiles({ prefix: 'private/owner-verification/' });
  const summaries: StorageObjectSummary[] = [];

  for (const file of files) {
    const parsed = parseStoragePath(file.name);
    if (!parsed) continue;
    const metadata = file.metadata;
    const timeCreated = metadata.timeCreated ? new Date(metadata.timeCreated) : now;
    summaries.push({
      name: file.name,
      ownerId: parsed.ownerId,
      uploadId: parsed.uploadId,
      timeCreated,
    });
  }

  const abandoned = selectAbandonedUploads(summaries, activeUploadIdsByOwner, cutoff24Hours);
  let deletedAbandonedCount = 0;

  for (const item of abandoned) {
    try {
      // Re-read current ownerVerification immediately before deleting unreferenced file
      const liveVerifSnap = await firestore.collection('ownerVerifications').doc(item.ownerId).get();
      if (liveVerifSnap.exists) {
        const liveData = liveVerifSnap.data()!;
        if (
          liveData.governmentId?.uploadId === item.uploadId &&
          liveData.governmentId?.bytesState !== 'cleared'
        ) {
          continue; // Actively referenced in live doc, skip deletion
        }
      }

      await bucket.file(item.name).delete({ ignoreNotFound: true });
      deletedAbandonedCount += 1;
      logger.info('owner.abandoned_upload_deleted', {
        ownerId: item.ownerId,
        uploadId: item.uploadId,
      });
    } catch (err) {
      logger.warn('owner.abandoned_upload_delete_failed', {
        ownerId: item.ownerId,
        uploadId: item.uploadId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { deletedAbandonedCount, clearedDraftCount, clearedRejectedCount };
}

export const expireAbandonedOwnerVerificationUploads = onSchedule(
  {
    schedule: 'every 24 hours',
    timeZone: 'Africa/Lagos',
    region: 'africa-south1',
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async () => {
    logger.info('owner.cleanup_abandoned_uploads_started');
    const result = await processAbandonedUploadsCleanup();
    logger.info('owner.cleanup_abandoned_uploads_finished', result);
  },
);
