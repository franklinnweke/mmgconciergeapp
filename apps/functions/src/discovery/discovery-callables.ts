import {
  getVehicleDetailsDataSchema,
  getVehicleDetailsResultSchema,
  searchVehiclesDataSchema,
  searchVehiclesResultSchema,
} from '@mmg/contracts/discovery';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { ZodError } from 'zod';

import { CommandError } from '../errors.js';
import { requireAuthenticatedRenter } from '../renter/callable-auth.js';
import {
  FirestoreDiscoveryVehicleSource,
  getVehicleDetailsService,
  searchVehiclesService,
} from './search-vehicles-service.js';

const discoveryRuntimeOptions = {
  region: 'africa-south1',
  invoker: 'public' as const,
  enforceAppCheck: true,
  timeoutSeconds: 30,
  memory: '256MiB' as const,
};

function rethrowDiscoveryError(error: unknown, fallbackMessage: string): never {
  if (error instanceof CommandError) {
    if (error.code === 'UNAUTHENTICATED') {
      throw new HttpsError('unauthenticated', error.message, { code: error.code });
    }
    if (error.code === 'FORBIDDEN') {
      throw new HttpsError('permission-denied', error.message, { code: error.code });
    }
  }
  if (error instanceof ZodError) {
    throw new HttpsError('invalid-argument', 'Discovery request is invalid.');
  }
  logger.error('discovery.callable_failed');
  throw new HttpsError('internal', fallbackMessage);
}

export const searchVehicles = onCall(
  discoveryRuntimeOptions,
  async (request) => {
    try {
      requireAuthenticatedRenter(request.auth);
      const data = searchVehiclesDataSchema.parse(request.data ?? {});
      const bucketName = getStorage().bucket().name || 'mmg-concierge.appspot.com';
      const source = new FirestoreDiscoveryVehicleSource(getFirestore());
      return searchVehiclesResultSchema.parse(
        await searchVehiclesService(data, source, bucketName),
      );
    } catch (error) {
      rethrowDiscoveryError(error, 'Vehicle search failed.');
    }
  },
);

export const getVehicleDetails = onCall(
  discoveryRuntimeOptions,
  async (request) => {
    try {
      requireAuthenticatedRenter(request.auth);
      const data = getVehicleDetailsDataSchema.parse(request.data ?? {});
      const bucketName = getStorage().bucket().name || 'mmg-concierge.appspot.com';
      const source = new FirestoreDiscoveryVehicleSource(getFirestore());
      return getVehicleDetailsResultSchema.parse(
        await getVehicleDetailsService(data.vehicleId, source, bucketName),
      );
    } catch (error) {
      rethrowDiscoveryError(error, 'Vehicle details could not be loaded.');
    }
  },
);
