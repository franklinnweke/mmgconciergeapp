import type {
  VehicleImageVariant,
  VehicleModerationStatus,
  VehicleVisibility,
} from '@mmg/contracts';

import { privateVariantPath, publicVariantPath } from './image-processing.js';
import type {
  StoredVehicleIdempotency,
  VehicleAdminAuditLog,
  VehicleAuditEvent,
  VehicleImageRecord,
  VehiclePrivateRecord,
  VehicleRecord,
  VehicleRepository,
  VehicleRevisionRecord,
  VehicleTransaction,
} from './vehicle-repository.js';

/**
 * A stateful in-memory `VehicleRepository` for service tests.
 *
 * Stateful rather than a write recorder, because publication runs a *second*
 * transaction that re-reads the vehicle and its images. A fake whose writes only
 * appended to an array would serve the pre-decision record to that read, and the
 * supersede check would abandon publication every time — a green test proving
 * nothing. Writes therefore mutate the store, exactly as Firestore would, while
 * `vehicleWrites` / `imageWrites` keep the ordered history a test needs to assert
 * *when* a field was set.
 */
export class InMemoryVehicleRepository implements VehicleRepository {
  readonly vehicles = new Map<string, VehicleRecord>();
  readonly privateDocs = new Map<string, VehiclePrivateRecord>();
  readonly revisions = new Map<string, VehicleRevisionRecord>();
  /** Keyed `${vehicleId}/${imageId}`. */
  readonly images = new Map<string, VehicleImageRecord>();
  readonly idempotency = new Map<string, StoredVehicleIdempotency>();

  readonly vehicleWrites: VehicleRecord[] = [];
  readonly imageWrites: VehicleImageRecord[] = [];
  readonly privateWrites: VehiclePrivateRecord[] = [];
  readonly auditEvents: VehicleAuditEvent[] = [];
  readonly adminLogs: VehicleAdminAuditLog[] = [];

  /** How many transactions have been opened. */
  transactionCount = 0;

  /**
   * 1-based index of a transaction that should fail, or null.
   *
   * Publication's own transaction is the one worth failing on purpose: it is the
   * step that records where the bytes landed, and its failure is the difference
   * between "unpublished" and "published but unrecorded".
   */
  failTransaction: number | null = null;

  /**
   * Called as each transaction opens, with its 1-based index.
   *
   * The only way to simulate a concurrent change landing between a decision and
   * its publication, which is the case the supersede check exists for.
   */
  beforeTransaction: ((index: number) => void) | null = null;

  async runTransaction<T>(work: (transaction: VehicleTransaction) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    this.beforeTransaction?.(this.transactionCount);
    if (this.failTransaction === this.transactionCount) {
      throw new Error(`InMemoryVehicleRepository: transaction ${this.transactionCount} failed.`);
    }

    const transaction: VehicleTransaction = {
      getOwnerProfile: async (ownerId: string) => this.ownerProfiles.get(ownerId) ?? null,
      getVehicle: async (vehicleId: string) => this.vehicles.get(vehicleId) ?? null,
      getVehiclePrivate: async (vehicleId: string) => this.privateDocs.get(vehicleId) ?? null,
      getVehicleImages: async (vehicleId: string) =>
        [...this.images.values()]
          .filter((image) => image.vehicleId === vehicleId)
          .sort((a, b) => a.order - b.order),
      getVehicleRevision: async (revisionId: string) => this.revisions.get(revisionId) ?? null,
      getIdempotency: async (documentId: string) => this.idempotency.get(documentId) ?? null,

      setVehicle: (vehicleId: string, record: VehicleRecord) => {
        this.vehicles.set(vehicleId, record);
        this.vehicleWrites.push(record);
      },
      setVehiclePrivate: (vehicleId: string, record: VehiclePrivateRecord) => {
        this.privateDocs.set(vehicleId, record);
        this.privateWrites.push(record);
      },
      setVehicleImage: (vehicleId: string, imageId: string, record: VehicleImageRecord) => {
        this.images.set(`${vehicleId}/${imageId}`, record);
        this.imageWrites.push(record);
      },
      setVehicleRevision: (revisionId: string, record: VehicleRevisionRecord) => {
        this.revisions.set(revisionId, record);
      },

      createAuditEvent: (event: VehicleAuditEvent) => {
        this.auditEvents.push(event);
      },
      createAdminAuditLog: (record: VehicleAdminAuditLog) => {
        this.adminLogs.push(record);
      },
      saveIdempotency: (documentId: string, record: StoredVehicleIdempotency) => {
        this.idempotency.set(documentId, record);
      },
    };

    return work(transaction);
  }

  readonly ownerProfiles = new Map<string, { verificationStatus: string }>();

  /** The record as it stands now, after every write. */
  vehicle(vehicleId = 'veh-01'): VehicleRecord {
    const record = this.vehicles.get(vehicleId);
    if (!record) throw new Error(`No vehicle '${vehicleId}' in the fake repository.`);
    return record;
  }

  image(imageId: string, vehicleId = 'veh-01'): VehicleImageRecord {
    const record = this.images.get(`${vehicleId}/${imageId}`);
    if (!record) throw new Error(`No image '${imageId}' in the fake repository.`);
    return record;
  }

  auditEventTypes(): string[] {
    return this.auditEvents.map((event) => event.eventType);
  }
}

const FIXTURE_CREATED_AT = '2026-08-16T12:00:00.000Z';

export function vehicleFixture(overrides: Partial<VehicleRecord> = {}): VehicleRecord {
  return {
    vehicleId: 'veh-01',
    ownerId: 'owner-1',
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
    moderationStatus: 'pending_review',
    visibility: 'paused',
    discoverable: false,
    lastDecisionReason: null,
    pendingRevisionId: null,
    imageCount: 1,
    primaryImagePath: privateVariantPath('owner-1', 'veh-01', 'img-01', 'card'),
    createdAt: FIXTURE_CREATED_AT,
    updatedAt: FIXTURE_CREATED_AT,
    version: 1,
    ...overrides,
  };
}

export function vehiclePrivateFixture(
  overrides: Partial<VehiclePrivateRecord> = {},
): VehiclePrivateRecord {
  return {
    vehicleId: 'veh-01',
    ownerId: 'owner-1',
    plate: 'AAA123AA',
    baseAddress: { line1: '12 Marina Road', city: 'Lagos' },
    exactLatitude: 6.428,
    exactLongitude: 3.421,
    placeId: 'pl-01',
    documentPaths: ['private/vehicle-uploads/owner-1/veh-01/doc-1'],
    createdAt: FIXTURE_CREATED_AT,
    updatedAt: FIXTURE_CREATED_AT,
    ...overrides,
  };
}

/**
 * An image record with real variant paths.
 *
 * The paths come from `privateVariantPath` rather than being invented, so a test
 * that asserts what was copied is asserting against the scheme the writer
 * actually uses.
 */
export function vehicleImageFixture(
  overrides: Partial<VehicleImageRecord> = {},
): VehicleImageRecord {
  const imageId = overrides.imageId ?? 'img-01';
  const ownerId = overrides.ownerId ?? 'owner-1';
  const vehicleId = overrides.vehicleId ?? 'veh-01';

  const variants = ['thumb', 'card', 'detail'] as const;
  const variantPaths = Object.fromEntries(
    variants.map((variant) => [variant, privateVariantPath(ownerId, vehicleId, imageId, variant)]),
  );

  return {
    imageId,
    vehicleId,
    ownerId,
    order: 0,
    status: 'processed',
    width: 1920,
    height: 1080,
    originalUploadId: 'upload-01',
    variantPaths,
    processing: {
      sourceFormat: 'jpeg',
      sourceByteSize: 1_200_000,
      sourceHadExif: true,
      sourceGps: 'present',
      metadataStripped: true,
      variants: {
        thumb: {
          path: variantPaths.thumb!,
          width: 320,
          height: 180,
          byteSize: 20_000,
          contentType: 'image/jpeg',
        },
        card: {
          path: variantPaths.card!,
          width: 800,
          height: 450,
          byteSize: 90_000,
          contentType: 'image/jpeg',
        },
        detail: {
          path: variantPaths.detail!,
          width: 1600,
          height: 900,
          byteSize: 240_000,
          contentType: 'image/jpeg',
        },
      },
    },
    publicVariantPaths: null,
    promotedAt: null,
    createdAt: FIXTURE_CREATED_AT,
    updatedAt: FIXTURE_CREATED_AT,
    ...overrides,
  };
}

/**
 * An image whose bytes are already in the public prefix.
 *
 * The public paths come from `publicVariantPath`, so a demotion test deletes the
 * paths the promoter would actually have written.
 */
export function promotedVehicleImageFixture(
  overrides: Partial<VehicleImageRecord> = {},
): VehicleImageRecord {
  const image = vehicleImageFixture({ status: 'approved', ...overrides });
  return {
    ...image,
    publicVariantPaths: Object.fromEntries(
      Object.keys(image.variantPaths).map((variant) => [
        variant,
        publicVariantPath(image.vehicleId, image.imageId, variant as VehicleImageVariant),
      ]),
    ),
    promotedAt: '2026-08-15T09:00:00.000Z',
    ...overrides,
  };
}

/**
 * A repository seeded with one owner, one vehicle, and its images.
 *
 * `imageCount` and `primaryImagePath` are derived from the images actually
 * seeded. A fixture claiming `imageCount: 1` while serving no images is how the
 * "approved with nothing to show" case stayed invisible.
 */
export function seededVehicleRepository(options?: {
  moderationStatus?: VehicleModerationStatus;
  visibility?: VehicleVisibility;
  discoverable?: boolean;
  images?: VehicleImageRecord[];
  ownerVerificationStatus?: string;
}): InMemoryVehicleRepository {
  const repository = new InMemoryVehicleRepository();
  const images = options?.images ?? [vehicleImageFixture()];

  repository.ownerProfiles.set('owner-1', {
    verificationStatus: options?.ownerVerificationStatus ?? 'approved',
  });

  repository.vehicles.set(
    'veh-01',
    vehicleFixture({
      moderationStatus: options?.moderationStatus ?? 'pending_review',
      visibility: options?.visibility ?? 'paused',
      discoverable: options?.discoverable ?? false,
      imageCount: images.length,
      primaryImagePath: images[0]?.variantPaths.card ?? null,
    }),
  );
  repository.privateDocs.set('veh-01', vehiclePrivateFixture());

  for (const image of images) {
    repository.images.set(`${image.vehicleId}/${image.imageId}`, image);
  }

  return repository;
}

/**
 * Seed objects for `InMemoryVehicleStorageGateway` matching an image's variants.
 *
 * The custom metadata mirrors what `finalize-vehicle-image-service` actually
 * writes — `ownerId` included. That is the point: a promotion test can then prove
 * the copy replaced it rather than assume the source had nothing to leak.
 */
export function seededVariantObjects(
  images: VehicleImageRecord[],
): Record<string, { bytes: Buffer; contentType: string; metadata: Record<string, string> }> {
  const objects: Record<
    string,
    { bytes: Buffer; contentType: string; metadata: Record<string, string> }
  > = {};

  for (const image of images) {
    for (const [variant, path] of Object.entries(image.variantPaths)) {
      objects[path] = {
        bytes: Buffer.from(`bytes-${image.imageId}-${variant}`),
        contentType: image.processing.variants[variant]?.contentType ?? 'image/jpeg',
        metadata: {
          ownerId: image.ownerId,
          vehicleId: image.vehicleId,
          imageId: image.imageId,
          variant,
          purpose: 'vehicle-image-variant',
        },
      };
    }
  }

  return objects;
}

/**
 * Bucket seed for the public objects an already-promoted image claims.
 *
 * Public objects carry no custom metadata, matching what `promoteImage` writes —
 * a demotion test should not be able to pass against a public object that never
 * looked the way the promoter makes them.
 */
export function seededPublicObjects(
  images: VehicleImageRecord[],
): Record<string, { bytes: Buffer; contentType: string; metadata: Record<string, string> }> {
  const objects: Record<
    string,
    { bytes: Buffer; contentType: string; metadata: Record<string, string> }
  > = {};

  for (const image of images) {
    for (const [variant, path] of Object.entries(image.publicVariantPaths ?? {})) {
      objects[path] = {
        bytes: Buffer.from(`bytes-${image.imageId}-${variant}`),
        contentType: image.processing.variants[variant]?.contentType ?? 'image/jpeg',
        metadata: {},
      };
    }
  }

  return objects;
}
