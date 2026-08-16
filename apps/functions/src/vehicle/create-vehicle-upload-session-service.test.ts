import { describe, expect, it } from 'vitest';

import type {
  StoredVehicleIdempotency,
  VehicleAuditEvent,
  VehicleImageRecord,
  VehiclePrivateRecord,
  VehicleRecord,
  VehicleRepository,
  VehicleTransaction,
} from './vehicle-repository.js';
import { createVehicleUploadSession } from './create-vehicle-upload-session-service.js';

function mockRepository(options?: {
  vehicleOwnerId?: string;
  isApproved?: boolean;
  isDeleted?: boolean;
  imageCount?: number;
  docCount?: number;
}): {
  repository: VehicleRepository;
  writes: () => { auditEvents: VehicleAuditEvent[] };
} {
  const auditEvents: VehicleAuditEvent[] = [];
  const idempotencyStore = new Map<string, StoredVehicleIdempotency>();
  const isApproved = options?.isApproved ?? true;
  const ownerId = options?.vehicleOwnerId ?? 'owner-1';
  const isDeleted = options?.isDeleted ?? false;
  const imageCount = options?.imageCount ?? 0;
  const docCount = options?.docCount ?? 0;

  const sampleVehicle: VehicleRecord = {
    vehicleId: 'veh-01',
    ownerId,
    displayName: 'Toyota Prado',
    make: 'Toyota',
    model: 'Prado',
    year: 2023,
    colour: 'Black',
    category: 'executive_suv',
    seats: 7,
    transmission: 'automatic',
    fuelType: 'petrol',
    mileageKm: 20000,
    description: 'Executive vehicle in Victoria Island for VIP guests.',
    features: ['leather'],
    ownerDailyRateKobo: 150_000_00,
    chauffeurPolicy: 'included',
    deliveryPolicy: 'included',
    areaLabel: 'Victoria Island',
    approxLatitude: 6.43,
    approxLongitude: 3.42,
    moderationStatus: 'draft',
    visibility: isDeleted ? 'deleted' : 'paused',
    discoverable: false,
    lastDecisionReason: null,
    pendingRevisionId: null,
    imageCount,
    primaryImagePath: null,
    createdAt: '2026-08-16T12:00:00.000Z',
    updatedAt: '2026-08-16T12:00:00.000Z',
    version: 1,
  };

  const samplePrivate: VehiclePrivateRecord = {
    vehicleId: 'veh-01',
    ownerId,
    plate: 'AAA123AA',
    baseAddress: { line1: '12 Marina Road', city: 'Lagos' },
    exactLatitude: 6.428,
    exactLongitude: 3.421,
    placeId: 'pl-01',
    documentPaths: Array.from({ length: docCount }, (_, i) => `doc-${i}`),
    createdAt: '2026-08-16T12:00:00.000Z',
    updatedAt: '2026-08-16T12:00:00.000Z',
  };

  const images: VehicleImageRecord[] = Array.from({ length: imageCount }, (_, i) => ({
    imageId: `img-${i}`,
    vehicleId: 'veh-01',
    ownerId,
    order: i,
    status: 'processed',
    width: 1920,
    height: 1080,
    originalUploadId: `upload-${i}`,
    variantPaths: { card: `path-${i}` },
    processing: {
      sourceFormat: 'jpeg',
      sourceByteSize: 1_200_000,
      sourceHadExif: false,
      sourceGps: 'absent',
      metadataStripped: true,
      variants: {
        card: {
          path: `path-${i}`,
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
  }));

  const tx: VehicleTransaction = {
    getOwnerProfile: async (id: string) => {
      if (id === 'owner-1') return { verificationStatus: isApproved ? 'approved' : 'draft' };
      if (id === ownerId && isApproved) return { verificationStatus: 'approved' };
      return null;
    },
    getVehicle: async (id: string) => (id === 'veh-01' ? sampleVehicle : null),
    getVehiclePrivate: async (id: string) => (id === 'veh-01' ? samplePrivate : null),
    getVehicleImages: async (id: string) => (id === 'veh-01' ? images : []),
    getVehicleRevision: async () => null,
    getIdempotency: async (documentId: string) => idempotencyStore.get(documentId) ?? null,
    setVehicle: () => {},
    setVehiclePrivate: () => {},
    setVehicleImage: () => {},
    setVehicleRevision: () => {},
    createAuditEvent: (event: VehicleAuditEvent) => { auditEvents.push(event); },
    saveIdempotency: (documentId: string, record: StoredVehicleIdempotency) => {
      idempotencyStore.set(documentId, record);
    },
  };

  const repository: VehicleRepository = {
    runTransaction: async <T>(work: (t: VehicleTransaction) => Promise<T>) => work(tx),
  };

  return { repository, writes: () => ({ auditEvents }) };
}

const validImageCommand = (idempotencyKey = 'key-img-upload-00001') => ({
  schemaVersion: 1 as const,
  idempotencyKey,
  data: {
    vehicleId: 'veh-01',
    purpose: 'listing_image' as const,
    contentType: 'image/jpeg' as const,
    byteSize: 2_500_000,
    originalFileName: 'front.jpg',
  },
});

const validDocCommand = (idempotencyKey = 'key-doc-upload-00001') => ({
  schemaVersion: 1 as const,
  idempotencyKey,
  data: {
    vehicleId: 'veh-01',
    purpose: 'vehicle_document' as const,
    contentType: 'application/pdf' as const,
    byteSize: 1_200_000,
    originalFileName: 'insurance.pdf',
    documentKind: 'insurance' as const,
  },
});

describe('createVehicleUploadSession service', () => {
  const now = new Date('2026-08-16T12:00:00Z');

  it('creates an upload session for a valid listing image', async () => {
    const { repository, writes } = mockRepository();

    const result = await createVehicleUploadSession(validImageCommand(), 'owner-1', {
      repository,
      now: () => now,
      createUploadId: () => 'upload-img-123',
    });

    expect(result.result.uploadId).toBe('upload-img-123');
    expect(result.result.purpose).toBe('listing_image');
    expect(result.result.storagePath).toBe('private/vehicle-uploads/owner-1/veh-01/upload-img-123');
    expect(result.result.maxBytes).toBe(10 * 1024 * 1024);

    const { auditEvents } = writes();
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].eventType).toBe('vehicle.upload_session_created');
  });

  it('creates an upload session for a valid vehicle document', async () => {
    const { repository } = mockRepository();

    const result = await createVehicleUploadSession(validDocCommand(), 'owner-1', {
      repository,
      now: () => now,
      createUploadId: () => 'upload-doc-456',
    });

    expect(result.result.uploadId).toBe('upload-doc-456');
    expect(result.result.purpose).toBe('vehicle_document');
    expect(result.result.storagePath).toBe('private/vehicle-documents/owner-1/veh-01/upload-doc-456');
  });

  it('rejects image session when maximum 20 images is reached', async () => {
    const { repository } = mockRepository({ imageCount: 20 });

    await expect(
      createVehicleUploadSession(validImageCommand(), 'owner-1', {
        repository,
        now: () => now,
        createUploadId: () => 'upload-21',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      safeDetails: { reason: 'image_limit' },
    });
  });

  it('rejects when caller does not own the vehicle', async () => {
    const { repository } = mockRepository({ vehicleOwnerId: 'different-owner' });

    await expect(
      createVehicleUploadSession(validImageCommand(), 'owner-1', {
        repository,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      safeDetails: { reason: 'not_vehicle_owner' },
    });
  });

  it('replays identical response for matching idempotency key', async () => {
    const { repository } = mockRepository();

    const first = await createVehicleUploadSession(validImageCommand('dup-idempotency-key-01'), 'owner-1', {
      repository,
      now: () => now,
      createUploadId: () => 'upload-fixed',
    });

    const replay = await createVehicleUploadSession(validImageCommand('dup-idempotency-key-01'), 'owner-1', {
      repository,
      now: () => now,
      createUploadId: () => 'upload-different',
    });

    expect(replay.result.uploadId).toBe(first.result.uploadId);
    expect(replay.result.storagePath).toBe(first.result.storagePath);
  });
});
