import { describe, expect, it, vi } from 'vitest';

import {
  normalizeVehicleImageUrl,
  resolveVehicleFallbackImageSource,
  resolveVehicleImageSource,
  vehicleImages,
} from './vehicle-images';

vi.mock('../../../../assets/images/fleet/graphite-executive-sedan.png', () => ({ default: 'mock-graphite-sedan' }));
vi.mock('../../../../assets/images/fleet/prado-250-obsidian-hero.png', () => ({ default: 'mock-hero-suv' }));
vi.mock('../../../../assets/images/fleet/prado-150-pearl.png', () => ({ default: 'mock-pearl-suv' }));
vi.mock('../../../../assets/images/fleet/prado-150-graphite.png', () => ({ default: 'mock-prado-graphite' }));

describe('normalizeVehicleImageUrl', () => {
  it('routes raw Cloud Storage URLs through the Firebase Storage media endpoint', () => {
    expect(
      normalizeVehicleImageUrl(
        'https://storage.googleapis.com/mmg-concierge.appspot.com/public/vehicles/v1/approved/card.jpg',
      ),
    ).toBe(
      'https://firebasestorage.googleapis.com/v0/b/mmg-concierge.appspot.com/o/public%2Fvehicles%2Fv1%2Fapproved%2Fcard.jpg?alt=media',
    );
  });

  it('preserves URLs that do not use the raw Cloud Storage endpoint', () => {
    expect(normalizeVehicleImageUrl('https://cdn.example.com/car.jpg')).toBe(
      'https://cdn.example.com/car.jpg',
    );
  });
});

describe('resolveVehicleImageSource', () => {
  it('normalizes remote imageUrl when provided', () => {
    const source = resolveVehicleImageSource({
      imageUrl:
        'https://storage.googleapis.com/mmg-concierge.appspot.com/public/vehicles/v1/approved/card.jpg',
    });
    expect(source).toEqual({
      uri: 'https://firebasestorage.googleapis.com/v0/b/mmg-concierge.appspot.com/o/public%2Fvehicles%2Fv1%2Fapproved%2Fcard.jpg?alt=media',
    });
  });

  it('normalizes remote primaryImageUrl when provided', () => {
    const source = resolveVehicleImageSource({
      primaryImageUrl:
        'https://storage.googleapis.com/mmg-concierge.appspot.com/public/vehicles/v1/approved/primary.jpg',
    });
    expect(source).toEqual({
      uri: 'https://firebasestorage.googleapis.com/v0/b/mmg-concierge.appspot.com/o/public%2Fvehicles%2Fv1%2Fapproved%2Fprimary.jpg?alt=media',
    });
  });

  it('normalizes the first element of imageUrls array', () => {
    const source = resolveVehicleImageSource({
      imageUrls: [
        'https://storage.googleapis.com/mmg-concierge.appspot.com/public/vehicles/v1/approved/first.jpg',
        'https://storage.googleapis.com/mmg-concierge.appspot.com/public/vehicles/v1/approved/second.jpg',
      ],
    });
    expect(source).toEqual({
      uri: 'https://firebasestorage.googleapis.com/v0/b/mmg-concierge.appspot.com/o/public%2Fvehicles%2Fv1%2Fapproved%2Ffirst.jpg?alt=media',
    });
  });

  it('resolves bundled static asset for known imageKey', () => {
    const source = resolveVehicleImageSource({
      imageKey: 'pearl-suv',
    });
    expect(source).toBe(vehicleImages['pearl-suv']);
  });

  it('falls back to category default if imageKey is unknown and remote URLs are absent', () => {
    const sedanSource = resolveVehicleImageSource({
      category: 'executive_sedan',
    });
    expect(sedanSource).toBe(vehicleImages['graphite-sedan']);

    const suvSource = resolveVehicleImageSource({
      category: 'executive_suv',
    });
    expect(suvSource).toBe(vehicleImages['hero-suv']);
  });

  it('resolves tracked legacy web asset paths to bundled native assets', () => {
    expect(
      resolveVehicleImageSource({
        category: 'executive_suv',
        primaryImageUrl: '/assets/images/fleet/prado-150-pearl.png',
      }),
    ).toBe(vehicleImages['pearl-suv']);
  });

  it('does not pass missing legacy web asset paths to the native image loader', () => {
    expect(
      resolveVehicleImageSource({
        category: 'executive_suv',
        primaryImageUrl: '/assets/images/fleet/lc300-vxr-white.png',
      }),
    ).toBe(vehicleImages['hero-suv']);

    expect(
      resolveVehicleImageSource({
        category: 'executive_sedan',
        imageUrl: '/assets/images/fleet/mercedes-s580-black.png',
      }),
    ).toBe(vehicleImages['graphite-sedan']);
  });

  it('gracefully handles null or undefined vehicle input without throwing', () => {
    expect(resolveVehicleImageSource(null)).toBe(vehicleImages['hero-suv']);
    expect(resolveVehicleImageSource(undefined)).toBe(vehicleImages['hero-suv']);
    expect(resolveVehicleImageSource({})).toBe(vehicleImages['hero-suv']);
  });
});

describe('resolveVehicleFallbackImageSource', () => {
  it('uses bundled imagery even when a remote URL is present', () => {
    const source = resolveVehicleFallbackImageSource({
      category: 'executive_suv',
      imageKey: 'prado-graphite',
      primaryImageUrl: 'https://example.invalid/broken.jpg',
    });

    expect(source).toBe(vehicleImages['prado-graphite']);
  });

  it('uses the category fallback when a vehicle has no image key', () => {
    expect(
      resolveVehicleFallbackImageSource({ category: 'executive_sedan' }),
    ).toBe(vehicleImages['graphite-sedan']);
    expect(
      resolveVehicleFallbackImageSource({ category: 'executive_suv' }),
    ).toBe(vehicleImages['hero-suv']);
  });
});
