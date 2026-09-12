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
  it('defines a valid default pickup location in Victoria Island', () => {
    expect(isPickupLocationServiceable(DEFAULT_PICKUP_LOCATION)).toBe(true);
    expect(DEFAULT_PICKUP_LOCATION.serviceAreaLabel).toBe('Victoria Island');
    expect(DEFAULT_PICKUP_LOCATION.latitude).toBeGreaterThan(6.4);
    expect(DEFAULT_PICKUP_LOCATION.longitude).toBeGreaterThan(3.4);
  });

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
      source: 'place_search',
      displayName: 'Transcorp Hilton Abuja',
      formattedAddress: '1 Aguiyi Ironsi St, Abuja',
      serviceAreaLabel: 'Victoria Island',
      latitude: 9.0765,
      longitude: 7.3986,
    };
    expect(isPickupLocationServiceable(abuja)).toBe(false);

    const london: PickupLocation = {
      source: 'place_search',
      displayName: 'The Ritz London',
      formattedAddress: '150 Piccadilly, St. James, London',
      serviceAreaLabel: 'Ikoyi',
      latitude: 51.5074,
      longitude: -0.1278,
    };
    expect(isPickupLocationServiceable(london)).toBe(false);
  });

  it('derives canonical LagosAreaLabel from coordinates and freeform address queries', () => {
    // From coordinates inside Lagos
    expect(deriveLagosAreaLabel({ lat: 6.4531, lng: 3.4334 })).toBe('Ikoyi');
    expect(deriveLagosAreaLabel({ lat: 6.4281, lng: 3.4219 })).toBe('Victoria Island');
    expect(deriveLagosAreaLabel({ lat: 6.5774, lng: 3.3212 })).toBe('Ikeja');

    // From coordinates outside Lagos returns null
    expect(deriveLagosAreaLabel({ lat: 9.0765, lng: 7.3986 })).toBeNull();

    // From landmark strings
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

    // Fails closed on unknown query string (never defaults to Victoria Island)
    expect(deriveLagosAreaLabel('Unknown Random Location 12345')).toBeNull();
  });

  it('searches curated locations without synthesizing fake addresses', () => {
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

    // Non-matching query returns empty array (no synthesized fake address)
    const customResults = searchPickupLocations('Unknown Non-Existent Place');
    expect(customResults).toEqual([]);
  });

  it('serializes and parses round-trip correctly for route params', () => {
    const loc: PickupLocation = {
      source: 'place_search',
      placeId: 'loc-test',
      displayName: 'Test Villa',
      formattedAddress: '15 Alexander Rd, Ikoyi, Lagos',
      serviceAreaLabel: 'Ikoyi',
      latitude: 6.45,
      longitude: 3.44,
    };

    const serialized = serializePickupLocation(loc);
    const parsed = parsePickupLocation(serialized);

    expect(parsed).not.toBeNull();
    expect(parsed?.displayName).toBe(loc.displayName);
    expect(parsed?.formattedAddress).toBe(loc.formattedAddress);
    expect(parsed?.serviceAreaLabel).toBe(loc.serviceAreaLabel);
    expect(parsed?.latitude).toBe(loc.latitude);
    expect(parsed?.longitude).toBe(loc.longitude);
    expect(parsed?.source).toBe('place_search');
  });

  it('fails closed on missing or invalid pickup location parameters', () => {
    expect(parsePickupLocation(undefined)).toBeNull();
    expect(parsePickupLocation(null)).toBeNull();
    expect(parsePickupLocation('')).toBeNull();
    expect(parsePickupLocation('invalid json string')).toBeNull();

    // Out of Lagos coordinates fail closed
    const outOfLagos = JSON.stringify({
      displayName: 'Abuja Place',
      formattedAddress: 'Abuja, Nigeria',
      serviceAreaLabel: 'Victoria Island',
      lat: 9.0765,
      lng: 7.3986,
    });
    expect(parsePickupLocation(outOfLagos)).toBeNull();

    // Matches curated locations by placeId or exact name
    const parsedEko = parsePickupLocation('loc-eko-hotel');
    expect(parsedEko).not.toBeNull();
    expect(parsedEko?.displayName).toBe('Eko Hotel & Suites');
  });
});
