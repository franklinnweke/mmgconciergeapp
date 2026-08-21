import { describe, expect, it, vi } from 'vitest';

import {
  googleCloudStoragePublicUrl,
  toRenterVisibleVehicle,
  toRenterVisibleVehicles,
} from './renter-vehicle-view.js';
import {
  promotedVehicleImageFixture,
  vehicleFixture,
  vehicleImageFixture,
  vehiclePrivateFixture,
} from './vehicle-repository-fake.js';

const publicUrl = googleCloudStoragePublicUrl('mmg-test.appspot.com');

/** A listing in the only state a renter may see it in. */
function liveVehicle(overrides = {}) {
  return vehicleFixture({
    moderationStatus: 'approved',
    visibility: 'active',
    discoverable: true,
    ...overrides,
  });
}

describe('googleCloudStoragePublicUrl', () => {
  it('builds a Firebase Storage media URL for the bucket', () => {
    expect(publicUrl('public/vehicles/veh-01/approved/img-01/card')).toBe(
      'https://firebasestorage.googleapis.com/v0/b/mmg-test.appspot.com/o/public%2Fvehicles%2Fveh-01%2Fapproved%2Fimg-01%2Fcard?alt=media',
    );
  });

  it('refuses to guess a bucket name', () => {
    expect(() => googleCloudStoragePublicUrl('')).toThrow(/bucket name is required/);
  });
});

describe('toRenterVisibleVehicle', () => {
  it('projects a live listing with its published photos', () => {
    const image = promotedVehicleImageFixture();
    const dto = toRenterVisibleVehicle(liveVehicle(), [image], publicUrl);

    expect(dto).not.toBeNull();
    expect(dto!.vehicleId).toBe('veh-01');
    expect(dto!.imageUrls).toEqual([
      'https://firebasestorage.googleapis.com/v0/b/mmg-test.appspot.com/o/public%2Fvehicles%2Fveh-01%2Fapproved%2Fimg-01%2Fcard?alt=media',
    ]);
    expect(dto!.primaryImageUrl).toBe(dto!.imageUrls[0]);
    expect(dto!.approxLatitude).toBe(6.43);
  });

  it('never carries the plate, the exact base, or a private path', () => {
    // The private record exists for this vehicle and is deliberately not passed:
    // the projection has no parameter that could accept it.
    const privateDoc = vehiclePrivateFixture();
    const image = promotedVehicleImageFixture();

    const serialized = JSON.stringify(toRenterVisibleVehicle(liveVehicle(), [image], publicUrl));

    expect(serialized).not.toContain(privateDoc.plate!);
    expect(serialized).not.toContain(privateDoc.placeId!);
    expect(serialized).not.toContain('Marina Road');
    expect(serialized).not.toContain(String(privateDoc.exactLatitude));
    expect(serialized).not.toContain(String(privateDoc.exactLongitude));
    // No private storage path, and nothing outside the public prefix.
    expect(serialized).not.toContain('private/');
    expect(serialized).not.toContain('vehicle-uploads');
  });

  it('exposes only the whitelisted fields', () => {
    const dto = toRenterVisibleVehicle(liveVehicle(), [promotedVehicleImageFixture()], publicUrl);

    expect(Object.keys(dto!).sort()).toEqual(
      [
        'approxLatitude',
        'approxLongitude',
        'areaLabel',
        'category',
        'chauffeurPolicy',
        'deliveryPolicy',
        'description',
        'displayName',
        'features',
        'imageUrls',
        'make',
        'model',
        'ownerDailyRateKobo',
        'primaryImageUrl',
        'seats',
        'vehicleId',
        'ownerId',
        'year',
      ].sort(),
    );
    // Internal moderation state is not renter business.
    expect(dto).not.toHaveProperty('moderationStatus');
    expect(dto).not.toHaveProperty('discoverable');
    expect(dto).not.toHaveProperty('version');
    expect(dto).not.toHaveProperty('lastDecisionReason');
    expect(dto).not.toHaveProperty('primaryImagePath');
  });

  it('hides a listing whose photos were never published', () => {
    const onDropped = vi.fn();
    // Approved and active, but publication has not run — the paths are null.
    const dto = toRenterVisibleVehicle(liveVehicle(), [vehicleImageFixture({ status: 'approved' })], publicUrl, {
      onDropped,
    });

    expect(dto).toBeNull();
    expect(onDropped).toHaveBeenCalledWith('veh-01', 'no_published_images');
  });

  it('serves no photo from a private variant path', () => {
    // The image claims no public paths but has private ones. A projection that
    // fell back to variantPaths would emit a URL the bucket denies.
    const image = vehicleImageFixture({ status: 'approved' });
    expect(toRenterVisibleVehicle(liveVehicle(), [image], publicUrl)).toBeNull();
  });

  it('skips an image that lost approval while its paths are still stamped', () => {
    const rejected = promotedVehicleImageFixture({ imageId: 'img-02', status: 'rejected', order: 0 });
    const approved = promotedVehicleImageFixture({ imageId: 'img-03', order: 1 });

    const dto = toRenterVisibleVehicle(liveVehicle(), [rejected, approved], publicUrl);

    expect(dto!.imageUrls).toHaveLength(1);
    expect(dto!.imageUrls[0]).toContain('img-03');
  });

  it('orders photos by the owner’s ordering, not by arrival', () => {
    const second = promotedVehicleImageFixture({ imageId: 'img-b', order: 1 });
    const first = promotedVehicleImageFixture({ imageId: 'img-a', order: 0 });

    const dto = toRenterVisibleVehicle(liveVehicle(), [second, first], publicUrl);

    expect(dto!.imageUrls[0]).toContain('img-a');
    expect(dto!.imageUrls[1]).toContain('img-b');
    expect(dto!.primaryImageUrl).toBe(dto!.imageUrls[0]);
  });

  it.each([
    ['not_discoverable', { discoverable: false }],
    ['not_approved', { moderationStatus: 'suspended' as const }],
    ['not_active', { visibility: 'paused' as const }],
  ])('hides a listing that is %s', (reason, overrides) => {
    const onDropped = vi.fn();
    const dto = toRenterVisibleVehicle(
      liveVehicle(overrides),
      [promotedVehicleImageFixture()],
      publicUrl,
      { onDropped },
    );

    expect(dto).toBeNull();
    expect(onDropped).toHaveBeenCalledWith('veh-01', reason);
  });

  it('hides a listing carrying a stale discoverable flag', () => {
    // Derived state disagreeing with what it was derived from: suspended but
    // still flagged. The photos are gone by then, so serving it would be a
    // broken card at best.
    const stale = vehicleFixture({
      moderationStatus: 'suspended',
      visibility: 'active',
      discoverable: true,
    });

    expect(toRenterVisibleVehicle(stale, [promotedVehicleImageFixture()], publicUrl)).toBeNull();
  });

  it('drops a listing whose stored data cannot satisfy the renter contract', () => {
    const onDropped = vi.fn();
    // A rate outside the contract's bounds. Dropping the row keeps a discovery
    // page serving the other listings instead of failing the whole request.
    const broken = liveVehicle({ ownerDailyRateKobo: 1 });

    expect(
      toRenterVisibleVehicle(broken, [promotedVehicleImageFixture()], publicUrl, { onDropped }),
    ).toBeNull();
    expect(onDropped).toHaveBeenCalledWith('veh-01', 'invalid_projection');
  });

  it('caps the photo list at the contract maximum', () => {
    const images = Array.from({ length: 25 }, (_, index) =>
      promotedVehicleImageFixture({ imageId: `img-${index}`, order: index }),
    );

    const dto = toRenterVisibleVehicle(liveVehicle(), images, publicUrl);

    expect(dto!.imageUrls).toHaveLength(20);
  });
});

describe('toRenterVisibleVehicles', () => {
  it('returns only the visible listings and reports what it dropped', () => {
    const onDropped = vi.fn();
    const visible = {
      vehicle: liveVehicle(),
      images: [promotedVehicleImageFixture()],
    };
    const paused = {
      vehicle: liveVehicle({ visibility: 'paused' as const }),
      images: [promotedVehicleImageFixture()],
    };

    const page = toRenterVisibleVehicles([visible, paused], publicUrl, { onDropped });

    expect(page).toHaveLength(1);
    expect(onDropped).toHaveBeenCalledTimes(1);
    expect(onDropped).toHaveBeenCalledWith('veh-01', 'not_active');
  });
});
