import { describe, expect, it } from 'vitest';

import {
  CURATED_PICKUP_LOCATIONS,
  DEFAULT_PICKUP_LOCATION,
  deriveLagosAreaLabel,
  isPickupLocationServiceable,
  parsePickupLocation,
  searchPickupLocations,
  serializePickupLocation,
  type PickupLocation,
} from './pickup-location';

describe('PickupLocation domain model', () => {
  it('has valid curated locations that resolve to canonical LagosAreaLabels', () => {
    expect(CURATED_PICKUP_LOCATIONS.length).toBeGreaterThanOrEqual(5);

    const airport = CURATED_PICKUP_LOCATIONS.find((loc) => loc.placeId === 'loc-mma-airport');
    expect(airport).toBeDefined();
    expect(airport?.serviceAreaLabel).toBe('Ikeja');
    expect(airport?.displayName).toBe('Murtala Muhammed Airport (LOS)');

    const ekoHotel = CURATED_PICKUP_LOCATIONS.find((loc) => loc.placeId === 'loc-eko-hotel');
    expect(ekoHotel).toBeDefined();
    expect(ekoHotel?.serviceAreaLabel).toBe('Victoria Island');

    const wheatbaker = CURATED_PICKUP_LOCATIONS.find((loc) => loc.placeId === 'loc-wheatbaker');
    expect(wheatbaker).toBeDefined();
    expect(wheatbaker?.serviceAreaLabel).toBe('Ikoyi');
  });

  it('validates serviceability using Lagos bounding box coordinates', () => {
    // Curated locations with Lagos lat/lng are serviceable
    for (const loc of CURATED_PICKUP_LOCATIONS) {
      expect(isPickupLocationServiceable(loc)).toBe(true);
    }

    // Outside Lagos coordinates (e.g. Abuja or London) fail serviceability
    const abuja: PickupLocation = {
      displayName: 'Transcorp Hilton Abuja',
      formattedAddress: '1 Aguiyi Ironsi St, Abuja',
      serviceAreaLabel: 'Victoria Island',
      latitude: 9.0765,
      longitude: 7.3986,
    };
    expect(isPickupLocationServiceable(abuja)).toBe(false);

    const london: PickupLocation = {
      displayName: 'The Ritz London',
      formattedAddress: '150 Piccadilly, St. James, London',
      serviceAreaLabel: 'Ikoyi',
      latitude: 51.5074,
      longitude: -0.1278,
    };
    expect(isPickupLocationServiceable(london)).toBe(false);
  });

  it('derives canonical LagosAreaLabel from freeform address queries', () => {
    expect(deriveLagosAreaLabel('Murtala Muhammed International Airport')).toBe('Ikeja');
    expect(deriveLagosAreaLabel('MMA2 Terminal')).toBe('Ikeja');
    expect(deriveLagosAreaLabel('ExecuJet Hangar')).toBe('Ikeja');
    expect(deriveLagosAreaLabel('17 Bourdillon Rd, Ikoyi')).toBe('Ikoyi');
    expect(deriveLagosAreaLabel('Banana Island Estate')).toBe('Banana Island');
    expect(deriveLagosAreaLabel('23 Adeola Odeku St, VI')).toBe('Victoria Island');
    expect(deriveLagosAreaLabel('Eko Atlantic City')).toBe('Victoria Island');
    expect(deriveLagosAreaLabel('Admiralty Way, Lekki')).toBe('Lekki Phase 1');
    expect(deriveLagosAreaLabel('Chevron Drive, Lekki')).toBe('Lekki');
    expect(deriveLagosAreaLabel('Isaac John St, Ikeja GRA')).toBe('Ikeja');
    expect(deriveLagosAreaLabel('Marina CMS')).toBe('Lagos Island');
    expect(deriveLagosAreaLabel('Unknown Location')).toBe('Victoria Island'); // Safe default
  });

  it('searches curated locations and synthesizes custom addresses', () => {
    // Empty query returns all curated locations
    expect(searchPickupLocations('')).toEqual(CURATED_PICKUP_LOCATIONS);

    // Matching query
    const airportResults = searchPickupLocations('airport');
    expect(airportResults.length).toBeGreaterThanOrEqual(1);
    expect(airportResults[0].serviceAreaLabel).toBe('Ikeja');

    // Matching by address substring
    const ademolaResults = searchPickupLocations('Adetokunbo Ademola');
    expect(ademolaResults.length).toBeGreaterThanOrEqual(1);
    expect(ademolaResults[0].displayName).toBe('Eko Hotel & Suites');

    // Synthesized query
    const customResults = searchPickupLocations('12 Glover Road, Ikoyi');
    expect(customResults.length).toBe(1);
    expect(customResults[0].displayName).toBe('12 Glover Road, Ikoyi');
    expect(customResults[0].serviceAreaLabel).toBe('Ikoyi');
  });

  it('serializes and parses round-trip correctly for route params', () => {
    const loc: PickupLocation = {
      placeId: 'loc-test',
      displayName: 'Test Villa',
      formattedAddress: '15 Alexander Rd, Ikoyi, Lagos',
      serviceAreaLabel: 'Ikoyi',
      latitude: 6.45,
      longitude: 3.44,
    };

    const serialized = serializePickupLocation(loc);
    const parsed = parsePickupLocation(serialized);

    expect(parsed.displayName).toBe(loc.displayName);
    expect(parsed.formattedAddress).toBe(loc.formattedAddress);
    expect(parsed.serviceAreaLabel).toBe(loc.serviceAreaLabel);
    expect(parsed.latitude).toBe(loc.latitude);
    expect(parsed.longitude).toBe(loc.longitude);
  });

  it('parses legacy string params gracefully', () => {
    expect(parsePickupLocation(undefined)).toEqual(DEFAULT_PICKUP_LOCATION);
    expect(parsePickupLocation(null)).toEqual(DEFAULT_PICKUP_LOCATION);

    const parsedVI = parsePickupLocation('Victoria Island, Lagos');
    expect(parsedVI.serviceAreaLabel).toBe('Victoria Island');
    expect(parsedVI.displayName).toBe('Victoria Island');

    const parsedAirport = parsePickupLocation('Murtala Muhammed Airport, Lagos');
    expect(parsedAirport.serviceAreaLabel).toBe('Ikeja');
  });
});
