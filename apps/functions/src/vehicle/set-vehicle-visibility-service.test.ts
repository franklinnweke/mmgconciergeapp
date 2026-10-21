import { describe, expect, it, vi } from 'vitest';

import { publicVariantPath } from './image-processing.js';
import { setVehicleVisibility } from './set-vehicle-visibility-service.js';
import {
  seededVariantObjects,
  seededVehicleRepository,
  vehicleImageFixture,
} from './vehicle-repository-fake.js';
import {
  InMemoryVehicleStorageGateway,
  PUBLIC_VARIANT_CACHE_CONTROL,
} from './vehicle-storage-gateway.js';

const now = new Date('2026-08-16T12:00:00Z');

function activateCommand(idempotencyKey: string, visibility: 'active' | 'paused' | 'deleted') {
  return {
    schemaVersion: 1 as const,
    idempotencyKey,
    data: { vehicleId: 'veh-01', expectedVersion: 1, visibility },
  };
}

/** An image whose bytes are already in the public prefix. */
function promotedImageFixture() {
  const image = vehicleImageFixture({ status: 'approved' });
  return {
    ...image,
    publicVariantPaths: Object.fromEntries(
      Object.keys(image.variantPaths).map((variant) => [
        variant,
        publicVariantPath('veh-01', image.imageId, variant as 'thumb' | 'card' | 'detail'),
      ]),
    ),
    promotedAt: '2026-08-15T09:00:00.000Z',
  };
}

describe('setVehicleVisibility service', () => {
  it('repairs an approved area-only listing during activation', async () => {
    const image = vehicleImageFixture({ status: 'approved' });
    const repository = seededVehicleRepository({ moderationStatus: 'approved', images: [image] });
    repository.vehicles.set('veh-01', { ...repository.vehicle(), approxLatitude: null, approxLongitude: null });
    await setVehicleVisibility(activateCommand('activate-area-only', 'active'), 'owner-1', {
      repository, storageGateway: new InMemoryVehicleStorageGateway(seededVariantObjects([image])),
    });
    expect(repository.vehicle()).toMatchObject({ approxLatitude: 6.43, approxLongitude: 3.42, discoverable: true });
  });

  it.each([
    { approxLatitude: 6.43, approxLongitude: null },
    { approxLatitude: null, approxLongitude: null, areaLabel: null },
    { ownerDailyRateKobo: 1 },
  ])('refuses activation of an invalid discovery record with no partial effects', async (overrides) => {
    const repository = seededVehicleRepository({ moderationStatus: 'approved' });
    repository.vehicles.set('veh-01', { ...repository.vehicle(), ...overrides });
    const storageGateway = new InMemoryVehicleStorageGateway();
    await expect(setVehicleVisibility(activateCommand('activate-invalid-location', 'active'), 'owner-1', { repository, storageGateway }))
      .rejects.toMatchObject({ code: 'FAILED_PRECONDITION', safeDetails: { reason: 'listing_incomplete' } });
    expect(repository.vehicle().visibility).toBe('paused');
    expect(repository.vehicleWrites).toHaveLength(0);
    expect(repository.auditEvents).toHaveLength(0);
    expect(storageGateway.objects.size).toBe(0);
  });

  it('publishes an approved listing’s images when the owner activates it', async () => {
    const image = vehicleImageFixture({ status: 'approved' });
    const repository = seededVehicleRepository({
      moderationStatus: 'approved',
      visibility: 'paused',
      images: [image],
    });
    const storageGateway = new InMemoryVehicleStorageGateway(seededVariantObjects([image]));

    const result = await setVehicleVisibility(
      activateCommand('key-set-vis-active', 'active'),
      'owner-1',
      { repository, storageGateway, now: () => now },
    );

    expect(result.result.visibility).toBe('active');
    expect(result.result.discoverable).toBe(true);
    expect(result.result.version).toBe(2);

    // Every variant reached the public prefix, and the record names all three.
    for (const variant of ['thumb', 'card', 'detail'] as const) {
      const path = publicVariantPath('veh-01', 'img-01', variant);
      expect(storageGateway.objects.has(path)).toBe(true);
      expect(repository.image('img-01').publicVariantPaths?.[variant]).toBe(path);
    }
    expect(repository.image('img-01').promotedAt).toBe(now.toISOString());
    expect(repository.vehicle().discoverable).toBe(true);
    expect(repository.auditEventTypes()).toEqual([
      'vehicle.visibility_changed',
      'vehicle.images_published',
    ]);
  });

  it('never carries the owner’s identity onto a public photo', async () => {
    const image = vehicleImageFixture({ status: 'approved' });
    const repository = seededVehicleRepository({
      moderationStatus: 'approved',
      visibility: 'paused',
      images: [image],
    });
    const storageGateway = new InMemoryVehicleStorageGateway(seededVariantObjects([image]));

    // The private source deliberately carries ownerId, as the writer does.
    expect(storageGateway.objects.get(image.variantPaths.card!)?.metadata?.ownerId).toBe('owner-1');

    await setVehicleVisibility(activateCommand('key-set-vis-meta', 'active'), 'owner-1', {
      repository,
      storageGateway,
      now: () => now,
    });

    const published = storageGateway.objects.get(publicVariantPath('veh-01', 'img-01', 'card'));
    expect(published?.metadata).toEqual({});
    expect(published?.cacheControl).toBe(PUBLIC_VARIANT_CACHE_CONTROL);
    expect(published?.contentType).toBe('image/jpeg');
    expect(JSON.stringify([...storageGateway.objects].filter(([path]) => path.startsWith('public/')))).not.toContain('owner-1');
  });

  it('withholds discovery from an approved listing with no images to serve', async () => {
    const repository = seededVehicleRepository({
      moderationStatus: 'approved',
      visibility: 'paused',
      images: [],
    });
    const storageGateway = new InMemoryVehicleStorageGateway();

    const result = await setVehicleVisibility(
      activateCommand('key-set-vis-empty', 'active'),
      'owner-1',
      { repository, storageGateway, now: () => now },
    );

    // The owner's listing is active — there is simply nothing a renter could load.
    expect(result.result.visibility).toBe('active');
    expect(repository.vehicle().visibility).toBe('active');
    expect(repository.vehicle().discoverable).toBe(false);
    expect(storageGateway.objects.size).toBe(0);
    expect(repository.auditEventTypes()).toEqual(['vehicle.visibility_changed']);
  });

  it('stops serving photos when the owner pauses the listing', async () => {
    const image = promotedImageFixture();
    const repository = seededVehicleRepository({
      moderationStatus: 'approved',
      visibility: 'active',
      discoverable: true,
      images: [image],
    });
    const storageGateway = new InMemoryVehicleStorageGateway({
      ...seededVariantObjects([image]),
      ...Object.fromEntries(
        Object.values(image.publicVariantPaths!).map((path) => [
          path,
          { bytes: Buffer.from('public'), contentType: 'image/jpeg', metadata: {} },
        ]),
      ),
    });

    await setVehicleVisibility(activateCommand('key-set-vis-pause', 'paused'), 'owner-1', {
      repository,
      storageGateway,
      now: () => now,
    });

    for (const path of Object.values(image.publicVariantPaths!)) {
      expect(storageGateway.objects.has(path)).toBe(false);
      expect(storageGateway.deleted).toContain(path);
    }
    expect(repository.image('img-01').publicVariantPaths).toBeNull();
    expect(repository.image('img-01').promotedAt).toBeNull();
    expect(repository.vehicle().discoverable).toBe(false);
  });

  it('rejects activation of unapproved vehicle', async () => {
    const repository = seededVehicleRepository({
      moderationStatus: 'draft',
      visibility: 'paused',
    });

    await expect(
      setVehicleVisibility(activateCommand('key-set-vis-draft', 'active'), 'owner-1', {
        repository,
        storageGateway: new InMemoryVehicleStorageGateway(),
        now: () => now,
      }),
    ).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });
  });

  it('tombstones the private document and unpublishes when the vehicle is deleted', async () => {
    const image = promotedImageFixture();
    const repository = seededVehicleRepository({
      moderationStatus: 'approved',
      visibility: 'active',
      discoverable: true,
      images: [image],
    });
    const storageGateway = new InMemoryVehicleStorageGateway(
      Object.fromEntries(
        Object.values(image.publicVariantPaths!).map((path) => [
          path,
          { bytes: Buffer.from('public'), contentType: 'image/jpeg', metadata: {} },
        ]),
      ),
    );

    const result = await setVehicleVisibility(
      activateCommand('key-set-vis-delete', 'deleted'),
      'owner-1',
      { repository, storageGateway, now: () => now },
    );

    expect(result.result.visibility).toBe('deleted');
    expect(result.result.discoverable).toBe(false);

    const privateDoc = repository.privateDocs.get('veh-01')!;
    expect(privateDoc.plate).toBeNull();
    expect(privateDoc.exactLatitude).toBeNull();
    expect(privateDoc.documentPaths).toEqual([]);
    expect(storageGateway.objects.size).toBe(0);
    expect(repository.image('img-01').publicVariantPaths).toBeNull();
  });

  it('keeps the listing undiscoverable when the copy fails', async () => {
    const image = vehicleImageFixture({ status: 'approved' });
    const repository = seededVehicleRepository({
      moderationStatus: 'approved',
      visibility: 'paused',
      images: [image],
    });
    // Empty bucket: the source variants are missing, so every copy throws.
    const storageGateway = new InMemoryVehicleStorageGateway();
    const onPromotionFailure = vi.fn();

    const result = await setVehicleVisibility(
      activateCommand('key-set-vis-copy-fail', 'active'),
      'owner-1',
      { repository, storageGateway, now: () => now, onPromotionFailure },
    );

    // The owner's change is not reported as failed — it committed.
    expect(result.result.visibility).toBe('active');
    expect(onPromotionFailure).toHaveBeenCalledOnce();
    expect(repository.vehicle().visibility).toBe('active');
    expect(repository.vehicle().discoverable).toBe(false);
    expect(repository.image('img-01').publicVariantPaths).toBeNull();
    expect(repository.auditEventTypes()).toEqual([
      'vehicle.visibility_changed',
      'vehicle.publication_incomplete',
    ]);
  });

  it('claims no public path when the publication write fails after the copy', async () => {
    const image = vehicleImageFixture({ status: 'approved' });
    const repository = seededVehicleRepository({
      moderationStatus: 'approved',
      visibility: 'paused',
      images: [image],
    });
    const storageGateway = new InMemoryVehicleStorageGateway(seededVariantObjects([image]));
    const onPromotionFailure = vi.fn();

    // Transaction 1 is the visibility change; 2 is the one that would stamp paths.
    repository.failTransaction = 2;

    await setVehicleVisibility(activateCommand('key-set-vis-tx-fail', 'active'), 'owner-1', {
      repository,
      storageGateway,
      now: () => now,
      onPromotionFailure,
    });

    expect(onPromotionFailure).toHaveBeenCalledOnce();
    // The bytes are public but nothing references them, which is the accepted
    // worst case: unreachable rather than a record naming a missing object.
    expect(storageGateway.objects.has(publicVariantPath('veh-01', 'img-01', 'card'))).toBe(true);
    expect(repository.image('img-01').publicVariantPaths).toBeNull();
    expect(repository.vehicle().discoverable).toBe(false);
    expect(repository.auditEventTypes()).toContain('vehicle.publication_incomplete');
  });

  it('replays without republishing', async () => {
    const image = vehicleImageFixture({ status: 'approved' });
    const repository = seededVehicleRepository({
      moderationStatus: 'approved',
      visibility: 'paused',
      images: [image],
    });
    const storageGateway = new InMemoryVehicleStorageGateway(seededVariantObjects([image]));

    const first = await setVehicleVisibility(
      activateCommand('key-set-vis-replay', 'active'),
      'owner-1',
      { repository, storageGateway, now: () => now },
    );

    const transactionsAfterFirst = repository.transactionCount;
    const second = await setVehicleVisibility(
      activateCommand('key-set-vis-replay', 'active'),
      'owner-1',
      { repository, storageGateway, now: () => now },
    );

    expect(second).toEqual(first);
    // One transaction to read the idempotency record, and no publication pass.
    expect(repository.transactionCount).toBe(transactionsAfterFirst + 1);
    expect(repository.auditEventTypes()).toEqual([
      'vehicle.visibility_changed',
      'vehicle.images_published',
    ]);
  });
});
