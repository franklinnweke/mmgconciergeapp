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
    expect(vehicles[0]).toMatchObject({ approxLatitude: 6.43, approxLongitude: 3.42 });
    expect(privateRecords).toHaveLength(1);
    expect(privateRecords[0]).toMatchObject({ exactLatitude: null, exactLongitude: null, placeId: null });
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

  it('keeps exact bases private and derives only rounded discovery coordinates', async () => {
    const { repository, writes } = mockRepository();
    const command = validCommand();
    await createVehicleDraft({ ...command, data: { ...command.data, exactBase: { latitude: 6.428123, longitude: 3.421987 } } }, 'owner-approved', { repository });
    expect(writes().vehicles[0]).toMatchObject({ approxLatitude: 6.43, approxLongitude: 3.42 });
    expect(writes().privateRecords[0]).toMatchObject({ exactLatitude: 6.428123, exactLongitude: 3.421987 });
  });

  it('rejects inconsistent area labels without creating a listing', async () => {
    const { repository, writes } = mockRepository();
    const command = validCommand();
    await expect(createVehicleDraft({ ...command, data: { ...command.data,
      baseAddress: { line1: '12 Fictional Road', areaLabel: 'Ikoyi', city: 'Lagos', country: 'NG' },
    } }, 'owner-approved', { repository })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(writes().vehicles).toHaveLength(0);
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
