import { MAX_UPLOAD_BYTES, MIN_IMAGE_HEIGHT, MIN_IMAGE_WIDTH } from '@mmg/contracts';
import { describe, expect, it } from 'vitest';

import { finalizeVehicleImage } from './finalize-vehicle-image-service.js';
import {
  privateVariantPath,
  sourceUploadPath,
  VEHICLE_VARIANT_SPECS,
  type ImageProcessor,
  type InspectedImage,
  type RenderedVariant,
  type VariantSpec,
} from './image-processing.js';
import type {
  StoredVehicleIdempotency,
  VehicleAuditEvent,
  VehicleImageRecord,
  VehicleRecord,
  VehicleRepository,
  VehicleTransaction,
} from './vehicle-repository.js';
import { InMemoryVehicleStorageGateway } from './vehicle-storage-gateway.js';

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const SOURCE_PATH = sourceUploadPath('owner-1', 'veh-01', 'upload-img-01');

/**
 * Deterministic stand-in for `SharpImageProcessor`. Decoding real bytes is the
 * adapter's job and is covered in `sharp-image-processor.test.ts`; these tests
 * are about what the service records, so the processor returns fixed facts and
 * counts its own calls.
 */
class FakeImageProcessor implements ImageProcessor {
  inspectCalls = 0;
  renderCalls: VariantSpec[] = [];

  constructor(
    private readonly inspected: InspectedImage = {
      format: 'jpeg',
      width: 3200,
      height: 2400,
      hasExif: true,
      gps: 'present',
    },
    private readonly options: { omitVariant?: string; failOnRender?: boolean } = {},
  ) {}

  async inspect(): Promise<InspectedImage> {
    this.inspectCalls += 1;
    return this.inspected;
  }

  async render(_bytes: Buffer, spec: VariantSpec): Promise<RenderedVariant> {
    this.renderCalls.push(spec);
    if (this.options.failOnRender) {
      throw new Error('libvips exploded');
    }
    // A processor that quietly returns a different variant than requested.
    const variant = this.options.omitVariant === spec.variant ? 'thumb' : spec.variant;
    const bytes = Buffer.alloc(1024, spec.maxEdge % 256);
    return {
      variant: variant as RenderedVariant['variant'],
      bytes,
      width: spec.maxEdge,
      height: Math.round((spec.maxEdge * 2400) / 3200),
      byteSize: bytes.byteLength,
      contentType: 'image/jpeg',
    };
  }
}

function makeImageRecord(overrides: Partial<VehicleImageRecord> & { imageId: string }): VehicleImageRecord {
  return {
    vehicleId: 'veh-01',
    ownerId: 'owner-1',
    order: 0,
    status: 'processed',
    width: 3200,
    height: 2400,
    originalUploadId: overrides.imageId,
    variantPaths: { card: `card/${overrides.imageId}` },
    processing: {
      sourceFormat: 'jpeg',
      sourceByteSize: 1_000,
      sourceHadExif: false,
      sourceGps: 'absent',
      metadataStripped: true,
      variants: {},
    },
    publicVariantPaths: null,
    promotedAt: null,
    createdAt: '2026-08-16T12:00:00.000Z',
    updatedAt: '2026-08-16T12:00:00.000Z',
    ...overrides,
  };
}

function mockRepository(options?: {
  vehicleOwnerId?: string;
  isApproved?: boolean;
  existingImages?: VehicleImageRecord[];
  vehicleOverrides?: Partial<VehicleRecord>;
}): {
  repository: VehicleRepository;
  transactionCount: () => number;
  writes: () => {
    vehicles: VehicleRecord[];
    images: VehicleImageRecord[];
    auditEvents: VehicleAuditEvent[];
  };
} {
  const writtenVehicles: VehicleRecord[] = [];
  const writtenImages: VehicleImageRecord[] = [];
  const auditEvents: VehicleAuditEvent[] = [];
  const idempotencyStore = new Map<string, StoredVehicleIdempotency>();
  const isApproved = options?.isApproved ?? true;
  const ownerId = options?.vehicleOwnerId ?? 'owner-1';
  const images = options?.existingImages ?? [];
  let transactions = 0;

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
    description: 'Executive vehicle in Victoria Island.',
    features: ['leather'],
    ownerDailyRateKobo: 150_000_00,
    chauffeurPolicy: 'included',
    deliveryPolicy: 'included',
    areaLabel: 'Victoria Island',
    approxLatitude: 6.43,
    approxLongitude: 3.42,
    moderationStatus: 'draft',
    visibility: 'paused',
    discoverable: false,
    lastDecisionReason: null,
    pendingRevisionId: null,
    imageCount: images.length,
    primaryImagePath: null,
    createdAt: '2026-08-16T12:00:00.000Z',
    updatedAt: '2026-08-16T12:00:00.000Z',
    version: 1,
    ...options?.vehicleOverrides,
  };

  const tx: VehicleTransaction = {
    // Always the acting owner's profile — the service looks up `actorUid`, never
    // the vehicle's owner.
    getOwnerProfile: async () => ({ verificationStatus: isApproved ? 'approved' : 'draft' }),
    getVehicle: async (id: string) => (id === 'veh-01' ? sampleVehicle : null),
    getVehiclePrivate: async () => null,
    getVehicleImages: async (id: string) => (id === 'veh-01' ? images : []),
    getVehicleRevision: async () => null,
    getIdempotency: async (documentId: string) => idempotencyStore.get(documentId) ?? null,
    setVehicle: (_id: string, record: VehicleRecord) => { writtenVehicles.push(record); },
    setVehiclePrivate: () => {},
    setVehicleImage: (_vid: string, _iid: string, record: VehicleImageRecord) => { writtenImages.push(record); },
    setVehicleRevision: () => {},
    createAuditEvent: (event: VehicleAuditEvent) => { auditEvents.push(event); },
    saveIdempotency: (documentId: string, record: StoredVehicleIdempotency) => {
      idempotencyStore.set(documentId, record);
    },
  };

  const repository: VehicleRepository = {
    runTransaction: async <T>(work: (t: VehicleTransaction) => Promise<T>) => {
      transactions += 1;
      return work(tx);
    },
  };

  return {
    repository,
    transactionCount: () => transactions,
    writes: () => ({ vehicles: writtenVehicles, images: writtenImages, auditEvents }),
  };
}

function seededStorage(
  bytes: Buffer = Buffer.concat([JPEG_MAGIC, Buffer.alloc(1_500_000 - JPEG_MAGIC.length)]),
  contentType = 'image/jpeg',
): InMemoryVehicleStorageGateway {
  return new InMemoryVehicleStorageGateway({
    [SOURCE_PATH]: { bytes, contentType, metadata: { ownerId: 'owner-1' } },
  });
}

const validCommand = (idempotencyKey = 'key-finalize-0000001', order = 0) => ({
  schemaVersion: 1 as const,
  idempotencyKey,
  data: { vehicleId: 'veh-01', uploadId: 'upload-img-01', order },
});

describe('finalizeVehicleImage service', () => {
  const now = new Date('2026-08-16T12:00:00Z');

  const deps = (
    storageGateway: InMemoryVehicleStorageGateway,
    repository: VehicleRepository,
    imageProcessor: ImageProcessor = new FakeImageProcessor(),
  ) => ({ repository, storageGateway, imageProcessor, now: () => now });

  it('finalizes a valid image upload', async () => {
    const { repository, writes } = mockRepository();
    const storage = seededStorage();

    const result = await finalizeVehicleImage(validCommand(), 'owner-1', deps(storage, repository));

    expect(result.result).toMatchObject({
      imageId: 'upload-img-01',
      status: 'processed',
      order: 0,
    });

    const { vehicles, images, auditEvents } = writes();
    expect(images).toHaveLength(1);
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].imageCount).toBe(1);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].eventType).toBe('vehicle.image_finalized');
  });

  it('reports the decoder-measured dimensions, not a placeholder', async () => {
    // The previous implementation hardcoded 1920×1080 in both the record and the
    // result regardless of the actual upload.
    const { repository, writes } = mockRepository();
    const processor = new FakeImageProcessor({
      format: 'png',
      width: 2048,
      height: 1536,
      hasExif: false,
      gps: 'absent',
    });

    const result = await finalizeVehicleImage(
      validCommand(),
      'owner-1',
      deps(seededStorage(), repository, processor),
    );

    expect(result.result).toMatchObject({ width: 2048, height: 1536 });
    expect(writes().images[0]).toMatchObject({ width: 2048, height: 1536 });
    expect(writes().images[0].processing.sourceFormat).toBe('png');
  });

  it('writes every variant object it records a path for', async () => {
    // The core of the fix: `variantPaths` used to name three objects that were
    // never created, so a listing pointed at photos that did not exist.
    const { repository, writes } = mockRepository();
    const storage = seededStorage();

    await finalizeVehicleImage(validCommand(), 'owner-1', deps(storage, repository));

    const record = writes().images[0];
    expect(Object.keys(record.variantPaths).sort()).toEqual(['card', 'detail', 'thumb']);

    for (const [variant, path] of Object.entries(record.variantPaths)) {
      expect(path).toBe(privateVariantPath('owner-1', 'veh-01', 'upload-img-01', variant as never));
      const object = storage.objects.get(path);
      expect(object, `${variant} object was never written`).toBeDefined();
      expect(object?.contentType).toBe('image/jpeg');
      expect(object?.bytes.byteLength).toBeGreaterThan(0);
    }
  });

  it('records the measured size of each variant it wrote', async () => {
    const { repository, writes } = mockRepository();
    const storage = seededStorage();

    await finalizeVehicleImage(validCommand(), 'owner-1', deps(storage, repository));

    const { variants } = writes().images[0].processing;
    for (const spec of VEHICLE_VARIANT_SPECS) {
      const variant = variants[spec.variant];
      expect(variant).toBeDefined();
      expect(variant.width).toBe(spec.maxEdge);
      expect(variant.byteSize).toBe(storage.objects.get(variant.path)?.bytes.byteLength);
    }
  });

  it('keeps the private variants out of any cacheable or public location', async () => {
    const { repository } = mockRepository();
    const storage = seededStorage();

    await finalizeVehicleImage(validCommand(), 'owner-1', deps(storage, repository));

    for (const [path, object] of storage.objects) {
      if (path === SOURCE_PATH) continue;
      expect(path.startsWith('private/'), `${path} is not private`).toBe(true);
      expect(object.cacheControl).toContain('no-store');
    }
  });

  it('records the privacy trail for the source image', async () => {
    const { repository, writes } = mockRepository();
    const processor = new FakeImageProcessor({
      format: 'jpeg',
      width: 4000,
      height: 3000,
      hasExif: true,
      gps: 'present',
    });

    await finalizeVehicleImage(
      validCommand(),
      'owner-1',
      deps(seededStorage(), repository, processor),
    );

    expect(writes().images[0].processing).toMatchObject({
      sourceHadExif: true,
      sourceGps: 'present',
      metadataStripped: true,
    });
    // Also in the append-only log, so the trail survives a record overwrite.
    expect(writes().auditEvents[0].details).toMatchObject({
      sourceHadExif: true,
      sourceGps: 'present',
      metadataStripped: true,
      variantsWritten: ['thumb', 'card', 'detail'],
    });
  });

  it('carries an unparseable GPS block through as unknown rather than absent', async () => {
    const { repository, writes } = mockRepository();
    const processor = new FakeImageProcessor({
      format: 'jpeg',
      width: 3200,
      height: 2400,
      hasExif: true,
      gps: 'unknown',
    });

    await finalizeVehicleImage(
      validCommand(),
      'owner-1',
      deps(seededStorage(), repository, processor),
    );

    expect(writes().images[0].processing.sourceGps).toBe('unknown');
  });

  it('leaves a newly processed image unpromoted', async () => {
    // Approval promotes; finalizing must not. Otherwise an unreviewed photo
    // would be world-readable the moment it was uploaded.
    const { repository, writes } = mockRepository();
    const storage = seededStorage();

    await finalizeVehicleImage(validCommand(), 'owner-1', deps(storage, repository));

    expect(writes().images[0]).toMatchObject({ publicVariantPaths: null, promotedAt: null });
    expect([...storage.objects.keys()].some((path) => path.startsWith('public/'))).toBe(false);
  });

  it('clears a previous promotion when an image is re-processed', async () => {
    const { repository, writes } = mockRepository({
      existingImages: [
        makeImageRecord({
          imageId: 'upload-img-01',
          status: 'approved',
          publicVariantPaths: { card: 'public/vehicles/veh-01/approved/upload-img-01/card' },
          promotedAt: '2026-08-10T00:00:00.000Z',
          createdAt: '2026-08-01T00:00:00.000Z',
        }),
      ],
    });

    await finalizeVehicleImage(validCommand(), 'owner-1', deps(seededStorage(), repository));

    const record = writes().images[0];
    // The bytes the public copy was made from no longer exist, so the record
    // must stop claiming a public copy — and drop back out of `approved`.
    expect(record.publicVariantPaths).toBeNull();
    expect(record.promotedAt).toBeNull();
    expect(record.status).toBe('processed');
    // Replacement, not creation: the original timestamp survives.
    expect(record.createdAt).toBe('2026-08-01T00:00:00.000Z');
    expect(writes().auditEvents[0].fromState).toBe('approved');
  });

  it('derives the primary image from the full ordered set', async () => {
    const { repository, writes } = mockRepository({
      existingImages: [
        makeImageRecord({ imageId: 'img-a', order: 1, variantPaths: { card: 'card/img-a' } }),
        makeImageRecord({ imageId: 'img-b', order: 2, variantPaths: { card: 'card/img-b' } }),
      ],
    });

    // The new image claims slot 0, so it becomes primary.
    await finalizeVehicleImage(validCommand('key-a-0000000001', 0), 'owner-1', deps(seededStorage(), repository));

    expect(writes().vehicles[0].primaryImagePath).toBe(
      privateVariantPath('owner-1', 'veh-01', 'upload-img-01', 'card'),
    );
    expect(writes().vehicles[0].imageCount).toBe(3);
  });

  it('does not make a late-ordered upload the primary image', async () => {
    // The old rule was `order === 0 || primaryImagePath === null`, which made any
    // upload primary whenever the vehicle had no primary yet — even one the owner
    // had explicitly placed last.
    const { repository, writes } = mockRepository({
      existingImages: [
        makeImageRecord({ imageId: 'img-a', order: 0, variantPaths: { card: 'card/img-a' } }),
      ],
      vehicleOverrides: { primaryImagePath: null },
    });

    await finalizeVehicleImage(validCommand('key-b-0000000001', 9), 'owner-1', deps(seededStorage(), repository));

    expect(writes().vehicles[0].primaryImagePath).toBe('card/img-a');
  });

  it('rejects an image below the minimum listing dimensions', async () => {
    const { repository, writes } = mockRepository();
    const storage = seededStorage();
    const processor = new FakeImageProcessor({
      format: 'jpeg',
      width: MIN_IMAGE_WIDTH - 1,
      height: MIN_IMAGE_HEIGHT,
      hasExif: false,
      gps: 'absent',
    });

    await expect(
      finalizeVehicleImage(validCommand(), 'owner-1', deps(storage, repository, processor)),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      safeDetails: { reason: 'image_dimensions' },
    });

    expect(processor.renderCalls).toEqual([]);
    expect(writes().images).toEqual([]);
    expect([...storage.objects.keys()]).toEqual([SOURCE_PATH]);
  });

  it('fails rather than recording a partial set of variants', async () => {
    const { repository, writes } = mockRepository();
    const processor = new FakeImageProcessor(undefined, { omitVariant: 'detail' });

    await expect(
      finalizeVehicleImage(validCommand(), 'owner-1', deps(seededStorage(), repository, processor)),
    ).rejects.toMatchObject({ code: 'INTERNAL' });

    expect(writes().images).toEqual([]);
  });

  it('records nothing when rendering throws', async () => {
    const { repository, writes } = mockRepository();
    const storage = seededStorage();
    const processor = new FakeImageProcessor(undefined, { failOnRender: true });

    await expect(
      finalizeVehicleImage(validCommand(), 'owner-1', deps(storage, repository, processor)),
    ).rejects.toThrow('libvips exploded');

    expect(writes().images).toEqual([]);
    expect(writes().vehicles).toEqual([]);
    expect([...storage.objects.keys()]).toEqual([SOURCE_PATH]);
  });

  it('rejects if upload does not exist in storage', async () => {
    const { repository } = mockRepository();

    await expect(
      finalizeVehicleImage(
        validCommand(),
        'owner-1',
        deps(new InMemoryVehicleStorageGateway(), repository),
      ),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      safeDetails: { reason: 'upload_invalid' },
    });
  });

  it('rejects a PDF disguised by its declared content type', async () => {
    const { repository } = mockRepository();
    const storage = seededStorage(Buffer.from('%PDF-1.4 trailing content'), 'image/jpeg');

    await expect(
      finalizeVehicleImage(validCommand(), 'owner-1', deps(storage, repository)),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      safeDetails: { reason: 'upload_invalid' },
    });
  });

  it('rejects oversized bytes even when the metadata understated the size', async () => {
    const { repository, writes } = mockRepository();
    const processor = new FakeImageProcessor();

    // The object could be replaced between the metadata read and the download, so
    // the limit has to be re-applied to the bytes actually held. A gateway that
    // reports a stale, smaller size is exactly that race.
    class UnderstatingGateway extends InMemoryVehicleStorageGateway {
      override async getObjectMetadata(storagePath: string) {
        const metadata = await super.getObjectMetadata(storagePath);
        return metadata ? { ...metadata, size: 1_500_000 } : null;
      }
    }

    const storage = new UnderstatingGateway({
      [SOURCE_PATH]: {
        bytes: Buffer.concat([JPEG_MAGIC, Buffer.alloc(MAX_UPLOAD_BYTES)]),
        contentType: 'image/jpeg',
      },
    });

    await expect(
      finalizeVehicleImage(validCommand(), 'owner-1', deps(storage, repository, processor)),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      safeDetails: { reason: 'upload_invalid' },
    });

    // Rejected before anything was decoded or recorded.
    expect(processor.inspectCalls).toBe(0);
    expect(writes().images).toEqual([]);
  });

  it('rejects if user does not own the vehicle', async () => {
    const { repository } = mockRepository({ vehicleOwnerId: 'different-owner' });

    await expect(
      finalizeVehicleImage(validCommand(), 'owner-1', deps(seededStorage(), repository)),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      safeDetails: { reason: 'not_vehicle_owner' },
    });
  });

  it('rejects an owner whose verification is not approved', async () => {
    const { repository } = mockRepository({ isApproved: false });

    await expect(
      finalizeVehicleImage(validCommand(), 'owner-1', deps(seededStorage(), repository)),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      safeDetails: { reason: 'not_approved_owner' },
    });
  });

  it('replays without re-decoding or re-uploading', async () => {
    const { repository, writes } = mockRepository();
    const storage = seededStorage();
    const processor = new FakeImageProcessor();

    const first = await finalizeVehicleImage(
      validCommand(),
      'owner-1',
      deps(storage, repository, processor),
    );
    const objectsAfterFirst = new Set(storage.objects.keys());

    const replay = await finalizeVehicleImage(
      validCommand(),
      'owner-1',
      deps(storage, repository, processor),
    );

    expect(replay).toEqual(first);
    // Processing three variants is the expensive half of this command; a retry
    // from a flaky mobile connection must short circuit before it.
    expect(processor.renderCalls).toHaveLength(VEHICLE_VARIANT_SPECS.length);
    expect(new Set(storage.objects.keys())).toEqual(objectsAfterFirst);
    expect(writes().images).toHaveLength(1);
    expect(writes().auditEvents).toHaveLength(1);
  });

  it('rejects a reused idempotency key carrying different data', async () => {
    const { repository } = mockRepository();
    const storage = seededStorage();

    await finalizeVehicleImage(validCommand('key-shared-000001', 0), 'owner-1', deps(storage, repository));

    await expect(
      finalizeVehicleImage(validCommand('key-shared-000001', 4), 'owner-1', deps(storage, repository)),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('refuses to add an image to a deleted listing', async () => {
    const { repository, writes } = mockRepository({ vehicleOverrides: { visibility: 'deleted' } });

    await expect(
      finalizeVehicleImage(validCommand(), 'owner-1', deps(seededStorage(), repository)),
    ).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });

    expect(writes().images).toEqual([]);
  });

  it('enforces the image limit', async () => {
    const existingImages = Array.from({ length: 20 }, (_, index) =>
      makeImageRecord({ imageId: `img-${index}`, order: index }),
    );
    const { repository } = mockRepository({ existingImages });

    await expect(
      finalizeVehicleImage(validCommand(), 'owner-1', deps(seededStorage(), repository)),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      safeDetails: { reason: 'image_limit' },
    });
  });

  it('allows replacing an image when the vehicle is already at the limit', async () => {
    // Replacing photo 20 of 20 is not adding a 21st.
    const existingImages = [
      makeImageRecord({ imageId: 'upload-img-01', order: 0 }),
      ...Array.from({ length: 19 }, (_, index) =>
        makeImageRecord({ imageId: `img-${index}`, order: index + 1 }),
      ),
    ];
    const { repository, writes } = mockRepository({ existingImages });

    await finalizeVehicleImage(validCommand(), 'owner-1', deps(seededStorage(), repository));

    expect(writes().images).toHaveLength(1);
    expect(writes().vehicles[0].imageCount).toBe(20);
  });
});
