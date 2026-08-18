import { describe, expect, it } from 'vitest';

import type {
  StoredVehicleIdempotency,
  VehicleAuditEvent,
  VehicleImageRecord,
  VehicleNotificationOutbox,
  VehiclePrivateRecord,
  VehicleRecord,
  VehicleRepository,
  VehicleTransaction,
} from './vehicle-repository.js';
import { submitVehicleForReview } from './submit-vehicle-for-review-service.js';

function mockRepository(options?: {
  vehicleOwnerId?: string;
  isApproved?: boolean;
  moderationStatus?: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'suspended';
  missingField?: 'specs' | 'description' | 'rate' | 'plate' | 'coords' | 'images';
}): {
  repository: VehicleRepository;
  writes: () => {
    vehicles: VehicleRecord[];
    auditEvents: VehicleAuditEvent[];
    outbox: VehicleNotificationOutbox[];
  };
} {
  const writtenVehicles: VehicleRecord[] = [];
  const auditEvents: VehicleAuditEvent[] = [];
  const outbox: VehicleNotificationOutbox[] = [];
  const idempotencyStore = new Map<string, StoredVehicleIdempotency>();
  const isApproved = options?.isApproved ?? true;
  const ownerId = options?.vehicleOwnerId ?? 'owner-1';
  const moderationStatus = options?.moderationStatus ?? 'draft';
  const missing = options?.missingField;

  const sampleVehicle: VehicleRecord = {
    vehicleId: 'veh-01',
    ownerId,
    displayName: 'Toyota Prado',
    make: missing === 'specs' ? null : 'Toyota',
    model: missing === 'specs' ? null : 'Prado',
    year: missing === 'specs' ? null : 2023,
    colour: missing === 'specs' ? null : 'Black',
    category: missing === 'specs' ? null : 'executive_suv',
    seats: missing === 'specs' ? null : 7,
    transmission: 'automatic',
    fuelType: 'petrol',
    mileageKm: 20000,
    description:
      missing === 'description'
        ? 'Short'
        : 'A pristine luxury executive SUV perfect for business travel and VIP events in Lagos.',
    features: ['leather'],
    ownerDailyRateKobo: missing === 'rate' ? null : 150_000_00,
    chauffeurPolicy: 'included',
    deliveryPolicy: 'included',
    areaLabel: 'Victoria Island',
    approxLatitude: 6.43,
    approxLongitude: 3.42,
    moderationStatus,
    visibility: 'paused',
    discoverable: false,
    lastDecisionReason: null,
    pendingRevisionId: null,
    imageCount: missing === 'images' ? 0 : 1,
    primaryImagePath: 'path/card.jpg',
    createdAt: '2026-08-16T12:00:00.000Z',
    updatedAt: '2026-08-16T12:00:00.000Z',
    version: 1,
  };

  const samplePrivate: VehiclePrivateRecord = {
    vehicleId: 'veh-01',
    ownerId,
    plate: missing === 'plate' ? null : 'AAA123AA',
    baseAddress: { line1: '12 Marina Road, VI', city: 'Lagos' },
    exactLatitude: missing === 'coords' ? null : 6.428,
    exactLongitude: missing === 'coords' ? null : 3.421,
    placeId: 'pl-01',
    documentPaths: [],
    createdAt: '2026-08-16T12:00:00.000Z',
    updatedAt: '2026-08-16T12:00:00.000Z',
  };

  const sampleImages: VehicleImageRecord[] =
    missing === 'images'
      ? []
      : [
          {
            imageId: 'img-01',
            vehicleId: 'veh-01',
            ownerId,
            order: 0,
            status: 'processed',
            width: 1920,
            height: 1080,
            originalUploadId: 'upload-01',
            variantPaths: { card: 'path/card.jpg' },
            processing: {
              sourceFormat: 'jpeg',
              sourceByteSize: 1_200_000,
              sourceHadExif: true,
              sourceGps: 'present',
              metadataStripped: true,
              variants: {
                card: {
                  path: 'path/card.jpg',
                  width: 800,
                  height: 450,
                  byteSize: 90_000,
                  contentType: 'image/jpeg',
                },
              },
            },
            publicVariantPaths: null,
            promotedAt: null,
            createdAt: '2026-08-16T12:00:00.000Z',
            updatedAt: '2026-08-16T12:00:00.000Z',
          },
        ];

  const tx: VehicleTransaction = {
    getOwnerProfile: async (id: string) => {
      if (id === 'owner-1') return { verificationStatus: isApproved ? 'approved' : 'draft' };
      if (id === ownerId && isApproved) return { verificationStatus: 'approved' };
      return null;
    },
    getVehicle: async (id: string) => (id === 'veh-01' ? sampleVehicle : null),
    getVehiclePrivate: async (id: string) => (id === 'veh-01' ? samplePrivate : null),
    getVehicleImages: async (id: string) => (id === 'veh-01' ? sampleImages : []),
    getVehicleRevision: async () => null,
    getIdempotency: async (documentId: string) => idempotencyStore.get(documentId) ?? null,
    setVehicle: (_id: string, record: VehicleRecord) => { writtenVehicles.push(record); },
    setVehiclePrivate: () => {},
    setVehicleImage: () => {},
    setVehicleRevision: () => {},
    createAuditEvent: (event: VehicleAuditEvent) => { auditEvents.push(event); },
    createNotificationOutbox: (record: VehicleNotificationOutbox) => { outbox.push(record); },
    saveIdempotency: (documentId: string, record: StoredVehicleIdempotency) => {
      idempotencyStore.set(documentId, record);
    },
  };

  const repository: VehicleRepository = {
    runTransaction: async <T>(work: (t: VehicleTransaction) => Promise<T>) => work(tx),
  };

  return {
    repository,
    writes: () => ({
      vehicles: writtenVehicles,
      auditEvents,
      outbox,
    }),
  };
}

const validCommand = (idempotencyKey = 'key-submit-00000001') => ({
  schemaVersion: 1 as const,
  idempotencyKey,
  data: {
    vehicleId: 'veh-01',
    expectedVersion: 1,
  },
});

describe('submitVehicleForReview service', () => {
  const now = new Date('2026-08-16T12:00:00Z');

  it('submits a complete draft vehicle for review', async () => {
    const { repository, writes } = mockRepository();

    const result = await submitVehicleForReview(validCommand(), 'owner-1', {
      repository,
      now: () => now,
    });

    expect(result.result.vehicleId).toBe('veh-01');
    expect(result.result.moderationStatus).toBe('pending_review');
    expect(result.result.version).toBe(2);

    const { vehicles, auditEvents, outbox } = writes();
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].moderationStatus).toBe('pending_review');
    expect(vehicles[0].version).toBe(2);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].eventType).toBe('vehicle.submitted');
    expect(outbox).toHaveLength(1);
  });

  it('rejects submission when vehicle details are incomplete', async () => {
    const { repository } = mockRepository({ missingField: 'description' });

    await expect(
      submitVehicleForReview(validCommand(), 'owner-1', {
        repository,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      safeDetails: { reason: 'listing_incomplete' },
    });
  });

  it('rejects submission when no images have been finalized', async () => {
    const { repository } = mockRepository({ missingField: 'images' });

    await expect(
      submitVehicleForReview(validCommand(), 'owner-1', {
        repository,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      safeDetails: { reason: 'listing_incomplete' },
    });
  });

  it('rejects submission if expected version does not match', async () => {
    const { repository } = mockRepository();

    await expect(
      submitVehicleForReview(
        {
          schemaVersion: 1 as const,
          idempotencyKey: 'key-submit-bad-ver-01',
          data: { vehicleId: 'veh-01', expectedVersion: 99 },
        },
        'owner-1',
        { repository, now: () => now },
      ),
    ).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
    });
  });

  it('allows submission when exact coordinates are null but street address and area are present', async () => {
    const { repository, writes } = mockRepository({ missingField: 'coords' });

    const result = await submitVehicleForReview(validCommand('key-submit-no-coords-1'), 'owner-1', {
      repository,
      now: () => now,
    });

    expect(result.result.vehicleId).toBe('veh-01');
    expect(result.result.moderationStatus).toBe('pending_review');

    const { vehicles } = writes();
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].moderationStatus).toBe('pending_review');
  });
});
