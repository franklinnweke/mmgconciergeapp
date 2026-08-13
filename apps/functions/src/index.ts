import { initializeApp } from 'firebase-admin/app';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { createBookingIntent as createBookingIntentService } from './booking/create-booking-intent-service.js';
import { requireVerifiedRenter } from './booking/callable-auth.js';
import { BookingCommandError } from './booking/errors.js';
import { FirestoreBookingIntentRepository } from './booking/firestore-booking-intent-repository.js';

initializeApp();

const repository = new FirestoreBookingIntentRepository();

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
      const result = await createBookingIntentService(request.data, renterId, { repository });
      logger.info('booking_intent.created', {
        requestId: result.requestId,
        intentId: result.result.intentId,
      });
      return result;
    } catch (error) {
      if (error instanceof BookingCommandError) {
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
