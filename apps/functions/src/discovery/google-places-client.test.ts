import { describe, expect, it, vi } from 'vitest';

import { HttpGooglePlacesClient } from './google-places-client.js';

describe('HttpGooglePlacesClient', () => {
  it('returns empty predictions when API key is missing', async () => {
    const client = new HttpGooglePlacesClient({ apiKey: '' });
    const suggestions = await client.searchPlaces({ query: 'Eko Hotel' });
    expect(suggestions).toEqual([]);
  });

  it('sends sessionToken, locationRestriction, and query in autocomplete request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          {
            placePrediction: {
              placeId: 'ChIJ12345678',
              structuredFormat: {
                mainText: { text: 'Eko Hotel & Suites' },
                secondaryText: { text: 'Adetokunbo Ademola St, Victoria Island, Lagos' },
              },
            },
          },
          {
            placePrediction: {
              place: 'places/ChIJ87654321',
              text: { text: 'The Wheatbaker, Ikoyi, Lagos' },
            },
          },
        ],
      }),
    });

    const client = new HttpGooglePlacesClient({
      apiKey: 'test-api-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const results = await client.searchPlaces({
      query: 'Eko',
      sessionToken: 'test-session-uuid',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(calledOptions.method).toBe('POST');
    expect(calledOptions.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': 'test-api-key',
    });

    const body = JSON.parse(calledOptions.body);
    expect(body.input).toBe('Eko');
    expect(body.sessionToken).toBe('test-session-uuid');
    expect(body.includedRegionCodes).toEqual(['ng']);
    expect(body.locationRestriction.rectangle).toEqual({
      low: { latitude: 6.30, longitude: 2.70 },
      high: { latitude: 6.75, longitude: 4.30 },
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      placeId: 'ChIJ12345678',
      primaryText: 'Eko Hotel & Suites',
      secondaryText: 'Adetokunbo Ademola St, Victoria Island, Lagos',
    });
    expect(results[1]).toEqual({
      placeId: 'ChIJ87654321',
      primaryText: 'The Wheatbaker, Ikoyi, Lagos',
    });
  });

  it('handles autocomplete provider error and empty responses safely', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const client = new HttpGooglePlacesClient({
      apiKey: 'test-api-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const results = await client.searchPlaces({ query: 'Eko' });
    expect(results).toEqual([]);
  });

  it('resolves place details with minimal field mask and sessionToken', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'ChIJ12345678',
        displayName: { text: 'Eko Hotel & Suites', languageCode: 'en' },
        formattedAddress: 'Plot 1415 Adetokunbo Ademola St, Victoria Island, Lagos',
        location: { latitude: 6.4269, longitude: 3.4285 },
      }),
    });

    const client = new HttpGooglePlacesClient({
      apiKey: 'test-api-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const details = await client.resolvePlace({
      placeId: 'ChIJ12345678',
      sessionToken: 'test-session-uuid',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://places.googleapis.com/v1/places/ChIJ12345678?sessionToken=test-session-uuid');
    expect(calledOptions.headers).toMatchObject({
      'X-Goog-Api-Key': 'test-api-key',
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
    });

    expect(details).toEqual({
      id: 'ChIJ12345678',
      displayName: 'Eko Hotel & Suites',
      formattedAddress: 'Plot 1415 Adetokunbo Ademola St, Victoria Island, Lagos',
      latitude: 6.4269,
      longitude: 3.4285,
    });
  });

  it('returns null when place is not found (404)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const client = new HttpGooglePlacesClient({
      apiKey: 'test-api-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const details = await client.resolvePlace({ placeId: 'non-existent-id' });
    expect(details).toBeNull();
  });
});
