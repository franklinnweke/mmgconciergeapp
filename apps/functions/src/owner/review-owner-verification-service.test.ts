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
  StorageDeletionOutboxRecord,
  StoredOwnerIdempotency,
  TrustedUserAccount,
} from './firestore-owner-repository.js';
import { storageDeletionOutboxDocumentId } from './firestore-owner-repository.js';
import {
  reviewOwnerVerification,
  type ReviewOwnerVerificationActor,
} from './review-owner-verification-service.js';
import type { StorageGateway } from './storage-validation.js';

class InMemoryOwnerRepository implements OwnerRepository {
  users = new Map<string, TrustedUserAccount>();
  profiles = new Map<string, OwnerProfileRecord>();
  verifications = new Map<string, OwnerVerificationRecord>();
  idempotency = new Map<string, StoredOwnerIdempotency>();
  auditEvents: OwnerAuditEvent[] = [];
  notifications: NotificationOutboxRecord[] = [];
  adminLogs: AdminAuditLogRecord[] = [];
  storageOutbox: Array<StorageDeletionOutboxRecord & { id: string }> = [];
  config: OwnerVerificationConfig | null = null;
  failOutboxUpdate = false;

  async markGovernmentIdCleared(params: {
    ownerId: string;
    uploadId: string;
    storagePath: string;
    now: Date;
  }): Promise<{ cleared: boolean; reason?: string }> {
    const v = this.verifications.get(params.ownerId);
    if (!v?.governmentId) {
      return { cleared: false, reason: 'verification_not_found' };
    }
    if (
      v.governmentId.uploadId !== params.uploadId ||
      v.governmentId.storagePath !== params.storagePath ||
      v.governmentId.bytesState !== 'deletion_pending'
    ) {
      return { cleared: false, reason: 'target_mismatch' };
    }
    this.verifications.set(params.ownerId, {
      ...v,
      governmentId: {
        ...v.governmentId,
        bytesState: 'cleared',
        storagePath: null,
      },
    });
    const p = this.profiles.get(params.ownerId);
    if (p?.governmentId && p.governmentId.uploadId === params.uploadId) {
      this.profiles.set(params.ownerId, {
        ...p,
        governmentId: {
          ...p.governmentId,
          status: 'cleared',
        },
      });
    }
    return { cleared: true };
  }

  async updateStorageDeletionOutbox(
    recordId: string,
    update: Partial<StorageDeletionOutboxRecord>,
    _now: Date,
  ): Promise<void> {
    if (this.failOutboxUpdate) {
      throw new Error('Simulated outbox update failure');
    }
    const index = this.storageOutbox.findIndex((record) => record.id === recordId);
    if (index === -1) return;
    this.storageOutbox[index] = {
      ...this.storageOutbox[index],
      ...update,
    };
  }

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
      createStorageDeletionOutbox: (record) => {
        this.storageOutbox.push({
          ...record,
          id: storageDeletionOutboxDocumentId(record.ownerId, record.uploadId),
        });
      },
      saveIdempotency: (id, record) => {
        this.idempotency.set(id, record);
      },
    };
    return work(transaction);
  }
}

class InMemoryStorageGateway implements StorageGateway {
  deleted: string[] = [];
  shouldFail = false;
  beforeDelete?: () => void;

  async getObjectMetadata(): Promise<null> { return null; }
  async readFirstBytes(): Promise<null> { return null; }
  async deleteObject(storagePath: string): Promise<void> {
    this.beforeDelete?.();
    if (this.shouldFail) {
      throw new Error('Storage service error: network failure during delete');
    }
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
    expect(repository.storageOutbox).toHaveLength(1);
    expect(repository.storageOutbox[0]?.status).toBe('completed');

    expect(repository.adminLogs).toHaveLength(1);
    expect(repository.adminLogs[0]).toMatchObject({
      action: 'owner.verification_decided',
      actorId: 'staff-admin-01',
      role: 'verification_admin',
    });
  });

  it('commits a pending deletion job before immediate storage deletion begins', async () => {
    repository.verifications.set('owner-one', {
      ...repository.verifications.get('owner-one')!,
      status: 'under_review',
      version: 3,
    });

    storageGateway.beforeDelete = () => {
      expect(repository.storageOutbox).toHaveLength(1);
      expect(repository.storageOutbox[0]).toMatchObject({
        ownerId: 'owner-one',
        uploadId: 'upload-01',
        status: 'pending',
        attempts: 0,
        nextAttemptAt: now.toISOString(),
      });
      expect(repository.verifications.get('owner-one')?.governmentId?.bytesState).toBe('deletion_pending');
    };

    const command: ReviewOwnerVerificationCommand = {
      schemaVersion: 1,
      idempotencyKey: 'idempotency-key-atomic-outbox-001',
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

    await reviewOwnerVerification(command, staffActor, {
      repository,
      storageGateway,
      now: () => now,
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

  it('retains deletion_pending and schedules retry when immediate storage deletion fails', async () => {
    storageGateway.shouldFail = true;
    repository.verifications.set('owner-one', {
      ...repository.verifications.get('owner-one')!,
      status: 'under_review',
      version: 3,
    });

    const command: ReviewOwnerVerificationCommand = {
      schemaVersion: 1,
      idempotencyKey: 'idempotency-key-approve-fail-001',
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
    expect(saved?.governmentId?.bytesState).toBe('deletion_pending');
    expect(saved?.governmentId?.storagePath).toBe('private/owner-verification/owner-one/upload-01');
    expect(repository.profiles.get('owner-one')?.governmentId?.status).toBe('submitted');

    expect(repository.storageOutbox).toHaveLength(1);
    expect(repository.storageOutbox[0]).toMatchObject({
      ownerId: 'owner-one',
      storagePath: 'private/owner-verification/owner-one/upload-01',
      uploadId: 'upload-01',
      attempts: 1,
      status: 'pending',
      nextAttemptAt: '2026-08-15T12:01:00.000Z',
    });
  });

  it('returns the committed review result even if the best-effort outbox update fails', async () => {
    storageGateway.shouldFail = true;
    repository.failOutboxUpdate = true;
    repository.verifications.set('owner-one', {
      ...repository.verifications.get('owner-one')!,
      status: 'under_review',
      version: 3,
    });

    const command: ReviewOwnerVerificationCommand = {
      schemaVersion: 1,
      idempotencyKey: 'idempotency-key-outbox-update-fail-001',
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
    expect(repository.storageOutbox).toHaveLength(1);
    expect(repository.storageOutbox[0]).toMatchObject({
      status: 'pending',
      attempts: 0,
      nextAttemptAt: now.toISOString(),
    });
  });

  it('fails with stale_version when expectedVersion does not match current version', async () => {
    const command: ReviewOwnerVerificationCommand = {
      schemaVersion: 1,
      idempotencyKey: 'idempotency-key-stale-001',
      data: {
        ownerId: 'owner-one',
        expectedVersion: 1,
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

  it('safely refuses to clear government ID if document changed concurrently or does not match target', async () => {
    repository.verifications.set('owner-one', {
      ...repository.verifications.get('owner-one')!,
      governmentId: {
        uploadId: 'upload-02',
        documentKind: 'national_id',
        originalFileName: 'new-id.jpg',
        contentType: 'image/jpeg',
        byteSize: 1000,
        uploadedAt: now.toISOString(),
        storagePath: 'private/owner-verification/owner-one/upload-02',
        bytesState: 'present',
      },
    });

    const originalVersion = repository.verifications.get('owner-one')?.version;
    const clearResult = await repository.markGovernmentIdCleared({
      ownerId: 'owner-one',
      uploadId: 'upload-01',
      storagePath: 'private/owner-verification/owner-one/upload-01',
      now,
    });

    expect(clearResult).toEqual({ cleared: false, reason: 'target_mismatch' });
    const currentVerif = repository.verifications.get('owner-one');
    expect(currentVerif?.governmentId?.uploadId).toBe('upload-02');
    expect(currentVerif?.governmentId?.bytesState).toBe('present');
    expect(currentVerif?.governmentId?.storagePath).toBe('private/owner-verification/owner-one/upload-02');
    expect(currentVerif?.version).toBe(originalVersion);
  });
});
