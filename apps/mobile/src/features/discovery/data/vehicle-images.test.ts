import { describe, expect, it, vi } from 'vitest';

import { resolveVehicleImageSource, vehicleImages } from './vehicle-images';

vi.mock('../../../../assets/images/fleet/graphite-executive-sedan.png', () => ({ default: 'mock-graphite-sedan' }));
vi.mock('../../../../assets/images/fleet/prado-250-obsidian-hero.png', () => ({ default: 'mock-hero-suv' }));
vi.mock('../../../../assets/images/fleet/prado-150-pearl.png', () => ({ default: 'mock-pearl-suv' }));
vi.mock('../../../../assets/images/fleet/prado-150-graphite.png', () => ({ default: 'mock-prado-graphite' }));

describe('resolveVehicleImageSource', () => {
  it('resolves remote imageUrl when provided', () => {
    const source = resolveVehicleImageSource({
      imageUrl: 'https://storage.googleapis.com/mmg-concierge/public/vehicles/v1/approved/card.jpg',
    });
    expect(source).toEqual({
      uri: 'https://storage.googleapis.com/mmg-concierge/public/vehicles/v1/approved/card.jpg',
    });
  });

  it('resolves remote primaryImageUrl when provided', () => {
    const source = resolveVehicleImageSource({
      primaryImageUrl: 'https://storage.googleapis.com/mmg-concierge/public/vehicles/v1/approved/primary.jpg',
    });
    expect(source).toEqual({
      uri: 'https://storage.googleapis.com/mmg-concierge/public/vehicles/v1/approved/primary.jpg',
    });
  });

  it('resolves first element of imageUrls array', () => {
    const source = resolveVehicleImageSource({
      imageUrls: [
        'https://storage.googleapis.com/mmg-concierge/public/vehicles/v1/approved/first.jpg',
        'https://storage.googleapis.com/mmg-concierge/public/vehicles/v1/approved/second.jpg',
      ],
    });
    expect(source).toEqual({
      uri: 'https://storage.googleapis.com/mmg-concierge/public/vehicles/v1/approved/first.jpg',
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
    expect(sedanSource).toBe(vehicleImages['mercedes-s580']);

    const suvSource = resolveVehicleImageSource({
      category: 'executive_suv',
    });
    expect(suvSource).toBe(vehicleImages['hero-suv']);
  });

  it('gracefully handles null or undefined vehicle input without throwing', () => {
    expect(resolveVehicleImageSource(null)).toBe(vehicleImages['hero-suv']);
    expect(resolveVehicleImageSource(undefined)).toBe(vehicleImages['hero-suv']);
    expect(resolveVehicleImageSource({})).toBe(vehicleImages['hero-suv']);
  });
});
