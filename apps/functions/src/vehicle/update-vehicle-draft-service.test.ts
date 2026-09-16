import { describe, expect, it } from 'vitest';

import { updateVehicleDraft } from './update-vehicle-draft-service.js';
import type {
  StoredVehicleIdempotency,
  VehicleAuditEvent,
  VehicleImageRecord,
  VehiclePrivateRecord,
  VehicleRecord,
  VehicleRepository,
  VehicleTransaction,
} from './vehicle-repository.js';

function image(status: VehicleImageRecord['status'] = 'rejected'): VehicleImageRecord {
  return {
    imageId: 'img-1',
    vehicleId: 'veh-1',
    ownerId: 'owner-1',
    order: 0,
    status,
    width: 1600,
    height: 900,
    originalUploadId: 'img-1',
    variantPaths: { card: 'private/card.jpg' },
    processing: {
      sourceFormat: 'jpeg',
      sourceByteSize: 1000,
      sourceHadExif: false,
      sourceGps: 'absent',
      metadataStripped: true,
      variants: {
        card: {
          path: 'private/card.jpg',
          width: 800,
          height: 450,
          byteSize: 500,
          contentType: 'image/jpeg',
        },
      },
    },
    publicVariantPaths: null,
    promotedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function setup(options?: {
  ownerId?: string;
  verificationStatus?: string;
  moderationStatus?: VehicleRecord['moderationStatus'];
  version?: number;
  images?: VehicleImageRecord[];
}) {
  let vehicle: VehicleRecord = {
    vehicleId: 'veh-1',
    ownerId: options?.ownerId ?? 'owner-1',
    displayName: 'Toyota Prado 2024',
    make: 'Toyota',
    model: 'Prado',
    year: 2024,
    colour: 'Black',
    category: 'executive_suv',
    seats: 7,
    transmission: 'automatic',
    fuelType: 'petrol',
    mileageKm: null,
    description: 'A premium chauffeur-ready SUV for executive Lagos journeys and airport transfers.',
    features: ['leather'],
    ownerDailyRateKobo: 150_000_00,
    chauffeurPolicy: 'included',
    deliveryPolicy: 'included',
    areaLabel: 'Ikoyi',
    approxLatitude: null,
    approxLongitude: null,
    moderationStatus: options?.moderationStatus ?? 'rejected',
    visibility: 'paused',
    discoverable: false,
    lastDecisionReason: 'Please correct the listing details.',
    pendingRevisionId: null,
    imageCount: 1,
    primaryImagePath: 'private/card.jpg',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    version: options?.version ?? 3,
  };
  let privateRecord: VehiclePrivateRecord = {
    vehicleId: 'veh-1',
    ownerId: vehicle.ownerId,
    plate: 'ABC-123XY',
    baseAddress: { line1: '1 Old Road', city: 'Lagos', country: 'NG', areaLabel: 'Ikoyi' },
    exactLatitude: null,
    exactLongitude: null,
    placeId: null,
    documentPaths: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
  let images = options?.images ?? [image()];
  const audits: VehicleAuditEvent[] = [];
  const idempotency = new Map<string, StoredVehicleIdempotency>();

  const tx: VehicleTransaction = {
    getOwnerProfile: async () => ({ verificationStatus: options?.verificationStatus ?? 'approved' }),
    getVehicle: async () => vehicle,
    getVehiclePrivate: async () => privateRecord,
    getVehicleImages: async () => images,
    getVehicleRevision: async () => null,
    getIdempotency: async (id) => idempotency.get(id) ?? null,
    setVehicle: (_id, record) => { vehicle = record; },
    setVehiclePrivate: (_id, record) => { privateRecord = record; },
    setVehicleImage: (_vehicleId, imageId, record) => {
      images = [...images.filter((candidate) => candidate.imageId !== imageId), record];
    },
    setVehicleRevision: () => {},
    createAuditEvent: (event) => { audits.push(event); },
    saveIdempotency: (id, record) => { idempotency.set(id, record); },
  };

  const repository: VehicleRepository = {
    runTransaction: async <T>(work: (transaction: VehicleTransaction) => Promise<T>) => work(tx),
  };

  return {
    repository,
    state: () => ({ vehicle, privateRecord, images, audits }),
  };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    idempotencyKey: 'update-vehicle-draft-key-01',
    data: {
      vehicleId: 'veh-1',
      expectedVersion: 3,
      specs: {
        make: 'Lexus',
        model: 'LX 600',
        year: 2025,
        colour: 'Pearl White',
        category: 'executive_suv',
        seats: 7,
        transmission: 'automatic',
        fuelType: 'petrol',
        description: 'A refined executive SUV prepared for chauffeur-led business and leisure journeys across Lagos.',
        features: ['leather', 'wifi'],
      },
      ownerDailyRateKobo: 200_000_00,
      areaLabel: 'Victoria Island',
      baseAddress: {
        line1: '12 Marina Road',
        areaLabel: 'Victoria Island',
        city: 'Lagos',
        country: 'NG',
      },
      plate: 'AAA-123BB',
      reuseRejectedImages: true,
      ...overrides,
    },
  };
}

describe('updateVehicleDraft', () => {
  const now = new Date('2026-09-15T12:00:00.000Z');

  it('updates an owner rejected listing in place and can reuse previously moderated images', async () => {
    const { repository, state } = setup();
    const result = await updateVehicleDraft(command(), 'owner-1', {
      repository,
      now: () => now,
      createRequestId: () => 'req-update-1',
    });

    expect(result.result).toMatchObject({
      vehicleId: 'veh-1',
      moderationStatus: 'rejected',
      version: 4,
      imageCount: 1,
    });
    expect(state().vehicle).toMatchObject({
      vehicleId: 'veh-1',
      displayName: 'Lexus LX 600 2025',
      ownerDailyRateKobo: 200_000_00,
      areaLabel: 'Victoria Island',
      version: 4,
      visibility: 'paused',
      discoverable: false,
    });
    expect(state().privateRecord.plate).toBe('AAA-123BB');
    expect(state().images[0]?.status).toBe('processed');
    expect(state().vehicle.primaryImagePath).toBe('private/card.jpg');
    expect(state().audits[0]?.eventType).toBe('vehicle.draft_updated');
  });

  it('keeps rejected images excluded when the owner is replacing photos', async () => {
    const { repository, state } = setup();
    const result = await updateVehicleDraft(
      command({ reuseRejectedImages: false }),
      'owner-1',
      { repository, now: () => now },
    );

    expect(result.result.imageCount).toBe(0);
    expect(state().vehicle.imageCount).toBe(0);
    expect(state().vehicle.primaryImagePath).toBeNull();
    expect(state().images[0]?.status).toBe('rejected');
  });

  it('fails closed for stale, non-owner, unapproved, and non-editable updates', async () => {
    const stale = setup({ version: 4 });
    await expect(updateVehicleDraft(command(), 'owner-1', { repository: stale.repository }))
      .rejects.toMatchObject({ code: 'FAILED_PRECONDITION', safeDetails: { reason: 'stale_version' } });

    const otherOwner = setup({ ownerId: 'owner-2' });
    await expect(updateVehicleDraft(command(), 'owner-1', { repository: otherOwner.repository }))
      .rejects.toMatchObject({ code: 'FORBIDDEN', safeDetails: { reason: 'not_vehicle_owner' } });

    const unapproved = setup({ verificationStatus: 'draft' });
    await expect(updateVehicleDraft(command(), 'owner-1', { repository: unapproved.repository }))
      .rejects.toMatchObject({ code: 'FORBIDDEN', safeDetails: { reason: 'not_approved_owner' } });

    const pending = setup({ moderationStatus: 'pending_review' });
    await expect(updateVehicleDraft(command(), 'owner-1', { repository: pending.repository }))
      .rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });
  });

  it('replays the same idempotent update without applying it twice', async () => {
    const { repository, state } = setup();
    const first = await updateVehicleDraft(command(), 'owner-1', { repository, now: () => now });
    const second = await updateVehicleDraft(command(), 'owner-1', { repository, now: () => now });

    expect(second).toEqual(first);
    expect(state().vehicle.version).toBe(4);
    expect(state().audits).toHaveLength(1);
  });
});
