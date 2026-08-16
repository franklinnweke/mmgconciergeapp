import { describe, expect, it } from 'vitest';

import type {
  VehicleRepository,
  VehicleTransaction,
  VehicleRecord,
  VehiclePrivateRecord,
  StoredVehicleIdempotency,
  VehicleAuditEvent,
} from './vehicle-repository.js';
import { createVehicleDraft } from './create-vehicle-draft-service.js';

function mockRepository(): { repository: VehicleRepository; writes: () => { vehicles: VehicleRecord[]; privateRecords: VehiclePrivateRecord[]; auditEvents: VehicleAuditEvent[] } } {
  const vehicles: VehicleRecord[] = [];
  const privateRecords: VehiclePrivateRecord[] = [];
  const auditEvents: VehicleAuditEvent[] = [];
  const idempotencyStore = new Map<string, StoredVehicleIdempotency>();

  const tx: VehicleTransaction = {
    getOwnerProfile: async (ownerId: string) => {
      if (ownerId === 'owner-approved') return { verificationStatus: 'approved' };
      if (ownerId === 'owner-draft') return { verificationStatus: 'draft' };
      return null;
    },
    getVehicle: async () => null,
    getVehiclePrivate: async () => null,
    getVehicleImages: async () => [],
    getVehicleRevision: async () => null,
    getIdempotency: async (documentId: string) => idempotencyStore.get(documentId) ?? null,
    setVehicle: (_id: string, record: VehicleRecord) => { vehicles.push(record); },
    setVehiclePrivate: (_id: string, record: VehiclePrivateRecord) => { privateRecords.push(record); },
    setVehicleImage: () => {},
    setVehicleRevision: () => {},
    createAuditEvent: (event: VehicleAuditEvent) => { auditEvents.push(event); },
    saveIdempotency: (documentId: string, record: StoredVehicleIdempotency) => { idempotencyStore.set(documentId, record); },
  };

  const repository: VehicleRepository = {
    runTransaction: async <T>(work: (t: VehicleTransaction) => Promise<T>) => work(tx),
  };

  return { repository, writes: () => ({ vehicles, privateRecords, auditEvents }) };
}

const validCommand = (idempotencyKey = 'key-create-draft-01') => ({
  schemaVersion: 1 as const,
  idempotencyKey,
  data: {
    specs: {
      make: 'Toyota',
      model: 'Land Cruiser Prado',
      year: 2024,
      colour: 'Pearl White',
      category: 'executive_suv' as const,
      seats: 7,
      description: 'A pristine executive SUV perfect for Lagos business travel and VIP events.',
    },
    ownerDailyRateKobo: 150_000_00,
    areaLabel: 'Victoria Island' as const,
  },
});

describe('createVehicleDraft service', () => {
  const now = new Date('2026-08-16T12:00:00Z');

  it('creates a draft vehicle for an approved owner', async () => {
    const { repository, writes } = mockRepository();

    const result = await createVehicleDraft(validCommand(), 'owner-approved', {
      repository,
      now: () => now,
      createVehicleId: () => 'vehicle-01',
    });

    expect(result.result.vehicleId).toBe('vehicle-01');
    expect(result.result.moderationStatus).toBe('draft');
    expect(result.result.visibility).toBe('paused');

    const { vehicles, privateRecords, auditEvents } = writes();
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].ownerId).toBe('owner-approved');
    expect(vehicles[0].moderationStatus).toBe('draft');
    expect(vehicles[0].discoverable).toBe(false);
    expect(vehicles[0].chauffeurPolicy).toBe('included');
    expect(vehicles[0].deliveryPolicy).toBe('included');
    expect(privateRecords).toHaveLength(1);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].eventType).toBe('vehicle.draft_created');
  });

  it('rejects unapproved owners', async () => {
    const { repository } = mockRepository();

    await expect(
      createVehicleDraft(validCommand(), 'owner-draft', {
        repository,
        now: () => now,
        createVehicleId: () => 'vehicle-02',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects unknown users', async () => {
    const { repository } = mockRepository();

    await expect(
      createVehicleDraft(validCommand(), 'unknown-user', {
        repository,
        now: () => now,
        createVehicleId: () => 'vehicle-03',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects invalid commands', async () => {
    const { repository } = mockRepository();

    await expect(
      createVehicleDraft({ schemaVersion: 1, idempotencyKey: 'key-01', data: { ownerDailyRateKobo: 100 } }, 'owner-approved', {
        repository,
        now: () => now,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('replays idempotent result', async () => {
    const { repository } = mockRepository();

    const first = await createVehicleDraft(validCommand('key-replay-batch-01'), 'owner-approved', {
      repository,
      now: () => now,
      createVehicleId: () => 'vehicle-replay',
    });

    const second = await createVehicleDraft(validCommand('key-replay-batch-01'), 'owner-approved', {
      repository,
      now: () => now,
      createVehicleId: () => 'vehicle-replay',
    });

    expect(second.result.vehicleId).toBe(first.result.vehicleId);
  });
});