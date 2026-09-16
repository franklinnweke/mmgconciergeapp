import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  type SubmitOwnerVerificationCommand,
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
import type { StorageGateway, StoredObjectMetadata } from './storage-validation.js';
import { submitOwnerVerification } from './submit-owner-verification-service.js';

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

class InMemoryStorageGateway implements StorageGateway {
  files = new Map<string, { metadata: StoredObjectMetadata; data: Buffer }>();

  async getObjectMetadata(storagePath: string): Promise<StoredObjectMetadata | null> {
    return this.files.get(storagePath)?.metadata ?? null;
  }

  async readFirstBytes(storagePath: string, byteCount: number): Promise<Buffer | null> {
    const file = this.files.get(storagePath);
    if (!file) return null;
    return file.data.subarray(0, byteCount);
  }
}

function validSubmitCommand(idempotencyKey = 'idempotency-key-submit-01'): SubmitOwnerVerificationCommand {
  return {
    schemaVersion: 1,
    idempotencyKey,
    data: {
      uploadId: 'upload-id-valid-001',
      documentKind: 'national_id',
      originalFileName: 'national-id.jpg',
    },
  };
}

describe('submitOwnerVerification service', () => {
  let repository: InMemoryOwnerRepository;
  let storageGateway: InMemoryStorageGateway;
  const now = new Date('2026-08-15T12:00:00.000Z');
  const validJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

  const validAuth = {
    uid: 'owner-one',
    token: {
      email: 'musa@example.com',
      email_verified: true,
      phone_number: '+2348012345678',
      firebase: {
        identities: {
          phone: ['+2348012345678'],
        },
      },
    },
  };

  beforeEach(() => {
    repository = new InMemoryOwnerRepository();
    storageGateway = new InMemoryStorageGateway();

    repository.users.set('owner-one', {
      uid: 'owner-one',
      accountType: 'owner',
      email: 'musa@example.com',
      displayName: 'Musa D',
    });

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
      verificationStatus: 'draft',
      verificationUpdatedAt: now.toISOString(),
      lastDecisionReason: null,
      ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
      commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      termsAcceptedAt: now.toISOString(),
      governmentId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 1,
    });

    repository.verifications.set('owner-one', {
      ownerId: 'owner-one',
      status: 'draft',
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
      governmentId: null,
      version: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    storageGateway.files.set('private/owner-verification/owner-one/upload-id-valid-001', {
      metadata: {
        contentType: 'image/jpeg',
        size: 1024,
        timeCreated: now.toISOString(),
        customMetadata: { ownerId: 'owner-one', purpose: 'government_id' },
      },
      data: validJpegBytes,
    });
  });

  it('submits owner verification successfully from draft', async () => {
    const result = await submitOwnerVerification(validSubmitCommand(), validAuth, {
      repository,
      storageGateway,
      now: () => now,
      createRequestId: () => 'req-submit-01',
    });

    expect(result.result).toEqual({
      ownerId: 'owner-one',
      verificationStatus: 'submitted',
      submittedAt: now.toISOString(),
      receiptId: 'owner-one',
    });

    const savedVerification = repository.verifications.get('owner-one');
    expect(savedVerification?.status).toBe('submitted');
    expect(savedVerification?.phoneE164).toBe('+2348012345678');
    expect(savedVerification?.governmentId).toMatchObject({
      uploadId: 'upload-id-valid-001',
      documentKind: 'national_id',
      storagePath: 'private/owner-verification/owner-one/upload-id-valid-001',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    const savedProfile = repository.profiles.get('owner-one');
    expect(savedProfile?.verificationStatus).toBe('submitted');
    expect(savedProfile?.governmentId).toMatchObject({
      uploadId: 'upload-id-valid-001',
      documentKind: 'national_id',
      contentType: 'image/jpeg',
      status: 'submitted',
    });
    expect((savedProfile?.governmentId as Record<string, unknown>).storagePath).toBeUndefined();

    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.auditEvents[0]).toMatchObject({
      eventType: 'owner.verification_submitted',
      fromState: 'draft',
      toState: 'submitted',
    });

    expect(repository.notifications).toHaveLength(1);
    expect(repository.notifications[0]).toMatchObject({
      eventType: 'owner.verification_submitted',
      status: 'unavailable',
    });
  });

  it('submits a renter application without changing its compatibility account type', async () => {
    repository.users.get('owner-one')!.accountType = 'renter';
    const result = await submitOwnerVerification(validSubmitCommand(), validAuth, { repository, storageGateway, now: () => now });
    expect(result.result.verificationStatus).toBe('submitted');
    expect(repository.users.get('owner-one')!.accountType).toBe('renter');
    expect(repository.profiles.get('owner-one')!.verificationStatus).toBe('submitted');
  });

  it.each(['profile-owner', 'verification-owner', 'status', 'version', 'missing-user', 'user-owner'])('fails closed on %s corruption without partial effects', async (mode) => {
    if (mode === 'profile-owner') repository.profiles.get('owner-one')!.ownerId = 'other';
    if (mode === 'verification-owner') repository.verifications.get('owner-one')!.ownerId = 'other';
    if (mode === 'status') repository.profiles.get('owner-one')!.verificationStatus = 'approved';
    if (mode === 'version') repository.profiles.get('owner-one')!.version = 0;
    if (mode === 'missing-user') repository.users.delete('owner-one');
    if (mode === 'user-owner') repository.users.get('owner-one')!.uid = 'other';
    await expect(submitOwnerVerification(validSubmitCommand(), validAuth, { repository, storageGateway, now: () => now }))
      .rejects.toMatchObject({ code: ['missing-user', 'user-owner'].includes(mode) ? 'FORBIDDEN' : 'FAILED_PRECONDITION' });
    expect(repository.auditEvents).toHaveLength(0);
    expect(repository.notifications).toHaveLength(0);
    expect(repository.idempotency.size).toBe(0);
    expect(repository.verifications.get('owner-one')!.status).toBe('draft');
  });

  it('submits owner verification from rejected status and preserves previous reason', async () => {
    repository.profiles.get('owner-one')!.verificationStatus = 'rejected';
    repository.verifications.set('owner-one', {
      ...repository.verifications.get('owner-one')!,
      status: 'rejected',
      lastDecisionReason: 'Previous document was blurred',
      version: 2,
    });

    const result = await submitOwnerVerification(validSubmitCommand(), validAuth, {
      repository,
      storageGateway,
      now: () => now,
    });

    expect(result.result.verificationStatus).toBe('submitted');
    const savedVerification = repository.verifications.get('owner-one');
    expect(savedVerification?.previousDecisionReason).toBe('Previous document was blurred');
    expect(savedVerification?.lastDecisionReason).toBeNull();
  });

  it('rejects stale accepted owner terms before creating submission side effects', async () => {
    repository.profiles.get('owner-one')!.ownerTermsVersion = 'owner-terms-outdated';
    repository.verifications.get('owner-one')!.ownerTermsVersion = 'owner-terms-outdated';

    await expect(
      submitOwnerVerification(validSubmitCommand(), validAuth, {
        repository,
        storageGateway,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      safeDetails: { reason: 'terms_stale' },
    });

    expect(repository.profiles.get('owner-one')!.verificationStatus).toBe('draft');
    expect(repository.verifications.get('owner-one')!.status).toBe('draft');
    expect(repository.auditEvents).toHaveLength(0);
    expect(repository.notifications).toHaveLength(0);
    expect(repository.idempotency.size).toBe(0);
  });

  it('denies submission when Nigerian phone is unlinked on Auth token', async () => {
    const authWithoutPhone = {
      uid: 'owner-one',
      token: {
        email: 'musa@example.com',
        email_verified: true,
      },
    };

    await expect(
      submitOwnerVerification(validSubmitCommand(), authWithoutPhone, {
        repository,
        storageGateway,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      safeDetails: { reason: 'phone_unverified' },
    });
  });

  it('denies submission when profile is missing or incomplete', async () => {
    repository.profiles.delete('owner-one');

    await expect(
      submitOwnerVerification(validSubmitCommand(), validAuth, {
        repository,
        storageGateway,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: 'PROFILE_INCOMPLETE',
    });
  });

  it('denies submission when already in submitted or resolved states', async () => {
    repository.profiles.get('owner-one')!.verificationStatus = 'submitted';
    repository.verifications.set('owner-one', {
      ...repository.verifications.get('owner-one')!,
      status: 'submitted',
    });

    await expect(
      submitOwnerVerification(validSubmitCommand(), validAuth, {
        repository,
        storageGateway,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
      safeDetails: { reason: 'stale_version' },
    });
  });

  it('denies submission when uploaded storage object does not exist', async () => {
    storageGateway.files.clear();

    await expect(
      submitOwnerVerification(validSubmitCommand(), validAuth, {
        repository,
        storageGateway,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      safeDetails: { reason: 'upload_invalid' },
    });
  });

  it('returns cached result on idempotent replay', async () => {
    const deps = { repository, storageGateway, now: () => now };
    const first = await submitOwnerVerification(validSubmitCommand('idempotency-key-submit-same-01'), validAuth, deps);
    const second = await submitOwnerVerification(validSubmitCommand('idempotency-key-submit-same-01'), validAuth, deps);

    expect(second).toEqual(first);
    expect(repository.auditEvents).toHaveLength(1);
  });
});
