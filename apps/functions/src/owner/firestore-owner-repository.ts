import {
  CommandError,
  type GovernmentIdKind,
  type OwnerAddress,
  type OwnerReviewChecklistKey,
  type OwnerReviewDecision,
  type OwnerVerificationState,
  type OwnerVisibleProfile,
} from '@mmg/contracts';
import {
  getFirestore,
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { z } from 'zod';

export type TrustedUserAccount = {
  uid: string;
  accountType: 'renter' | 'owner';
  email: string;
  displayName?: string;
};

export type OwnerProfileRecord = OwnerVisibleProfile;

export type OwnerVerificationRecord = {
  ownerId: string;
  status: OwnerVerificationState;
  legalName: string;
  address: OwnerAddress;
  email: string;
  phoneE164: string | null;
  ownerTermsVersion: string;
  commissionTermsVersion: string;
  privacyNoticeVersion: string;
  termsAcceptedAt: string;
  governmentId?: {
    uploadId: string;
    documentKind: GovernmentIdKind;
    originalFileName: string;
    storagePath: string | null;
    contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
    byteSize: number;
    uploadedAt: string;
    bytesState?: 'present' | 'cleared';
  } | null;
  version: number;
  submittedAt?: string | null;
  reviewerUid?: string | null;
  reviewedAt?: string | null;
  lastDecision?: OwnerReviewDecision | null;
  lastDecisionReason?: string | null;
  previousDecisionReason?: string | null;
  reviewChecklist?: Record<OwnerReviewChecklistKey, boolean> | null;
  createdAt: string;
  updatedAt: string;
};

export type OwnerVerificationConfig = {
  termsVersion: string;
  commissionTermsVersion: string;
  privacyNoticeVersion: string;
};

export type StoredOwnerIdempotency = {
  requestHash: string;
  commandName: string;
  actorId: string;
  result: unknown;
};

export type OwnerAuditEvent = {
  actorId: string;
  actorType: 'owner' | 'staff' | 'system';
  entityId: string;
  entityType: 'ownerProfile' | 'ownerVerification';
  eventType: 'owner.profile_completed' | 'owner.verification_submitted' | 'owner.verification_decided';
  fromState: OwnerVerificationState | null;
  toState: OwnerVerificationState;
  requestId: string;
  occurredAt: Date;
  details?: Record<string, unknown>;
};

export type NotificationOutboxRecord = {
  eventId?: string;
  eventType: string;
  ownerId: string;
  status: 'unavailable' | 'pending' | 'sent' | 'failed';
  reason?: string;
  createdAt: Date;
};

export type AdminAuditLogRecord = {
  logId?: string;
  actorId: string;
  role: string;
  action: string;
  target: string;
  beforeHash: string;
  afterHash: string;
  reason: string | null;
  requestId: string;
  createdAt: Date;
};

export interface OwnerTransaction {
  getUser(userId: string): Promise<TrustedUserAccount | null>;
  getOwnerProfile(ownerId: string): Promise<OwnerProfileRecord | null>;
  getOwnerVerification(ownerId: string): Promise<OwnerVerificationRecord | null>;
  getOwnerVerificationConfig(): Promise<OwnerVerificationConfig | null>;
  getIdempotency(documentId: string): Promise<StoredOwnerIdempotency | null>;
  setOwnerProfile(ownerId: string, profile: OwnerProfileRecord, now: Date): void;
  setOwnerVerification(ownerId: string, verification: OwnerVerificationRecord, now: Date): void;
  createAuditEvent(event: OwnerAuditEvent): void;
  createNotificationOutbox(record: NotificationOutboxRecord, now: Date): void;
  createAdminAuditLog(record: AdminAuditLogRecord, now: Date): void;
  saveIdempotency(documentId: string, record: StoredOwnerIdempotency, createdAt: Date): void;
}

export interface OwnerRepository {
  runTransaction<T>(work: (transaction: OwnerTransaction) => Promise<T>): Promise<T>;
}

const userDocSchema = z.object({
  uid: z.string().min(1).max(128),
  accountType: z.enum(['renter', 'owner']),
  email: z.string().min(3).max(254),
  displayName: z.string().optional(),
}).passthrough();

const configDocSchema = z.object({
  termsVersion: z.string().min(1).max(64),
  commissionTermsVersion: z.string().min(1).max(64),
  privacyNoticeVersion: z.string().min(1).max(64),
}).passthrough();

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

/** Convert domain ISO strings at the persistence boundary; never write raw strings to Firestore. */
export function toTimestamp(value: unknown, fallback: Date = new Date()): Timestamp {
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

export function toNullableTimestamp(value: unknown): Timestamp | null {
  if (!value) return null;
  return toTimestamp(value);
}

class FirestoreOwnerTransaction implements OwnerTransaction {
  constructor(private readonly firestore: Firestore, private readonly transaction: Transaction) {}

  async getUser(userId: string): Promise<TrustedUserAccount | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`users/${userId}`));
    if (!snapshot.exists) return null;
    const parsed = userDocSchema.safeParse(snapshot.data());
    return parsed.success ? parsed.data : null;
  }

  async getOwnerProfile(ownerId: string): Promise<OwnerProfileRecord | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`ownerProfiles/${ownerId}`));
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (!data) return null;

    const govId = data.governmentId
      ? {
          uploadId: data.governmentId.uploadId,
          documentKind: data.governmentId.documentKind,
          contentType: data.governmentId.contentType,
          byteSize: Number(data.governmentId.byteSize),
          uploadedAt: toIsoString(data.governmentId.uploadedAt),
          status: data.governmentId.status,
        }
      : null;

    return {
      ownerId: data.ownerId,
      legalName: data.legalName,
      displayName: data.displayName,
      address: data.address,
      verificationStatus: data.verificationStatus,
      verificationUpdatedAt: toIsoString(data.verificationUpdatedAt),
      lastDecisionReason: data.lastDecisionReason ?? null,
      ownerTermsVersion: data.ownerTermsVersion,
      commissionTermsVersion: data.commissionTermsVersion,
      privacyNoticeVersion: data.privacyNoticeVersion,
      termsAcceptedAt: toIsoString(data.termsAcceptedAt),
      governmentId: govId,
      createdAt: toIsoString(data.createdAt),
      updatedAt: toIsoString(data.updatedAt),
      version: data.version ?? 1,
    };
  }

  async getOwnerVerification(ownerId: string): Promise<OwnerVerificationRecord | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`ownerVerifications/${ownerId}`));
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (!data) return null;

    const govId = data.governmentId
      ? {
          uploadId: data.governmentId.uploadId,
          documentKind: data.governmentId.documentKind,
          originalFileName: data.governmentId.originalFileName,
          storagePath: data.governmentId.storagePath ?? null,
          contentType: data.governmentId.contentType,
          byteSize: Number(data.governmentId.byteSize),
          uploadedAt: toIsoString(data.governmentId.uploadedAt),
          bytesState: data.governmentId.bytesState ?? (data.governmentId.storagePath ? 'present' : 'cleared'),
        }
      : null;

    return {
      ownerId: data.ownerId,
      status: data.status,
      legalName: data.legalName,
      address: data.address,
      email: data.email,
      phoneE164: data.phoneE164 ?? null,
      ownerTermsVersion: data.ownerTermsVersion,
      commissionTermsVersion: data.commissionTermsVersion,
      privacyNoticeVersion: data.privacyNoticeVersion,
      termsAcceptedAt: toIsoString(data.termsAcceptedAt),
      governmentId: govId,
      version: data.version ?? 1,
      submittedAt: data.submittedAt ? toIsoString(data.submittedAt) : null,
      reviewerUid: data.reviewerUid ?? null,
      reviewedAt: data.reviewedAt ? toIsoString(data.reviewedAt) : null,
      lastDecision: data.lastDecision ?? null,
      lastDecisionReason: data.lastDecisionReason ?? null,
      previousDecisionReason: data.previousDecisionReason ?? null,
      reviewChecklist: data.reviewChecklist ?? null,
      createdAt: toIsoString(data.createdAt),
      updatedAt: toIsoString(data.updatedAt),
    };
  }

  async getOwnerVerificationConfig(): Promise<OwnerVerificationConfig | null> {
    const snapshot = await this.transaction.get(this.firestore.doc('systemConfig/ownerVerification'));
    if (!snapshot.exists) return null;
    const parsed = configDocSchema.safeParse(snapshot.data());
    if (!parsed.success) {
      throw new CommandError(
        'CONFIGURATION_UNAVAILABLE',
        'Owner verification system configuration is malformed.',
      );
    }
    return parsed.data;
  }

  async getIdempotency(documentId: string): Promise<StoredOwnerIdempotency | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`idempotencyKeys/${documentId}`));
    return snapshot.exists ? (snapshot.data() as StoredOwnerIdempotency) : null;
  }

  setOwnerProfile(ownerId: string, profile: OwnerProfileRecord, now: Date): void {
    const docRef = this.firestore.doc(`ownerProfiles/${ownerId}`);
    const govId = profile.governmentId
      ? {
          uploadId: profile.governmentId.uploadId,
          documentKind: profile.governmentId.documentKind,
          contentType: profile.governmentId.contentType,
          byteSize: profile.governmentId.byteSize,
          uploadedAt: toTimestamp(profile.governmentId.uploadedAt, now),
          status: profile.governmentId.status,
        }
      : null;

    this.transaction.set(
      docRef,
      {
        ownerId: profile.ownerId,
        legalName: profile.legalName,
        displayName: profile.displayName,
        address: profile.address,
        verificationStatus: profile.verificationStatus,
        verificationUpdatedAt: toTimestamp(profile.verificationUpdatedAt, now),
        lastDecisionReason: profile.lastDecisionReason ?? null,
        ownerTermsVersion: profile.ownerTermsVersion,
        commissionTermsVersion: profile.commissionTermsVersion,
        privacyNoticeVersion: profile.privacyNoticeVersion,
        termsAcceptedAt: toTimestamp(profile.termsAcceptedAt, now),
        governmentId: govId,
        createdAt: toTimestamp(profile.createdAt, now),
        updatedAt: Timestamp.fromDate(now),
        version: profile.version,
      },
      { merge: false },
    );
  }

  setOwnerVerification(ownerId: string, verification: OwnerVerificationRecord, now: Date): void {
    const docRef = this.firestore.doc(`ownerVerifications/${ownerId}`);
    const govId = verification.governmentId
      ? {
          uploadId: verification.governmentId.uploadId,
          documentKind: verification.governmentId.documentKind,
          originalFileName: verification.governmentId.originalFileName,
          storagePath: verification.governmentId.storagePath ?? null,
          contentType: verification.governmentId.contentType,
          byteSize: verification.governmentId.byteSize,
          uploadedAt: toTimestamp(verification.governmentId.uploadedAt, now),
          bytesState: verification.governmentId.bytesState ?? (verification.governmentId.storagePath ? 'present' : 'cleared'),
        }
      : null;

    this.transaction.set(
      docRef,
      {
        ownerId: verification.ownerId,
        status: verification.status,
        legalName: verification.legalName,
        address: verification.address,
        email: verification.email,
        phoneE164: verification.phoneE164 ?? null,
        ownerTermsVersion: verification.ownerTermsVersion,
        commissionTermsVersion: verification.commissionTermsVersion,
        privacyNoticeVersion: verification.privacyNoticeVersion,
        termsAcceptedAt: toTimestamp(verification.termsAcceptedAt, now),
        governmentId: govId,
        version: verification.version,
        submittedAt: toNullableTimestamp(verification.submittedAt),
        reviewerUid: verification.reviewerUid ?? null,
        reviewedAt: toNullableTimestamp(verification.reviewedAt),
        lastDecision: verification.lastDecision ?? null,
        lastDecisionReason: verification.lastDecisionReason ?? null,
        previousDecisionReason: verification.previousDecisionReason ?? null,
        reviewChecklist: verification.reviewChecklist ?? null,
        createdAt: toTimestamp(verification.createdAt, now),
        updatedAt: Timestamp.fromDate(now),
      },
      { merge: false },
    );
  }

  createAuditEvent(event: OwnerAuditEvent): void {
    this.transaction.create(this.firestore.collection('auditEvents').doc(), {
      actorId: event.actorId,
      actorType: event.actorType,
      entityId: event.entityId,
      entityType: event.entityType,
      eventType: event.eventType,
      fromState: event.fromState,
      toState: event.toState,
      requestId: event.requestId,
      occurredAt: Timestamp.fromDate(event.occurredAt),
      ...(event.details ? { details: event.details } : {}),
    });
  }

  createNotificationOutbox(record: NotificationOutboxRecord, now: Date): void {
    const docRef = record.eventId
      ? this.firestore.doc(`notificationOutbox/${record.eventId}`)
      : this.firestore.collection('notificationOutbox').doc();
    this.transaction.create(docRef, {
      eventType: record.eventType,
      ownerId: record.ownerId,
      status: record.status,
      reason: record.reason ?? null,
      createdAt: Timestamp.fromDate(now),
    });
  }

  createAdminAuditLog(record: AdminAuditLogRecord, now: Date): void {
    const docRef = record.logId
      ? this.firestore.doc(`adminAuditLogs/${record.logId}`)
      : this.firestore.collection('adminAuditLogs').doc();
    this.transaction.create(docRef, {
      actorId: record.actorId,
      role: record.role,
      action: record.action,
      target: record.target,
      beforeHash: record.beforeHash,
      afterHash: record.afterHash,
      reason: record.reason ?? null,
      requestId: record.requestId,
      createdAt: Timestamp.fromDate(now),
    });
  }

  saveIdempotency(documentId: string, record: StoredOwnerIdempotency, createdAt: Date): void {
    this.transaction.create(this.firestore.doc(`idempotencyKeys/${documentId}`), {
      ...record,
      createdAt: Timestamp.fromDate(createdAt),
    });
  }
}

export class FirestoreOwnerRepository implements OwnerRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  runTransaction<T>(work: (transaction: OwnerTransaction) => Promise<T>): Promise<T> {
    return this.firestore.runTransaction((transaction) =>
      work(new FirestoreOwnerTransaction(this.firestore, transaction)),
    );
  }
}
