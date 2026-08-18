import { describe, expect, it } from 'vitest';

import { completeRenterProfileService } from './complete-renter-profile-service';
import type {
  RenterAuditEvent,
  RenterProfileRecord,
  RenterRepository,
  RenterTransaction,
  StoredRenterIdempotency,
} from './renter-repository';

class MockRenterRepository implements RenterRepository {
  profiles = new Map<string, RenterProfileRecord>();
  idempotency = new Map<string, StoredRenterIdempotency>();
  events: RenterAuditEvent[] = [];
  activeBookings = new Set<string>();

  async runTransaction<T>(work: (transaction: RenterTransaction) => Promise<T>): Promise<T> {
    const tx: RenterTransaction = {
      getRenterProfile: async (id) => this.profiles.get(id) ?? null,
      setRenterProfile: (id, record) => {
        this.profiles.set(id, record);
      },
      hasActiveBookings: async (id) => this.activeBookings.has(id),
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

describe('completeRenterProfileService', () => {
  const actor = { uid: 'renter-1', email: 'renter@example.com' };

  const validCommand = {
    schemaVersion: 1,
    idempotencyKey: 'idemp-renter-create-001',
    data: {
      fullName: 'Babatunde Adeleke',
      phone: '+2348012345678',
      defaultDeliveryAddress: {
        streetAddress: '15 Queens Drive, Ikoyi',
        areaLabel: 'Ikoyi',
        landmark: 'Near Federal High Court',
      },
      acceptedRenterTermsVersion: '2026-03-01',
      acceptedPrivacyNoticeVersion: '2026-03-01',
    },
  };

  it('creates a new renter profile with active status and audit trail', async () => {
    const repo = new MockRenterRepository();
    const result = await completeRenterProfileService(validCommand, actor, repo);

    expect(result.result.renterId).toBe('renter-1');
    expect(result.result.fullName).toBe('Babatunde Adeleke');
    expect(result.result.accountStatus).toBe('active');
    expect(result.result.profileVersion).toBe(1);

    expect(repo.profiles.get('renter-1')).toBeDefined();
    expect(repo.events.length).toBe(1);
    expect(repo.events[0].eventType).toBe('renter_profile_completed');
  });

  it('updates an existing renter profile incrementing version', async () => {
    const repo = new MockRenterRepository();
    await completeRenterProfileService(validCommand, actor, repo);

    const updateCommand = {
      ...validCommand,
      idempotencyKey: 'idemp-renter-update-002',
      data: {
        ...validCommand.data,
        fullName: 'Babatunde Adeleke Jr.',
      },
    };

    const result = await completeRenterProfileService(updateCommand, actor, repo);
    expect(result.result.fullName).toBe('Babatunde Adeleke Jr.');
    expect(result.result.profileVersion).toBe(2);
  });

  it('rejects stale terms acceptance', async () => {
    const repo = new MockRenterRepository();
    const staleCommand = {
      ...validCommand,
      data: {
        ...validCommand.data,
        acceptedRenterTermsVersion: '2024-01-01',
      },
    };

    await expect(
      completeRenterProfileService(staleCommand, actor, repo),
    ).rejects.toThrowError(/current renter terms/);
  });

  it('rejects invalid Nigerian phone numbers', async () => {
    const repo = new MockRenterRepository();
    const badPhoneCommand = {
      ...validCommand,
      data: {
        ...validCommand.data,
        phone: '08012345678', // Missing +234
      },
    };

    await expect(
      completeRenterProfileService(badPhoneCommand, actor, repo),
    ).rejects.toThrow();
  });
});
