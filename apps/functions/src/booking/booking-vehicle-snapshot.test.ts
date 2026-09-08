import { describe, expect, it } from 'vitest';

import type { VehicleImageRecord } from '../vehicle/vehicle-repository.js';
import { buildBookingVehicleSnapshot } from './booking-vehicle-snapshot.js';

function image(
  imageId: string,
  order: number,
  cardPath: string,
  status: VehicleImageRecord['status'] = 'approved',
): VehicleImageRecord {
  return {
    imageId,
    vehicleId: 'vehicle-one',
    ownerId: 'owner-one',
    order,
    status,
    width: 1600,
    height: 1200,
    originalUploadId: `upload-${imageId}`,
    variantPaths: { card: `private/${imageId}/card` },
    processing: {
      sourceFormat: 'jpeg',
      sourceByteSize: 1000,
      sourceHadExif: false,
      sourceGps: 'absent',
      metadataStripped: true,
      variants: {},
    },
    publicVariantPaths: status === 'approved' ? { card: cardPath } : null,
    promotedAt: status === 'approved' ? '2026-09-08T12:00:00.000Z' : null,
    createdAt: '2026-09-08T12:00:00.000Z',
    updatedAt: '2026-09-08T12:00:00.000Z',
  };
}

describe('buildBookingVehicleSnapshot', () => {
  it('uses the deterministic published card image rather than a fixture image key', () => {
    const snapshot = buildBookingVehicleSnapshot(
      {
        displayName: 'Mercedes-AMG GLE 53',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
        imageKey: 'hero-suv',
      },
      [
        image('rear', 3, 'public/vehicles/vehicle-one/approved/rear/card'),
        image('front', 1, 'public/vehicles/vehicle-one/approved/front/card'),
      ],
      (path) => `https://media.example/${path}`,
      { allowLegacyImageKeyFallback: true },
    );

    expect(snapshot).toEqual({
      displayName: 'Mercedes-AMG GLE 53',
      areaLabel: 'Ikoyi',
      categoryLabel: 'Executive SUV',
      imageUrl: 'https://media.example/public/vehicles/vehicle-one/approved/front/card',
    });
  });

  it('omits misleading image keys for canonical vehicles with no published image', () => {
    const snapshot = buildBookingVehicleSnapshot(
      {
        displayName: 'Toyota Land Cruiser Prado',
        areaLabel: 'Victoria Island',
        categoryLabel: 'Executive SUV',
        imageKey: 'hero-suv',
      },
      [],
      (path) => `https://media.example/${path}`,
    );

    expect(snapshot.imageUrl).toBeUndefined();
    expect(snapshot.imageKey).toBeUndefined();
  });

  it('keeps fixture image keys only when explicitly allowed for legacy data', () => {
    const snapshot = buildBookingVehicleSnapshot(
      {
        displayName: 'Legacy Fixture SUV',
        areaLabel: 'Lagos',
        categoryLabel: 'Executive SUV',
        imageKey: 'pearl-suv',
      },
      [],
      (path) => `https://media.example/${path}`,
      { allowLegacyImageKeyFallback: true },
    );

    expect(snapshot.imageKey).toBe('pearl-suv');
  });
});
