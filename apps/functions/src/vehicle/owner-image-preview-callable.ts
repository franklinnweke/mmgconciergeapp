import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { isProductionAppCheck } from '../app-check-env.js';
import { CommandError } from '../errors.js';
import { getOwnerVehicleImagePreviewService } from './owner-image-preview-service.js';
import { FirestoreVehicleRepository } from './firestore-vehicle-repository.js';

const repository = new FirestoreVehicleRepository();
export const getOwnerVehicleImagePreview = onCall({ region: 'africa-south1', invoker: 'public', enforceAppCheck: isProductionAppCheck() }, async (request) => {
  try {
    return await getOwnerVehicleImagePreviewService(request.data, request.auth, {
      load: (vehicleId) => repository.runTransaction(async (tx) => {
        const vehicle = await tx.getVehicle(vehicleId);
        const images = vehicle?.ownerId === request.auth?.uid ? await tx.getVehicleImages(vehicleId) : [];
        return { vehicle, images };
      }),
      sign: async (path, expiresAt) => {
        const file = getStorage().bucket().file(path);
        let metadata;
        try { [metadata] = await file.getMetadata(); }
        catch (error) {
          if ((error as { code?: number }).code === 404) return null;
          throw error;
        }
        const [, , ownerId, vehicleId, imageId] = path.split('/');
        if (metadata.metadata?.ownerId !== ownerId || metadata.metadata?.vehicleId !== vehicleId
          || metadata.metadata?.imageId !== imageId || metadata.metadata?.variant !== 'card'
          || metadata.metadata?.purpose !== 'vehicle-image-variant'
          || !['image/jpeg', 'image/png', 'image/webp'].includes(metadata.contentType ?? '')) return null;
        const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: expiresAt });
        return url;
      },
    });
  } catch (error) {
    if (error instanceof CommandError) {
const code = error.code === 'UNAUTHENTICATED' ? 'unauthenticated' : error.code === 'INVALID_ARGUMENT' ? 'invalid-argument' : error.code === 'FORBIDDEN' ? 'permission-denied' : 'failed-precondition';
      throw new HttpsError(code, error.message, { code: error.code });
    }
    logger.error('vehicle.preview_failed');
    throw new HttpsError('internal', 'Vehicle preview is unavailable.');
  }
});
