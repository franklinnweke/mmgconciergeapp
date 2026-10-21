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

import { isProductionAppCheck } from '../app-check-env.js';
import type { RenterVehicleViewOptions } from '../vehicle/renter-vehicle-view.js';

const projectionDiagnostics: RenterVehicleViewOptions = {
  onDropped: (vehicleId, reason) => {
    if (reason === 'invalid_projection' || reason === 'no_published_images') {
      logger.warn('discovery.vehicle_excluded', { vehicleId, reason });
    }
  },
};

const discoveryRuntimeOptions = {
  region: 'africa-south1',
  invoker: 'public' as const,
  enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
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
        await searchVehiclesService(data, source, bucketName, projectionDiagnostics),
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
        await getVehicleDetailsService(data.vehicleId, source, bucketName, projectionDiagnostics),
      );
    } catch (error) {
      rethrowDiscoveryError(error, 'Vehicle details could not be loaded.');
    }
  },
);
