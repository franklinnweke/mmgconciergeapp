import {
  doc,
  getFirestore,
  onSnapshot,
  type DocumentSnapshot,
} from '@react-native-firebase/firestore';
import {
  ownerVisibleProfileSchema,
  type OwnerVisibleProfile,
} from '@mmg/contracts';

export type OwnerVerificationRepository = {
  subscribe(
    ownerId: string,
    onUpdate: (profile: OwnerVisibleProfile | null) => void,
    onError: (error: Error) => void,
  ): () => void;
};

export function normalizeFirestoreTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'object') {
    const withToDate = value as { toDate?: unknown };
    if (typeof withToDate.toDate === 'function') {
      try {
        const date = (withToDate.toDate as () => Date)();
        return date instanceof Date && !Number.isNaN(date.getTime())
          ? date.toISOString()
          : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function parseOwnerProfileDocument(
  docId: string,
  raw: Record<string, unknown>,
): OwnerVisibleProfile {
  const governmentIdRaw =
    raw.governmentId && typeof raw.governmentId === 'object'
      ? (raw.governmentId as Record<string, unknown>)
      : null;

  const normalized = {
    ownerId: raw.ownerId,
    legalName: raw.legalName,
    displayName: raw.displayName || raw.legalName || 'Owner',
    address: raw.address,
    verificationStatus: raw.verificationStatus,
    verificationUpdatedAt: normalizeFirestoreTimestamp(raw.verificationUpdatedAt),
    lastDecisionReason: raw.lastDecisionReason ?? null,
    ownerTermsVersion: raw.ownerTermsVersion,
    commissionTermsVersion: raw.commissionTermsVersion,
    privacyNoticeVersion: raw.privacyNoticeVersion,
    termsAcceptedAt: normalizeFirestoreTimestamp(raw.termsAcceptedAt),
    governmentId: governmentIdRaw
      ? {
          uploadId: governmentIdRaw.uploadId,
          documentKind: governmentIdRaw.documentKind,
          contentType: governmentIdRaw.contentType,
          byteSize: governmentIdRaw.byteSize,
          uploadedAt: normalizeFirestoreTimestamp(governmentIdRaw.uploadedAt),
          status: governmentIdRaw.status,
        }
      : null,
    createdAt: normalizeFirestoreTimestamp(raw.createdAt),
    updatedAt: normalizeFirestoreTimestamp(raw.updatedAt),
    version: raw.version,
  };

  const parsed = ownerVisibleProfileSchema.parse(normalized);
  if (parsed.ownerId !== docId) {
    throw new Error('Owner profile identity does not match its document path.');
  }
  return parsed;
}

export function createOwnerVerificationRepository(): OwnerVerificationRepository {
  return {
    subscribe(ownerId, onUpdate, onError) {
      if (!ownerId) {
        onUpdate(null);
        return () => {};
      }

      const db = getFirestore();
      const profileDocRef = doc(db, 'ownerProfiles', ownerId);

      const unsubscribe = onSnapshot(
        profileDocRef,
        (docSnap: DocumentSnapshot) => {
          // RN Firebase snapshots expose `exists` as a method; reading it as a
          // property is always truthy, which would push every new owner (no
          // profile document yet) into the parse-error branch below.
          if (!docSnap.exists()) {
            // Missing document = draft incomplete
            onUpdate(null);
            return;
          }

          try {
            const data = (docSnap.data() || {}) as Record<string, unknown>;
            const parsed = parseOwnerProfileDocument(docSnap.id, data);
            onUpdate(parsed);
          } catch (parseError) {
            // Parse failure = sync error (do not treat corrupted doc as draft)
            onError(
              parseError instanceof Error
                ? parseError
                : new Error('Failed to parse owner profile data'),
            );
          }
        },
        (error: Error) => {
          onError(error);
        },
      );

      return unsubscribe;
    },
  };
}
