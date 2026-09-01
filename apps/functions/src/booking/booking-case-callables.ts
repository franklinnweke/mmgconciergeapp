import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { requireBookingOperationsAdmin } from './callable-auth.js';
import { BookingCommandError } from './errors.js';
import { FirestoreBookingCaseSourcingRepository } from './firestore-booking-case-sourcing-repository.js';
import { startBookingCaseSourcing as startBookingCaseSourcingService } from './booking-case-sourcing-service.js';

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

export const startBookingCaseSourcing = onCall(
  {
    region: 'africa-south1',
    invoker: 'public',
    enforceAppCheck: true,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const actor = requireBookingOperationsAdmin(request.auth);
      const result = await startBookingCaseSourcingService(request.data, actor, {
        repository: new FirestoreBookingCaseSourcingRepository(),
      });
      logger.info('booking.case_sourcing_started', {
        requestId: result.requestId,
        caseId: result.result.caseId,
        actorRole: actor.role,
      });
      return result;
    } catch (error) {
      if (error instanceof BookingCommandError) {
        logger.warn('booking.case_sourcing_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('booking.case_sourcing_failed');
      throw new HttpsError('internal', 'Booking intervention case could not be updated.');
    }
  },
);
