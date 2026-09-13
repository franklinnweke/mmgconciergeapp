import {
  resolvePickupPlaceDataSchema,
  resolvePickupPlaceResultSchema,
  searchPickupPlacesDataSchema,
  searchPickupPlacesResultSchema,
  type ResolvePickupPlaceData,
  type ResolvePickupPlaceResult,
  type SearchPickupPlacesData,
  type SearchPickupPlacesResult,
} from '@mmg/contracts/discovery';
import {
  deriveLagosAreaLabelFromCoordinates,
  isWithinLagosBBox,
} from '@mmg/domain';

import { CommandError } from '../errors.js';
import type { GooglePlacesClient } from './google-places-client.js';

export async function searchPickupPlacesService(
  untrustedInput: unknown,
  client: GooglePlacesClient,
): Promise<SearchPickupPlacesResult> {
  const parsed = searchPickupPlacesDataSchema.safeParse(untrustedInput);
  if (!parsed.success) {
    throw new CommandError('INVALID_ARGUMENT', 'Search query cannot be empty.');
  }

  const suggestions = await client.searchPlaces({
    query: parsed.data.query,
    sessionToken: parsed.data.sessionToken,
  });

  return searchPickupPlacesResultSchema.parse({ suggestions });
}

export async function resolvePickupPlaceService(
  untrustedInput: unknown,
  client: GooglePlacesClient,
): Promise<ResolvePickupPlaceResult> {
  const parsed = resolvePickupPlaceDataSchema.safeParse(untrustedInput);
  if (!parsed.success) {
    throw new CommandError('INVALID_ARGUMENT', 'Invalid place ID.');
  }

  const details = await client.resolvePlace({
    placeId: parsed.data.placeId,
    sessionToken: parsed.data.sessionToken,
  });

  if (!details) {
    throw new CommandError('NOT_FOUND', 'Pickup location could not be resolved.');
  }

  if (!isWithinLagosBBox(details.latitude, details.longitude)) {
    throw new CommandError(
      'INVALID_ARGUMENT',
      'MMG currently serves pickups within Lagos. Choose a Lagos pickup location instead.',
    );
  }

  const serviceAreaLabel = deriveLagosAreaLabelFromCoordinates(
    details.latitude,
    details.longitude,
  );

  if (!serviceAreaLabel) {
    throw new CommandError(
      'NOT_FOUND',
      'Could not resolve a Lagos service area for this location.',
    );
  }

  return resolvePickupPlaceResultSchema.parse({
    placeId: details.id,
    displayName: details.displayName,
    formattedAddress: details.formattedAddress,
    latitude: details.latitude,
    longitude: details.longitude,
    serviceAreaLabel,
  });
}
