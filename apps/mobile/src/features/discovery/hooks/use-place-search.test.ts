import { describe, expect, it, vi } from 'vitest';

import { CURATED_PICKUP_LOCATIONS } from '../domain/pickup-location';
import {
  generateSessionToken,
  resolvePickupPlaceToLocation,
} from './use-place-search';

vi.mock('@react-native-firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));

describe('use-place-search domain and resolution', () => {
  it('generates valid UUID session tokens', () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();

    expect(typeof token1).toBe('string');
    expect(token1.length).toBeGreaterThanOrEqual(16);
    expect(token1).toMatch(/^[a-f0-9-]+$/i);
    expect(token1).not.toBe(token2);
  });

  it('resolves valid Lagos place details to PickupLocation with derived serviceArea', () => {
    const resolved = {
      placeId: 'place-civic-towers',
      displayName: 'Civic Towers',
      formattedAddress: 'Ozumba Mbadiwe Ave, Victoria Island, Lagos, Nigeria',
      latitude: 6.4342,
      longitude: 3.4215,
      serviceAreaLabel: 'Victoria Island',
    };

    const location = resolvePickupPlaceToLocation(resolved, 'Gate 2, North Lobby');

    expect(location.placeId).toBe('place-civic-towers');
    expect(location.displayName).toBe('Civic Towers');
    expect(location.formattedAddress).toBe('Ozumba Mbadiwe Ave, Victoria Island, Lagos, Nigeria');
    expect(location.latitude).toBe(6.4342);
    expect(location.longitude).toBe(3.4215);
    expect(location.serviceAreaLabel).toBe('Victoria Island');
    expect(location.source).toBe('place_search');
    expect(location.note).toBe('Gate 2, North Lobby');
  });

  it('derives canonical service area if server returns coordinate in valid centroid range', () => {
    const resolved = {
      placeId: 'place-gra-ikeja',
      displayName: 'GRA Ikeja Meeting Point',
      formattedAddress: 'Isaac John St, Ikeja GRA, Lagos',
      latitude: 6.5874,
      longitude: 3.3512,
      serviceAreaLabel: 'Ikeja',
    };

    const location = resolvePickupPlaceToLocation(resolved);
    expect(location.serviceAreaLabel).toBe('Ikeja');
    expect(location.note).toBeUndefined();
  });

  it('fails closed and throws if resolved place is outside Lagos service area', () => {
    const outOfLagos = {
      placeId: 'place-abuja',
      displayName: 'Transcorp Hilton Abuja',
      formattedAddress: '1 Aguiyi Ironsi St, Abuja',
      latitude: 9.0765,
      longitude: 7.3986,
      serviceAreaLabel: 'NonExistentArea',
    };

    expect(() => resolvePickupPlaceToLocation(outOfLagos)).toThrow(
      'MMG currently serves pickups within Lagos',
    );
  });

  it('contains curated landmarks ready for immediate display', () => {
    expect(CURATED_PICKUP_LOCATIONS.length).toBeGreaterThanOrEqual(5);
    const mma = CURATED_PICKUP_LOCATIONS.find((loc) => loc.serviceAreaLabel === 'Ikeja');
    expect(mma).toBeDefined();
    expect(mma?.latitude).toBeGreaterThan(6.3);
    expect(mma?.longitude).toBeGreaterThan(2.7);
  });
});
