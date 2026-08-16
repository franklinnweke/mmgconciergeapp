import { initializeApp } from 'firebase-admin/app';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { createBookingIntent as createBookingIntentService } from './booking/create-booking-intent-service.js';
import { requireVerifiedRenter } from './booking/callable-auth.js';
import { FirestoreBookingIntentRepository } from './booking/firestore-booking-intent-repository.js';
import { CommandError } from './errors.js';
import { requireVerificationAdmin } from './owner/callable-auth.js';
import { completeOwnerProfile as completeOwnerProfileService } from './owner/complete-owner-profile-service.js';
import {
  expireAbandonedOwnerVerificationUploads,
  expireAbandonedUploads,
} from './owner/expire-abandoned-uploads.js';
import { FirestoreOwnerRepository } from './owner/firestore-owner-repository.js';
import { reviewOwnerVerification as reviewOwnerVerificationService } from './owner/review-owner-verification-service.js';
import { AdminStorageGateway } from './owner/storage-validation.js';
import { submitOwnerVerification as submitOwnerVerificationService } from './owner/submit-owner-verification-service.js';

initializeApp();

const bookingRepository = new FirestoreBookingIntentRepository();
const ownerRepository = new FirestoreOwnerRepository();
const storageGateway = new AdminStorageGateway();

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
    region: 'africa-south1',
    enforceAppCheck: true,
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

export const completeOwnerProfile = onCall(
  {
    region: 'africa-south1',
    enforceAppCheck: true,
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
    region: 'africa-south1',
    enforceAppCheck: true,
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
    region: 'africa-south1',
    enforceAppCheck: true,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const actor = requireVerificationAdmin(request.auth);
      const result = await reviewOwnerVerificationService(request.data, actor, {
        repository: ownerRepository,
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

export { expireAbandonedOwnerVerificationUploads, expireAbandonedUploads };
