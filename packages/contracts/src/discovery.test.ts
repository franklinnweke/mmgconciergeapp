import { describe, expect, it } from 'vitest';

import {
  pickupPlaceSuggestionSchema,
  resolvePickupPlaceDataSchema,
  resolvePickupPlaceResultSchema,
  searchPickupPlacesDataSchema,
  searchPickupPlacesResultSchema,
} from './discovery';

describe('discovery contract schemas', () => {
  it('validates searchPickupPlacesDataSchema with query and optional sessionToken', () => {
    const validWithToken = {
      query: 'Eko Hotel',
      sessionToken: 'session-uuid-1234',
    };
    expect(searchPickupPlacesDataSchema.safeParse(validWithToken).success).toBe(true);

    const validWithoutToken = {
      query: 'Ikeja Mall',
    };
    expect(searchPickupPlacesDataSchema.safeParse(validWithoutToken).success).toBe(true);

    const invalidEmpty = {
      query: '   ',
    };
    expect(searchPickupPlacesDataSchema.safeParse(invalidEmpty).success).toBe(false);
  });

  it('validates pickupPlaceSuggestionSchema and searchPickupPlacesResultSchema', () => {
    const suggestion = {
      placeId: 'place-eko-1',
      primaryText: 'Eko Hotel & Suites',
      secondaryText: 'Victoria Island, Lagos',
    };
    expect(pickupPlaceSuggestionSchema.safeParse(suggestion).success).toBe(true);

    const result = {
      suggestions: [suggestion],
    };
    expect(searchPickupPlacesResultSchema.safeParse(result).success).toBe(true);
  });

  it('validates resolvePickupPlaceDataSchema and resolvePickupPlaceResultSchema', () => {
    const data = {
      placeId: 'ChIJ12345678',
      sessionToken: 'session-uuid-1234',
    };
    expect(resolvePickupPlaceDataSchema.safeParse(data).success).toBe(true);

    const result = {
      placeId: 'ChIJ12345678',
      displayName: 'Eko Hotel & Suites',
      formattedAddress: 'Plot 1415 Adetokunbo Ademola St, Victoria Island, Lagos',
      latitude: 6.4269,
      longitude: 3.4285,
      serviceAreaLabel: 'Victoria Island',
    };
    expect(resolvePickupPlaceResultSchema.safeParse(result).success).toBe(true);
  });

  it('rejects invalid serviceAreaLabel in resolvePickupPlaceResultSchema', () => {
    const invalidResult = {
      placeId: 'ChIJ12345678',
      displayName: 'Abuja Hotel',
      formattedAddress: 'Abuja, Nigeria',
      latitude: 9.0765,
      longitude: 7.3986,
      serviceAreaLabel: 'Abuja Central', // Not a LagosAreaLabel
    };
    expect(resolvePickupPlaceResultSchema.safeParse(invalidResult).success).toBe(false);
  });
});
