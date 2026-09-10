import { describe, expect, it } from 'vitest';

import { requestAccountDeletionService } from './request-account-deletion-service.js';
import type {
  RenterAuditEvent,
  RenterProfileRecord,
  RenterRepository,
  RenterTransaction,
  StoredRenterIdempotency,
} from './renter-repository.js';

class MockRenterRepository implements RenterRepository {
  profiles = new Map<string, RenterProfileRecord>();
  idempotency = new Map<string, StoredRenterIdempotency>();
  events: RenterAuditEvent[] = [];
  activeBookings = new Set<string>();
  activeRentalRequests = new Set<string>();
  rentalRequestContactCount = new Map<string, number>();

  async runTransaction<T>(work: (transaction: RenterTransaction) => Promise<T>): Promise<T> {
    const tx: RenterTransaction = {
      getRenterProfile: async (id) => this.profiles.get(id) ?? null,
      setRenterProfile: (id, record) => {
        this.profiles.set(id, record);
      },
      hasActiveBookings: async (id) => this.activeBookings.has(id),
      hasActiveRentalRequests: async (id) => this.activeRentalRequests.has(id),
      deleteRentalRequestContacts: async (id) => {
        const count = this.rentalRequestContactCount.get(id) ?? 0;
        this.rentalRequestContactCount.set(id, 0);
        return count;
      },
      getIdempotency: async (id) => this.idempotency.get(id) ?? null,
      saveIdempotency: (id, record) => {
        this.idempotency.set(id, record);
      },
      createAuditEvent: (event) => {
        this.events.push(event);
      },
    };
    return work(tx);
  }

  async getRenterProfile(renterId: string): Promise<RenterProfileRecord | null> {
    return this.profiles.get(renterId) ?? null;
  }
}

describe('requestAccountDeletionService', () => {
  const actor = { uid: 'renter-1', email: 'renter@example.com' };

  const validProfile: RenterProfileRecord = {
    renterId: 'renter-1',
    fullName: 'Babatunde Adeleke',
    email: 'renter@example.com',
    phone: '+2348012345678',
    defaultDeliveryAddress: {
      streetAddress: '15 Queens Drive',
      areaLabel: 'Ikoyi',
    },
    acceptedRenterTermsVersion: '2026-03-01',
    acceptedPrivacyNoticeVersion: '2026-03-01',
    accountStatus: 'active',
    deletionReason: null,
    deletionRequestedAt: null,
    profileVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('marks active renter profile as deletion_requested and purges request contact PII', async () => {
    const repo = new MockRenterRepository();
    repo.profiles.set('renter-1', validProfile);
    repo.rentalRequestContactCount.set('renter-1', 2);

    const result = await requestAccountDeletionService(
      {
        schemaVersion: 1,
        idempotencyKey: 'idemp-delete-001',
        data: {
          confirmation: true,
          reason: 'No longer residing in Lagos',
        },
      },
      actor,
      repo,
    );

    expect(result.result.accountStatus).toBe('deletion_requested');
    expect(repo.profiles.get('renter-1')?.accountStatus).toBe('deletion_requested');
    expect(repo.profiles.get('renter-1')?.deletionReason).toBe('No longer residing in Lagos');
    expect(repo.rentalRequestContactCount.get('renter-1')).toBe(0);
    expect(repo.events.at(-1)?.details).toMatchObject({ deletedRentalRequestContactCount: 2 });
  });

  it('rejects deletion when renter has active bookings', async () => {
    const repo = new MockRenterRepository();
    repo.profiles.set('renter-1', validProfile);
    repo.activeBookings.add('renter-1');

    await expect(
      requestAccountDeletionService(
        {
          schemaVersion: 1,
          idempotencyKey: 'idemp-delete-002',
          data: { confirmation: true },
        },
        actor,
        repo,
      ),
    ).rejects.toThrowError(/active or in-progress rentals/);
  });

  it('rejects deletion while a concierge rental request is still active and keeps its contact PII intact', async () => {
    const repo = new MockRenterRepository();
    repo.profiles.set('renter-1', validProfile);
    repo.activeRentalRequests.add('renter-1');
    repo.rentalRequestContactCount.set('renter-1', 1);

    await expect(
      requestAccountDeletionService(
        {
          schemaVersion: 1,
          idempotencyKey: 'idemp-delete-003',
          data: { confirmation: true },
        },
        actor,
        repo,
      ),
    ).rejects.toThrowError(/concierge rental request is still active/);

    expect(repo.rentalRequestContactCount.get('renter-1')).toBe(1);
    expect(repo.profiles.get('renter-1')?.accountStatus).toBe('active');
  });
});
