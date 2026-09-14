import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { createBookingIntent as createBookingIntentService } from './booking/create-booking-intent-service.js';
import { requirePaidBookingActor, requireVerifiedRenter } from './booking/callable-auth.js';
import { FirestoreBookingIntentRepository } from './booking/firestore-booking-intent-repository.js';
import { FirestorePaidBookingResponseRepository } from './booking/firestore-paid-booking-response-repository.js';
import {
  confirmBooking as confirmBookingService,
  rejectBooking as rejectBookingService,
} from './booking/paid-booking-response-service.js';
import {
  getOwnerVehicleCalendar as getOwnerVehicleCalendarService,
  getVehicleCalendar as getVehicleCalendarService,
  removeVehicleAvailabilityBlock as removeVehicleAvailabilityBlockService,
  setVehicleAvailabilityBlock as setVehicleAvailabilityBlockService,
} from './booking/vehicle-availability-service.js';
import { resolveSearchPlaceService } from './discovery/resolve-search-place-service.js';
import {
  FirestoreDiscoveryVehicleSource,
  searchVehiclesService,
} from './discovery/search-vehicles-service.js';
import { isProductionAppCheck } from './app-check-env.js';
import { CommandError } from './errors.js';
import {
  requireAuthenticatedUser,
  requireVerificationAdmin,
  requireVerifiedEmailOwnerAuth,
} from './owner/callable-auth.js';
import { completeOwnerProfile as completeOwnerProfileService } from './owner/complete-owner-profile-service.js';
import { expireAbandonedOwnerVerificationUploads } from './owner/expire-abandoned-uploads.js';
import { FirestoreOwnerRepository } from './owner/firestore-owner-repository.js';
import { reviewOwnerVerification as reviewOwnerVerificationService } from './owner/review-owner-verification-service.js';
import { AdminStorageGateway } from './owner/storage-validation.js';
import { submitOwnerVerification as submitOwnerVerificationService } from './owner/submit-owner-verification-service.js';
import { requireAuthenticatedRenter } from './renter/callable-auth.js';
import { completeRenterProfileService } from './renter/complete-renter-profile-service.js';
import { FirestoreRenterRepository } from './renter/firestore-renter-repository.js';
import { requestAccountDeletionService } from './renter/request-account-deletion-service.js';
import { requireVehicleAdmin } from './vehicle/callable-auth.js';
import { createVehicleDraft as createVehicleDraftService } from './vehicle/create-vehicle-draft-service.js';
import { createVehicleUploadSession as createVehicleUploadSessionService } from './vehicle/create-vehicle-upload-session-service.js';
import { finalizeVehicleImage as finalizeVehicleImageService } from './vehicle/finalize-vehicle-image-service.js';
import { FirestoreVehicleRepository } from './vehicle/firestore-vehicle-repository.js';
import { reviewVehicle as reviewVehicleService } from './vehicle/review-vehicle-service.js';
import { setVehicleVisibility as setVehicleVisibilityService } from './vehicle/set-vehicle-visibility-service.js';
import { SharpImageProcessor } from './vehicle/sharp-image-processor.js';
import { submitVehicleForReview as submitVehicleForReviewService } from './vehicle/submit-vehicle-for-review-service.js';
import { AdminVehicleStorageGateway } from './vehicle/vehicle-storage-gateway.js';

initializeApp();

const bookingRepository = new FirestoreBookingIntentRepository();
const paidBookingResponseRepository = new FirestorePaidBookingResponseRepository();
const ownerRepository = new FirestoreOwnerRepository();
const vehicleRepository = new FirestoreVehicleRepository();
const renterRepository = new FirestoreRenterRepository();
const storageGateway = new AdminStorageGateway();
const vehicleStorageGateway = new AdminVehicleStorageGateway();
const imageProcessor = new SharpImageProcessor();

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

export const createBookingIntent = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const renterId = requireVerifiedRenter(request.auth);
      const result = await createBookingIntentService(request.data, renterId, { repository: bookingRepository });
      logger.info('booking_intent.created', {
        requestId: result.requestId,
        intentId: result.result.intentId,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('booking_intent.rejected', {
          code: error.code,
        });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('booking_intent.failed');
      throw new HttpsError('internal', 'Booking intent could not be created.');
    }
  },
);

export const getVehicleCalendar = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const renter = requireAuthenticatedRenter(request.auth);
      const result = await getVehicleCalendarService(request.data, { repository: bookingRepository });
      logger.info('vehicle_calendar.renter_viewed', {
        uid: renter.uid,
        vehicleId: result.vehicleId,
        windowStartDate: result.windowStartDate,
        windowEndDate: result.windowEndDate,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('vehicle_calendar.renter_view_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('vehicle_calendar.renter_view_failed');
      throw new HttpsError('internal', 'Vehicle calendar could not be loaded.');
    }
  },
);

export const getOwnerVehicleCalendar = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const owner = requireVerifiedEmailOwnerAuth(request.auth);
      const result = await getOwnerVehicleCalendarService(request.data, owner.uid, {
        repository: bookingRepository,
      });
      logger.info('vehicle_calendar.owner_viewed', {
        uid: owner.uid,
        vehicleId: result.vehicleId,
        windowStartDate: result.windowStartDate,
        windowEndDate: result.windowEndDate,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('vehicle_calendar.owner_view_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('vehicle_calendar.owner_view_failed');
      throw new HttpsError('internal', 'Owner vehicle calendar could not be loaded.');
    }
  },
);

export const setVehicleAvailabilityBlock = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const owner = requireVerifiedEmailOwnerAuth(request.auth);
      const result = await setVehicleAvailabilityBlockService(request.data, owner.uid, {
        repository: bookingRepository,
      });
      logger.info('vehicle_availability.block_created', {
        requestId: result.requestId,
        uid: owner.uid,
        vehicleId: result.result.block.vehicleId,
        blockId: result.result.block.blockId,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('vehicle_availability.block_create_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('vehicle_availability.block_create_failed');
      throw new HttpsError('internal', 'Vehicle availability could not be updated.');
    }
  },
);

export const removeVehicleAvailabilityBlock = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const owner = requireVerifiedEmailOwnerAuth(request.auth);
      const result = await removeVehicleAvailabilityBlockService(request.data, owner.uid, {
        repository: bookingRepository,
      });
      logger.info('vehicle_availability.block_removed', {
        requestId: result.requestId,
        uid: owner.uid,
        vehicleId: result.result.vehicleId,
        blockId: result.result.blockId,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('vehicle_availability.block_remove_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('vehicle_availability.block_remove_failed');
      throw new HttpsError('internal', 'Vehicle availability block could not be removed.');
    }
  },
);

export const confirmBooking = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const actor = requirePaidBookingActor(request.auth);
      const result = await confirmBookingService(request.data, actor, {
        repository: paidBookingResponseRepository,
      });
      logger.info('booking.owner_confirmed', {
        requestId: result.requestId,
        uid: actor.uid,
        bookingId: result.result.bookingId,
        fromState: result.result.fromState,
        toState: result.result.toState,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('booking.owner_confirmation_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('booking.owner_confirmation_failed');
      throw new HttpsError('internal', 'Booking could not be confirmed.');
    }
  },
);

export const rejectBooking = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const actor = requirePaidBookingActor(request.auth);
      const result = await rejectBookingService(request.data, actor, {
        repository: paidBookingResponseRepository,
      });
      logger.info('booking.owner_rejected', {
        requestId: result.requestId,
        uid: actor.uid,
        bookingId: result.result.bookingId,
        caseId: result.result.caseId,
        fromState: result.result.fromState,
        toState: result.result.toState,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('booking.owner_rejection_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('booking.owner_rejection_failed');
      throw new HttpsError('internal', 'Booking could not be sent to concierge intervention.');
    }
  },
);

export const completeOwnerProfile = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const result = await completeOwnerProfileService(request.data, request.auth, { repository: ownerRepository });
      logger.info('owner.profile_completed', {
        requestId: result.requestId,
        uid: request.auth?.uid,
        ownerId: result.result.ownerId,
        toStatus: result.result.verificationStatus,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('owner.profile_completion_rejected', {
          code: error.code,
        });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('owner.profile_completion_failed');
      throw new HttpsError('internal', 'Owner profile could not be completed.');
    }
  },
);

export const submitOwnerVerification = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const result = await submitOwnerVerificationService(request.data, request.auth, {
        repository: ownerRepository,
        storageGateway,
      });
      logger.info('owner.verification_submitted', {
        requestId: result.requestId,
        uid: request.auth?.uid,
        ownerId: result.result.ownerId,
        toStatus: result.result.verificationStatus,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('owner.verification_submission_rejected', {
          code: error.code,
        });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('owner.verification_submission_failed');
      throw new HttpsError('internal', 'Owner verification could not be submitted.');
    }
  },
);

export const reviewOwnerVerification = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const actor = requireVerificationAdmin(request.auth);
      const result = await reviewOwnerVerificationService(request.data, actor, {
        repository: ownerRepository,
        storageGateway,
      });
      logger.info('owner.verification_decided', {
        requestId: result.requestId,
        actorUid: actor.uid,
        ownerId: result.result.ownerId,
        fromStatus: result.result.fromStatus,
        toStatus: result.result.toStatus,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('owner.verification_decision_rejected', {
          code: error.code,
        });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('owner.verification_decision_failed');
      throw new HttpsError('internal', 'Owner verification decision could not be applied.');
    }
  },
);

// ── Vehicle Operations ──

export const createVehicleDraft = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const actor = requireVerifiedEmailOwnerAuth(request.auth);
      const result = await createVehicleDraftService(request.data, actor.uid, {
        repository: vehicleRepository,
      });
      logger.info('vehicle.draft_created', {
        requestId: result.requestId,
        uid: actor.uid,
        vehicleId: result.result.vehicleId,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('vehicle.draft_creation_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('vehicle.draft_creation_failed');
      throw new HttpsError('internal', 'Vehicle draft could not be created.');
    }
  },
);

export const createVehicleUploadSession = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const actor = requireVerifiedEmailOwnerAuth(request.auth);
      const result = await createVehicleUploadSessionService(request.data, actor.uid, {
        repository: vehicleRepository,
      });
      logger.info('vehicle.upload_session_created', {
        requestId: result.requestId,
        uid: actor.uid,
        uploadId: result.result.uploadId,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('vehicle.upload_session_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('vehicle.upload_session_failed');
      throw new HttpsError('internal', 'Vehicle upload session could not be created.');
    }
  },
);

export const finalizeVehicleImage = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    // This callable decodes an owner-supplied image and renders three variants.
    // The contract allows edges up to 8000px, so a worst-case source decodes to
    // roughly 8000×8000×4 bytes ≈ 256 MB of raw bitmap before any resize — the
    // previous 256MiB/30s budget could not complete that without being killed.
    timeoutSeconds: 120,
    memory: '1GiB',
  },
  async (request) => {
    try {
      const actor = requireVerifiedEmailOwnerAuth(request.auth);
      const result = await finalizeVehicleImageService(request.data, actor.uid, {
        repository: vehicleRepository,
        storageGateway: vehicleStorageGateway,
        imageProcessor,
      });
      logger.info('vehicle.image_finalized', {
        requestId: result.requestId,
        uid: actor.uid,
        imageId: result.result.imageId,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('vehicle.image_finalization_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('vehicle.image_finalization_failed');
      throw new HttpsError('internal', 'Vehicle image could not be finalized.');
    }
  },
);

export const submitVehicleForReview = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const actor = requireVerifiedEmailOwnerAuth(request.auth);
      const result = await submitVehicleForReviewService(request.data, actor.uid, {
        repository: vehicleRepository,
      });
      logger.info('vehicle.submitted', {
        requestId: result.requestId,
        uid: actor.uid,
        vehicleId: result.result.vehicleId,
        version: result.result.version,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('vehicle.submission_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('vehicle.submission_failed');
      throw new HttpsError('internal', 'Vehicle could not be submitted for review.');
    }
  },
);

/**
 * A committed decision whose image bytes did not move.
 *
 * Logged as an error because it needs operator attention, but deliberately not
 * thrown: the decision itself is durable, and telling the caller it failed would
 * be false. The listing stays non-discoverable until it is published.
 */
function logPublicationFailure(
  error: unknown,
  context: { vehicleId: string; requestId: string },
): void {
  logger.error('vehicle.publication_incomplete', {
    vehicleId: context.vehicleId,
    requestId: context.requestId,
    reason: error instanceof Error ? error.message : 'unknown',
  });
}

export const reviewVehicle = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    // Longer than the other commands: after the decision commits, this copies up
    // to 20 images × their variants into the public prefix.
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const actor = requireVehicleAdmin(request.auth);
      const result = await reviewVehicleService(request.data, actor, {
        repository: vehicleRepository,
        storageGateway: vehicleStorageGateway,
        onPromotionFailure: logPublicationFailure,
      });
      logger.info('vehicle.decided', {
        requestId: result.requestId,
        actorUid: actor.uid,
        vehicleId: result.result.vehicleId,
        fromStatus: result.result.fromStatus,
        toStatus: result.result.toStatus,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('vehicle.decision_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('vehicle.decision_failed');
      throw new HttpsError('internal', 'Vehicle review decision could not be applied.');
    }
  },
);

export const setVehicleVisibility = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    // Same reason as reviewVehicle: activating an approved listing publishes its
    // images, pausing or deleting it removes them.
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const actor = requireVerifiedEmailOwnerAuth(request.auth);
      const result = await setVehicleVisibilityService(request.data, actor.uid, {
        repository: vehicleRepository,
        storageGateway: vehicleStorageGateway,
        onPromotionFailure: logPublicationFailure,
      });
      logger.info('vehicle.visibility_changed', {
        requestId: result.requestId,
        uid: actor.uid,
        vehicleId: result.result.vehicleId,
        visibility: result.result.visibility,
        discoverable: result.result.discoverable,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('vehicle.visibility_change_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('vehicle.visibility_change_failed');
      throw new HttpsError('internal', 'Vehicle visibility could not be updated.');
    }
  },
);

export const resolveSearchPlace = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 15,
    memory: '256MiB',
  },
  async (request) => {
    try {
      requireAuthenticatedUser(request.auth);
      const result = resolveSearchPlaceService(request.data);
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message);
      }
      throw new HttpsError('internal', 'Place could not be resolved.');
    }
  },
);

export const searchVehicles = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      requireAuthenticatedRenter(request.auth);
      const bucketName = getStorage().bucket().name || 'mmg-concierge.appspot.com';
      const source = new FirestoreDiscoveryVehicleSource(getFirestore());
      const result = await searchVehiclesService(request.data ?? {}, source, bucketName);
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message);
      }
      logger.error('discovery.search_failed', { error });
      throw new HttpsError('internal', 'Vehicle search failed.');
    }
  },
);

export const completeRenterProfile = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const actor = requireAuthenticatedRenter(request.auth);
      const result = await completeRenterProfileService(request.data, actor, renterRepository);
      logger.info('renter.profile_completed', {
        requestId: result.requestId,
        renterId: result.result.renterId,
        accountStatus: result.result.accountStatus,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('renter.profile_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('renter.profile_failed', { error });
      throw new HttpsError('internal', 'Renter profile could not be updated.');
    }
  },
);

export const requestAccountDeletion = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(), // enforceAppCheck: true in production
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const actor = requireAuthenticatedRenter(request.auth);
      const result = await requestAccountDeletionService(request.data, actor, renterRepository);
      logger.info('renter.deletion_requested', {
        requestId: result.requestId,
        renterId: result.result.renterId,
        accountStatus: result.result.accountStatus,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('renter.deletion_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('renter.deletion_failed', { error });
      throw new HttpsError('internal', 'Account deletion could not be requested.');
    }
  },
);

// Exactly one scheduled export per job. Re-exporting the same handler under a
// second name would register a second Cloud Scheduler job racing on the same
// Storage deletes.
export { expireAbandonedOwnerVerificationUploads };
export { resolvePickupPlace, searchPickupPlaces } from './discovery/pickup-place-callables.js';
