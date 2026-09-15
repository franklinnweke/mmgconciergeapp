import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { isProductionAppCheck } from '../app-check-env.js';
import { CommandError } from '../errors.js';
import { requireVerifiedEmailOwnerAuth } from '../owner/callable-auth.js';
import { FirestoreVehicleRepository } from './firestore-vehicle-repository.js';
import { updateVehicleDraft as updateVehicleDraftService } from './update-vehicle-draft-service.js';

const vehicleRepository = new FirestoreVehicleRepository();

const callableRuntimeOptions = {
  region: 'africa-south1',
  invoker: 'public' as const,
};

const httpsCodeByDomainCode = {
  UNAUTHENTICATED: 'unauthenticated',
  FORBIDDEN: 'permission-denied',
  INVALID_ARGUMENT: 'invalid-argument',
  NOT_FOUND: 'not-found',
  FAILED_PRECONDITION: 'failed-precondition',
  ALREADY_EXISTS: 'already-exists',
  IDEMPOTENCY_CONFLICT: 'already-exists',
  VEHICLE_UNAVAILABLE: 'failed-precondition',
  CONFIGURATION_UNAVAILABLE: 'unavailable',
  INTERNAL: 'internal',
  INVALID_STATE_TRANSITION: 'failed-precondition',
  PROFILE_INCOMPLETE: 'failed-precondition',
} as const;

export const updateVehicleDraft = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(),
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const owner = requireVerifiedEmailOwnerAuth(request.auth);
      const result = await updateVehicleDraftService(request.data, owner.uid, {
        repository: vehicleRepository,
      });
      logger.info('vehicle.draft_updated', {
        requestId: result.requestId,
        ownerId: owner.uid,
        vehicleId: result.result.vehicleId,
        moderationStatus: result.result.moderationStatus,
        version: result.result.version,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('vehicle.draft_update_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('vehicle.draft_update_failed');
      throw new HttpsError('internal', 'Vehicle listing could not be updated.');
    }
  },
);
