import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  type CompleteOwnerProfileCommand,
} from '@mmg/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { completeOwnerProfile } from './complete-owner-profile-service.js';
import type {
  OwnerAuditEvent,
  OwnerProfileRecord,
  OwnerRepository,
  OwnerTransaction,
  OwnerVerificationConfig,
  OwnerVerificationRecord,
  StoredOwnerIdempotency,
  TrustedUserAccount,
} from './firestore-owner-repository.js';

class InMemoryOwnerRepository implements OwnerRepository {
  users = new Map<string, TrustedUserAccount>();
  profiles = new Map<string, OwnerProfileRecord>();
  verifications = new Map<string, OwnerVerificationRecord>();
  idempotency = new Map<string, StoredOwnerIdempotency>();
  auditEvents: OwnerAuditEvent[] = [];
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
      saveIdempotency: (id, record) => {
        this.idempotency.set(id, record);
      },
    };
    return work(transaction);
  }
}

function validCommand(idempotencyKey = 'idempotency-key-00001'): CompleteOwnerProfileCommand {
  return {
    schemaVersion: 1,
    idempotencyKey,
    data: {
      legalName: 'Alhaji Musa Danjuma',
      address: {
        line1: '14 Admiralty Way',
        areaLabel: 'Lekki Phase 1',
        city: 'Lagos',
        country: 'NG',
      },
      acceptedOwnerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
      acceptedCommissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
      acceptedPrivacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
    },
  };
}

describe('completeOwnerProfile service', () => {
  let repository: InMemoryOwnerRepository;
  const now = new Date('2026-08-15T12:00:00.000Z');

  beforeEach(() => {
    repository = new InMemoryOwnerRepository();
    repository.users.set('owner-one', {
      uid: 'owner-one',
      accountType: 'owner',
      email: 'musa@example.com',
      displayName: 'Musa D',
    });
  });

  it('completes first-time profile for a verified owner without phone', async () => {
    const result = await completeOwnerProfile(
      validCommand(),
      {
        uid: 'owner-one',
        token: { email: 'musa@example.com', email_verified: true },
      },
      {
        repository,
        now: () => now,
        createRequestId: () => 'req-001',
      },
    );

    expect(result.result).toEqual({
      ownerId: 'owner-one',
      verificationStatus: 'draft',
      profileVersion: 1,
    });

    const savedProfile = repository.profiles.get('owner-one');
    expect(savedProfile).toMatchObject({
      ownerId: 'owner-one',
      displayName: 'Alhaji Musa Danjuma',
      legalName: 'Alhaji Musa Danjuma',
      verificationStatus: 'draft',
      lastDecisionReason: null,
      governmentId: null,
      version: 1,
    });

    const savedVerification = repository.verifications.get('owner-one');
    expect(savedVerification).toMatchObject({
      ownerId: 'owner-one',
      status: 'draft',
      legalName: 'Alhaji Musa Danjuma',
      email: 'musa@example.com',
      phoneE164: null,
      version: 1,
    });

    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.auditEvents[0]).toMatchObject({
      actorId: 'owner-one',
      entityType: 'ownerProfile',
      eventType: 'owner.profile_completed',
      fromState: null,
      toState: 'draft',
    });
  });

  it('captures optional Nigerian phone from auth token if present', async () => {
    await completeOwnerProfile(
      validCommand(),
      {
        uid: 'owner-one',
        token: {
          email: 'musa@example.com',
          email_verified: true,
          phone_number: '+2348012345678',
        },
      },
      {
        repository,
        now: () => now,
        createRequestId: () => 'req-001',
      },
    );

    const savedVerification = repository.verifications.get('owner-one');
    expect(savedVerification?.phoneE164).toBe('+2348012345678');
  });

  it('updates an existing draft profile and increments profileVersion', async () => {
    repository.profiles.set('owner-one', {
      ownerId: 'owner-one',
      displayName: 'Old Name',
      legalName: 'Old Name',
      address: {
        line1: '1 Old St',
        areaLabel: 'Ikeja',
        city: 'Lagos',
        country: 'NG',
      },
      verificationStatus: 'draft',
      verificationUpdatedAt: now.toISOString(),
      lastDecisionReason: null,
      governmentId: null,
      termsAcceptedAt: now.toISOString(),
      ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
      commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 1,
    });
    repository.verifications.set('owner-one', {
      ownerId: 'owner-one',
      status: 'draft',
      legalName: 'Old Name',
      address: {
        line1: '1 Old St',
        areaLabel: 'Ikeja',
        city: 'Lagos',
        country: 'NG',
      },
      email: 'musa@example.com',
      phoneE164: null,
      ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
      commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      termsAcceptedAt: now.toISOString(),
      version: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    const result = await completeOwnerProfile(
      validCommand('idempotency-key-00002'),
      {
        uid: 'owner-one',
        token: { email: 'musa@example.com', email_verified: true },
      },
      {
        repository,
        now: () => now,
        createRequestId: () => 'req-002',
      },
    );

    expect(result.result.profileVersion).toBe(2);
    expect(result.result.verificationStatus).toBe('draft');
    expect(repository.verifications.get('owner-one')?.version).toBe(2);
    expect(repository.profiles.get('owner-one')?.legalName).toBe('Alhaji Musa Danjuma');
  });

  it('updates an existing rejected profile while preserving rejected status (never coerces to draft)', async () => {
    repository.profiles.set('owner-one', {
      ownerId: 'owner-one',
      displayName: 'Musa D',
      legalName: 'Musa D',
      address: {
        line1: '1 Old St',
        areaLabel: 'Ikeja',
        city: 'Lagos',
        country: 'NG',
      },
      verificationStatus: 'rejected',
      verificationUpdatedAt: now.toISOString(),
      lastDecisionReason: 'ID unclear',
      governmentId: null,
      termsAcceptedAt: now.toISOString(),
      ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
      commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 1,
    });
    repository.verifications.set('owner-one', {
      ownerId: 'owner-one',
      status: 'rejected',
      legalName: 'Musa D',
      address: {
        line1: '1 Old St',
        areaLabel: 'Ikeja',
        city: 'Lagos',
        country: 'NG',
      },
      email: 'musa@example.com',
      phoneE164: '+2348012345678',
      ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
      commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      termsAcceptedAt: now.toISOString(),
      lastDecisionReason: 'ID unclear',
      version: 2,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    const result = await completeOwnerProfile(
      validCommand('idempotency-key-00003'),
      {
        uid: 'owner-one',
        token: { email: 'musa@example.com', email_verified: true },
      },
      {
        repository,
        now: () => now,
        createRequestId: () => 'req-003',
      },
    );

    expect(result.result.verificationStatus).toBe('rejected');
    expect(result.result.profileVersion).toBe(2);
    expect(repository.verifications.get('owner-one')?.status).toBe('rejected');
    expect(repository.verifications.get('owner-one')?.version).toBe(3);
  });

  it('denies profile update when status is submitted, under_review, approved, suspended, or revoked', async () => {
    const lockedStates = ['submitted', 'under_review', 'approved', 'suspended', 'revoked'] as const;

    for (const status of lockedStates) {
      repository.verifications.set('owner-one', {
        ownerId: 'owner-one',
        status,
        legalName: 'Musa D',
        address: { line1: '1 St', areaLabel: 'Ikeja', city: 'Lagos', country: 'NG' },
        email: 'musa@example.com',
        phoneE164: null,
        ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
        commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
        privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
        termsAcceptedAt: now.toISOString(),
        version: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });

      await expect(
        completeOwnerProfile(
          validCommand(`idempotency-key-status-${status}`),
          {
            uid: 'owner-one',
            token: { email: 'musa@example.com', email_verified: true },
          },
          { repository, now: () => now },
        ),
      ).rejects.toMatchObject({
        code: 'INVALID_STATE_TRANSITION',
        safeDetails: { reason: 'stale_version' },
      });
    }
  });

  it('denies completion if user accountType is not owner (e.g. renter)', async () => {
    repository.users.set('renter-user', {
      uid: 'renter-user',
      accountType: 'renter',
      email: 'renter@example.com',
    });

    await expect(
      completeOwnerProfile(
        validCommand(),
        {
          uid: 'renter-user',
          token: { email: 'renter@example.com', email_verified: true },
        },
        { repository, now: () => now },
      ),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      safeDetails: { reason: 'not_owner' },
    });
  });

  it('denies completion if email is unverified', async () => {
    await expect(
      completeOwnerProfile(
        validCommand(),
        {
          uid: 'owner-one',
          token: { email: 'musa@example.com', email_verified: false },
        },
        { repository, now: () => now },
      ),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      safeDetails: { reason: 'email_unverified' },
    });
  });

  it('denies completion if command submits outdated terms versions', async () => {
    const invalidCommand = {
      schemaVersion: 1,
      idempotencyKey: 'idempotency-key-stale-01',
      data: {
        legalName: 'Alhaji Musa Danjuma',
        address: {
          line1: '14 Admiralty Way',
          areaLabel: 'Lekki Phase 1',
          city: 'Lagos',
          country: 'NG',
        },
        acceptedOwnerTermsVersion: 'v0-deprecated',
        acceptedCommissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
        acceptedPrivacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      },
    };

    await expect(
      completeOwnerProfile(
        invalidCommand,
        {
          uid: 'owner-one',
          token: { email: 'musa@example.com', email_verified: true },
        },
        { repository, now: () => now },
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  it('handles idempotency replay with same hash without re-writing', async () => {
    const auth = {
      uid: 'owner-one',
      token: { email: 'musa@example.com', email_verified: true },
    };
    const deps = { repository, now: () => now, createRequestId: () => 'req-first' };

    const firstResult = await completeOwnerProfile(validCommand('idempotency-key-same-01'), auth, deps);
    const secondResult = await completeOwnerProfile(validCommand('idempotency-key-same-01'), auth, deps);

    expect(secondResult).toEqual(firstResult);
    expect(repository.auditEvents).toHaveLength(1);
  });

  it('throws IDEMPOTENCY_CONFLICT when same key is used with differing data', async () => {
    const auth = {
      uid: 'owner-one',
      token: { email: 'musa@example.com', email_verified: true },
    };
    const deps = { repository, now: () => now, createRequestId: () => 'req-first' };

    await completeOwnerProfile(validCommand('idempotency-key-conflict-01'), auth, deps);

    const changedCommand: CompleteOwnerProfileCommand = {
      schemaVersion: 1,
      idempotencyKey: 'idempotency-key-conflict-01',
      data: {
        ...validCommand().data,
        legalName: 'Different Name',
      },
    };

    await expect(
      completeOwnerProfile(changedCommand, auth, deps),
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });
});
