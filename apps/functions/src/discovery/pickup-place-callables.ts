import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { isProductionAppCheck } from '../app-check-env.js';
import { CommandError } from '../errors.js';
import { requireAuthenticatedUser } from '../owner/callable-auth.js';
import { HttpGooglePlacesClient } from './google-places-client.js';
import { googlePlacesSecret } from './google-places-secret.js';
import {
  resolvePickupPlaceService,
  searchPickupPlacesService,
} from './pickup-places-service.js';

const runtime = {
  region: 'africa-south1',
  invoker: 'public' as const,
  timeoutSeconds: 15,
  memory: '256MiB' as const,
};

function rethrow(error: unknown, fallback: string): never {
  if (error instanceof CommandError) {
    const code = error.code;
    if (code === 'UNAUTHENTICATED') {
      throw new HttpsError('unauthenticated', error.message);
    }
    if (code === 'FORBIDDEN') {
      throw new HttpsError('permission-denied', error.message);
    }
    if (code === 'INVALID_ARGUMENT') {
      throw new HttpsError('invalid-argument', error.message);
    }
    if (code === 'NOT_FOUND') {
      throw new HttpsError('not-found', error.message);
    }
    if (code === 'CONFIGURATION_UNAVAILABLE') {
      throw new HttpsError('unavailable', error.message);
    }
  }
  logger.error(fallback, {
    error: error instanceof Error ? error.message : 'Unknown error',
  });
  throw new HttpsError('internal', 'Location search operation could not be completed.');
}

function getPlacesClient(): HttpGooglePlacesClient {
  let apiKey = '';
  try {
    apiKey = googlePlacesSecret.value();
  } catch {
    apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
  }
  return new HttpGooglePlacesClient({ apiKey });
}

export const searchPickupPlaces = onCall(
  {
    ...runtime,
    enforceAppCheck: isProductionAppCheck(),
    secrets: [googlePlacesSecret],
  },
  async (request) => {
    try {
      requireAuthenticatedUser(request.auth);
      const client = getPlacesClient();
      return await searchPickupPlacesService(request.data, client);
    } catch (error) {
      return rethrow(error, 'pickup_place.search_failed');
    }
  },
);

export const resolvePickupPlace = onCall(
  {
    ...runtime,
    enforceAppCheck: isProductionAppCheck(),
    secrets: [googlePlacesSecret],
  },
  async (request) => {
    try {
      requireAuthenticatedUser(request.auth);
      const client = getPlacesClient();
      return await resolvePickupPlaceService(request.data, client);
    } catch (error) {
      return rethrow(error, 'pickup_place.resolve_failed');
    }
  },
);
