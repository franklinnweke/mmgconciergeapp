import type { PickupPlaceSuggestion } from '@mmg/contracts/discovery';
import { logger } from 'firebase-functions';

import { CommandError } from '../errors.js';

export type GooglePlaceDetails = {
  id: string;
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
};

export interface GooglePlacesClient {
  searchPlaces(input: { query: string; sessionToken?: string }): Promise<PickupPlaceSuggestion[]>;
  resolvePlace(input: { placeId: string; sessionToken?: string }): Promise<GooglePlaceDetails | null>;
}

export type HttpGooglePlacesClientOptions = {
  apiKey?: string;
  fetchFn?: typeof fetch;
  endpointBaseUrl?: string;
};

const DEFAULT_BASE_URL = 'https://places.googleapis.com/v1';

// Lagos operational service envelope boundaries
const LAGOS_RECTANGLE = {
  low: { latitude: 6.30, longitude: 2.70 },
  high: { latitude: 6.75, longitude: 4.30 },
};

export class HttpGooglePlacesClient implements GooglePlacesClient {
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;
  private readonly endpointBaseUrl: string;

  constructor(options?: HttpGooglePlacesClientOptions) {
    this.apiKey = options?.apiKey?.trim() || '';
    this.fetchFn = options?.fetchFn ?? fetch;
    this.endpointBaseUrl = options?.endpointBaseUrl ?? DEFAULT_BASE_URL;
  }

  async searchPlaces(input: { query: string; sessionToken?: string }): Promise<PickupPlaceSuggestion[]> {
    const q = input.query.trim();
    if (!q) return [];
    if (!this.apiKey) {
      logger.warn('google_places.missing_api_key', { operation: 'searchPlaces' });
      throw new CommandError('CONFIGURATION_UNAVAILABLE', 'Google Places API key is not configured.');
    }

    const url = `${this.endpointBaseUrl}/places:autocomplete`;
    const payload: Record<string, unknown> = {
      input: q,
      includedRegionCodes: ['ng'],
      locationRestriction: {
        rectangle: LAGOS_RECTANGLE,
      },
    };

    if (input.sessionToken) {
      payload.sessionToken = input.sessionToken;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.error('google_places.autocomplete_error_response', {
          status: response.status,
          statusText: response.statusText,
        });
        throw new CommandError('INTERNAL', 'Google Places search is currently unavailable.');
      }

      const data = (await response.json()) as {
        suggestions?: Array<{
          placePrediction?: {
            place?: string;
            placeId?: string;
            text?: { text?: string };
            structuredFormat?: {
              mainText?: { text?: string };
              secondaryText?: { text?: string };
            };
          };
        }>;
      };

      if (!data.suggestions || !Array.isArray(data.suggestions)) {
        return [];
      }

      const suggestions: PickupPlaceSuggestion[] = [];

      for (const item of data.suggestions) {
        const pred = item.placePrediction;
        if (!pred) continue;

        const rawPlaceId = pred.placeId || (pred.place ? pred.place.replace(/^places\//, '') : '');
        if (!rawPlaceId) continue;

        const primaryText = pred.structuredFormat?.mainText?.text || pred.text?.text || '';
        if (!primaryText) continue;

        const secondaryText = pred.structuredFormat?.secondaryText?.text;

        suggestions.push({
          placeId: rawPlaceId,
          primaryText,
          ...(secondaryText ? { secondaryText } : {}),
        });

        if (suggestions.length >= 10) break;
      }

      return suggestions;
    } catch (error: unknown) {
      if (error instanceof CommandError) throw error;
      logger.error('google_places.autocomplete_network_error', {
        message: error instanceof Error ? error.message : 'Unknown network error',
      });
      throw new CommandError('INTERNAL', 'Google Places search could not be completed.');
    }
  }

  async resolvePlace(input: { placeId: string; sessionToken?: string }): Promise<GooglePlaceDetails | null> {
    const placeId = input.placeId.trim();
    if (!placeId) return null;
    if (!this.apiKey) {
      logger.warn('google_places.missing_api_key', { operation: 'resolvePlace' });
      throw new CommandError('CONFIGURATION_UNAVAILABLE', 'Location service is currently unavailable.');
    }

    const queryParams = new URLSearchParams();
    if (input.sessionToken) {
      queryParams.set('sessionToken', input.sessionToken);
    }

    const queryString = queryParams.toString();
    const url = `${this.endpointBaseUrl}/places/${encodeURIComponent(placeId)}${queryString ? `?${queryString}` : ''}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await this.fetchFn(url, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        logger.error('google_places.details_error_response', {
          status: response.status,
          statusText: response.statusText,
        });
        throw new CommandError('INTERNAL', 'Could not resolve place details with location provider.');
      }

      const data = (await response.json()) as {
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
      };

      if (
        !data.id ||
        typeof data.location?.latitude !== 'number' ||
        typeof data.location?.longitude !== 'number'
      ) {
        return null;
      }

      const displayName = data.displayName?.text?.trim() || data.formattedAddress?.trim() || 'Selected Location';
      const formattedAddress = data.formattedAddress?.trim() || displayName;

      return {
        id: data.id,
        displayName,
        formattedAddress,
        latitude: data.location.latitude,
        longitude: data.location.longitude,
      };
    } catch (error: unknown) {
      if (error instanceof CommandError) throw error;
      logger.error('google_places.details_network_error', {
        message: error instanceof Error ? error.message : 'Unknown network error',
      });
      throw new CommandError('INTERNAL', 'Location provider could not be reached.');
    }
  }
}
