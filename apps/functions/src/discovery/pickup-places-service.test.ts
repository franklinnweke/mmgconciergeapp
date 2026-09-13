import { describe, expect, it } from 'vitest';

import { CommandError } from '../errors.js';
import type { GooglePlacesClient } from './google-places-client.js';
import {
  resolvePickupPlaceService,
  searchPickupPlacesService,
} from './pickup-places-service.js';

describe('pickup-places-service', () => {
  const mockClient: GooglePlacesClient = {
    searchPlaces: async ({ query }) => {
      if (query.toLowerCase().includes('eko')) {
        return [
          {
            placeId: 'place-eko-1',
            primaryText: 'Eko Hotel & Suites',
            secondaryText: 'Plot 1415 Adetokunbo Ademola St, Victoria Island, Lagos',
          },
        ];
      }
      return [];
    },
    resolvePlace: async ({ placeId }) => {
      if (placeId === 'place-eko-1') {
        return {
          id: 'place-eko-1',
          displayName: 'Eko Hotel & Suites',
          formattedAddress: 'Plot 1415 Adetokunbo Ademola St, Victoria Island, Lagos',
          latitude: 6.4269,
          longitude: 3.4285,
        };
      }
      if (placeId === 'place-abuja-1') {
        return {
          id: 'place-abuja-1',
          displayName: 'Transcorp Hilton Abuja',
          formattedAddress: '1 Aguiyi Ironsi St, Maitama, Abuja',
          latitude: 9.0765,
          longitude: 7.3986,
        };
      }
      return null;
    },
  };

  describe('searchPickupPlacesService', () => {
    it('returns predictions from provider', async () => {
      const result = await searchPickupPlacesService(
        { query: 'Eko Hotel', sessionToken: 'uuid-123' },
        mockClient,
      );
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].primaryText).toBe('Eko Hotel & Suites');
    });

    it('rejects empty query', async () => {
      await expect(
        searchPickupPlacesService({ query: '   ' }, mockClient),
      ).rejects.toThrow(CommandError);
    });
  });

  describe('resolvePickupPlaceService', () => {
    it('resolves valid Lagos place and derives authoritative serviceAreaLabel', async () => {
      const result = await resolvePickupPlaceService(
        { placeId: 'place-eko-1', sessionToken: 'uuid-123' },
        mockClient,
      );
      expect(result).toEqual({
        placeId: 'place-eko-1',
        displayName: 'Eko Hotel & Suites',
        formattedAddress: 'Plot 1415 Adetokunbo Ademola St, Victoria Island, Lagos',
        latitude: 6.4269,
        longitude: 3.4285,
        serviceAreaLabel: 'Victoria Island',
      });
    });

    it('fails closed when provider returns not found', async () => {
      await expect(
        resolvePickupPlaceService({ placeId: 'unknown-id' }, mockClient),
      ).rejects.toThrow('Pickup location could not be resolved.');
    });

    it('fails closed when place coordinates are outside Lagos operational envelope', async () => {
      await expect(
        resolvePickupPlaceService({ placeId: 'place-abuja-1' }, mockClient),
      ).rejects.toThrow('MMG currently serves pickups within Lagos. Choose a Lagos pickup location instead.');
    });
  });
});
