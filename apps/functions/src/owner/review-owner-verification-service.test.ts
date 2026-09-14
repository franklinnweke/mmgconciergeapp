import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  type ReviewOwnerVerificationCommand,
} from '@mmg/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  AdminAuditLogRecord,
  NotificationOutboxRecord,
  OwnerAuditEvent,
  OwnerProfileRecord,
  OwnerRepository,
  OwnerTransaction,
  OwnerVerificationConfig,
  OwnerVerificationRecord,
  StoredOwnerIdempotency,
  TrustedUserAccount,
} from './firestore-owner-repository.js';
import {
  reviewOwnerVerification,
  type ReviewOwnerVerificationActor,
} from './review-owner-verification-service.js';

class InMemoryOwnerRepository implements OwnerRepository {
  users = new Map<string, TrustedUserAccount>();
  profiles = new Map<string, OwnerProfileRecord>();
  verifications = new Map<string, OwnerVerificationRecord>();
  idempotency = new Map<string, StoredOwnerIdempotency>();
  auditEvents: OwnerAuditEvent[] = [];
  notifications: NotificationOutboxRecord[] = [];
  adminLogs: AdminAuditLogRecord[] = [];
  config: OwnerVerificationConfig | null = null;

  async runTransaction<T>(work: (transaction: OwnerTransaction) => Promise<T>): Promise<T> {
    const transaction: OwnerTransaction = {
      getUser: async (id) => this.users.get(id) ?? null,
      getOwnerProfile: async (id) => this.profiles.get(id) ?? null,
      getOwnerVerification: async (id) => this.verifications.get(id) ?? null,
      getOwnerVerificationConfig: async () => this.config,
      getIdempotency: async (id) => this.idempotency.get(id) ?? null,
      setOwnerProfile: (id, profile) => {
        this.profiles.set(id, profile);
      },
      setOwnerVerification: (id, verification) => {
        this.verifications.set(id, verification);
      },
      createAuditEvent: (event) => {
        this.auditEvents.push(event);
      },
      createNotificationOutbox: (record) => {
        this.notifications.push(record);
      },
      createAdminAuditLog: (record) => {
        this.adminLogs.push(record);
      },
      saveIdempotency: (id, record) => {
        this.idempotency.set(id, record);
      },
    };
    return work(transaction);
  }
}

import type { StorageGateway } from './storage-validation.js';

class InMemoryStorageGateway implements StorageGateway {
  deleted: string[] = [];
  async getObjectMetadata(): Promise<null> { return null; }
  async readFirstBytes(): Promise<null> { return null; }
  async deleteObject(storagePath: string): Promise<void> {
    this.deleted.push(storagePath);
  }
}

describe('reviewOwnerVerification service', () => {
  let repository: InMemoryOwnerRepository;
  let storageGateway: InMemoryStorageGateway;
  const now = new Date('2026-08-15T12:00:00.000Z');
  const staffActor: ReviewOwnerVerificationActor = {
    uid: 'staff-admin-01',
    role: 'verification_admin',
  };

  beforeEach(() => {
    repository = new InMemoryOwnerRepository();
    storageGateway = new InMemoryStorageGateway();

    repository.profiles.set('owner-one', {
      ownerId: 'owner-one',
      legalName: 'Alhaji Musa Danjuma',
      displayName: 'Alhaji Musa Danjuma',
      address: {
        line1: '14 Admiralty Way',
        areaLabel: 'Lekki Phase 1',
        city: 'Lagos',
        country: 'NG',
      },
      verificationStatus: 'submitted',
      verificationUpdatedAt: now.toISOString(),
      lastDecisionReason: null,
      ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
      commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      termsAcceptedAt: now.toISOString(),
      governmentId: {
        uploadId: 'upload-01',
        documentKind: 'national_id',
        contentType: 'image/jpeg',
        byteSize: 1024,
        uploadedAt: now.toISOString(),
        status: 'submitted',
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 2,
    });

    repository.verifications.set('owner-one', {
      ownerId: 'owner-one',
      status: 'submitted',
      legalName: 'Alhaji Musa Danjuma',
      address: {
        line1: '14 Admiralty Way',
        areaLabel: 'Lekki Phase 1',
        city: 'Lagos',
        country: 'NG',
      },
      email: 'musa@example.com',
      phoneE164: '+2348012345678',
      ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
      commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      termsAcceptedAt: now.toISOString(),
      governmentId: {
        uploadId: 'upload-01',
        documentKind: 'national_id',
        originalFileName: 'national-id.jpg',
        storagePath: 'private/owner-verification/owner-one/upload-01',
        contentType: 'image/jpeg',
        byteSize: 1024,
        uploadedAt: now.toISOString(),
      },
      version: 2,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it('starts review from submitted status', async () => {
    const command: ReviewOwnerVerificationCommand = {
      schemaVersion: 1,
      idempotencyKey: 'idempotency-key-start-001',
      data: {
        ownerId: 'owner-one',
        expectedVersion: 2,
        decision: 'start_review',
      },
    };

    const result = await reviewOwnerVerification(command, staffActor, {
      repository,
      now: () => now,
      createRequestId: () => 'req-start-01',
    });

    expect(result.result).toEqual({
      ownerId: 'owner-one',
      fromStatus: 'submitted',
      toStatus: 'under_review',
      decidedAt: now.toISOString(),
    });

    expect(repository.verifications.get('owner-one')?.status).toBe('under_review');
    expect(repository.verifications.get('owner-one')?.version).toBe(3);
    expect(repository.profiles.get('owner-one')?.verificationStatus).toBe('under_review');
  });

  it('approves verification with valid checklist from under_review', async () => {
    repository.verifications.set('owner-one', {
      ...repository.verifications.get('owner-one')!,
      status: 'under_review',
      version: 3,
    });

    const command: ReviewOwnerVerificationCommand = {
      schemaVersion: 1,
      idempotencyKey: 'idempotency-key-approve-001',
      data: {
        ownerId: 'owner-one',
        expectedVersion: 3,
        decision: 'approve',
        checklist: {
          identity_matches_id: true,
          document_legible: true,
          lagos_address_plausible: true,
          current_terms_accepted: true,
          no_fraud_indicators: true,
        },
      },
    };

    const result = await reviewOwnerVerification(command, staffActor, {
      repository,
      storageGateway,
      now: () => now,
    });

    expect(result.result.toStatus).toBe('approved');
    const saved = repository.verifications.get('owner-one');
    expect(saved?.status).toBe('approved');
    expect(saved?.reviewerUid).toBe('staff-admin-01');
    expect(saved?.reviewChecklist).toMatchObject({ identity_matches_id: true });
    expect(saved?.governmentId?.bytesState).toBe('cleared');
    expect(saved?.governmentId?.storagePath).toBeNull();
    expect(repository.profiles.get('owner-one')?.governmentId?.status).toBe('cleared');
    expect(storageGateway.deleted).toContain('private/owner-verification/owner-one/upload-01');

    expect(repository.adminLogs).toHaveLength(1);
    expect(repository.adminLogs[0]).toMatchObject({
      action: 'owner.verification_decided',
      actorId: 'staff-admin-01',
      role: 'verification_admin',
    });
  });

  it('rejects verification with valid reason from under_review', async () => {
    repository.verifications.set('owner-one', {
      ...repository.verifications.get('owner-one')!,
      status: 'under_review',
      version: 3,
    });

    const command: ReviewOwnerVerificationCommand = {
      schemaVersion: 1,
      idempotencyKey: 'idempotency-key-reject-001',
      data: {
        ownerId: 'owner-one',
        expectedVersion: 3,
        decision: 'reject',
        reason: 'National ID image is blurred and unreadable. Please re-upload.',
      },
    };

    const result = await reviewOwnerVerification(command, staffActor, {
      repository,
      storageGateway,
      now: () => now,
    });

    expect(result.result.toStatus).toBe('rejected');
    const saved = repository.verifications.get('owner-one');
    expect(saved?.status).toBe('rejected');
    expect(saved?.lastDecisionReason).toBe('National ID image is blurred and unreadable. Please re-upload.');
    expect(repository.profiles.get('owner-one')?.lastDecisionReason).toBe('National ID image is blurred and unreadable. Please re-upload.');
    expect(saved?.governmentId?.bytesState).toBe('cleared');
    expect(saved?.governmentId?.storagePath).toBeNull();
    expect(repository.profiles.get('owner-one')?.governmentId?.status).toBe('cleared');
    expect(storageGateway.deleted).toContain('private/owner-verification/owner-one/upload-01');
  });

  it('fails with stale_version when expectedVersion does not match current version', async () => {
    const command: ReviewOwnerVerificationCommand = {
      schemaVersion: 1,
      idempotencyKey: 'idempotency-key-stale-001',
      data: {
        ownerId: 'owner-one',
        expectedVersion: 1, // Current is 2
        decision: 'start_review',
      },
    };

    await expect(
      reviewOwnerVerification(command, staffActor, { repository, now: () => now }),
    ).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      safeDetails: { reason: 'stale_version' },
    });
  });

  it('fails when attempting an illegal transition (e.g. submitted directly to approved)', async () => {
    const command: ReviewOwnerVerificationCommand = {
      schemaVersion: 1,
      idempotencyKey: 'idempotency-key-illegal-001',
      data: {
        ownerId: 'owner-one',
        expectedVersion: 2,
        decision: 'approve',
        checklist: {
          identity_matches_id: true,
          document_legible: true,
          lagos_address_plausible: true,
          current_terms_accepted: true,
          no_fraud_indicators: true,
        },
      },
    };

    await expect(
      reviewOwnerVerification(command, staffActor, { repository, now: () => now }),
    ).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
      safeDetails: { reason: 'stale_version' },
    });
  });

  it('replays cached result on idempotency match', async () => {
    const command: ReviewOwnerVerificationCommand = {
      schemaVersion: 1,
      idempotencyKey: 'idempotency-key-replay-001',
      data: {
        ownerId: 'owner-one',
        expectedVersion: 2,
        decision: 'start_review',
      },
    };
    const deps = { repository, now: () => now };

    const first = await reviewOwnerVerification(command, staffActor, deps);
    const second = await reviewOwnerVerification(command, staffActor, deps);

    expect(second).toEqual(first);
    expect(repository.auditEvents).toHaveLength(1);
  });
});
