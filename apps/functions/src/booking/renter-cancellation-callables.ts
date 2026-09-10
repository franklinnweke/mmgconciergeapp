import { quoteBookingCancellationCommandSchema } from '@mmg/contracts/cancellation';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { isProductionAppCheck } from '../app-check-env.js';
import { FirestoreBookingCancellationQuoteQuery } from './booking-cancellation-quote-query.js';
import { requireVerifiedRenter } from './callable-auth.js';
import { BookingCommandError } from './errors.js';
import { FirestoreRenterCancellationRepository } from './firestore-renter-cancellation-repository.js';
import {
  cancelPaidBooking as cancelPaidBookingService,
  cancelRentalRequest as cancelRentalRequestService,
} from './renter-cancellation-service.js';

const runtime = {
  region: 'africa-south1',
  invoker: 'public' as const,
  enforceAppCheck: isProductionAppCheck(),
  timeoutSeconds: 30,
  memory: '256MiB' as const,
};

const httpsCode = {
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

function rethrow(error: unknown, operation: string): never {
  if (error instanceof BookingCommandError) {
    logger.warn(`${operation}.rejected`, { code: error.code });
    throw new HttpsError(httpsCode[error.code], error.message, {
      code: error.code,
      ...error.safeDetails,
    });
  }
  logger.error(`${operation}.failed`);
  throw new HttpsError('internal', 'Cancellation could not be completed.');
}

export const cancelRentalRequest = onCall(runtime, async (request) => {
  try {
    const renterId = requireVerifiedRenter(request.auth);
    return await cancelRentalRequestService(request.data, renterId, {
      repository: new FirestoreRenterCancellationRepository(),
    });
  } catch (error) {
    return rethrow(error, 'renter_cancellation.request');
  }
});

export const quoteBookingCancellation = onCall(runtime, async (request) => {
  try {
    const renterId = requireVerifiedRenter(request.auth);
    const parsed = quoteBookingCancellationCommandSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new BookingCommandError('INVALID_ARGUMENT', 'Cancellation quote request is invalid.');
    }
    return await new FirestoreBookingCancellationQuoteQuery().quote(
      parsed.data.data.bookingId,
      renterId,
      new Date(),
    );
  } catch (error) {
    return rethrow(error, 'renter_cancellation.quote');
  }
});

export const cancelBooking = onCall(runtime, async (request) => {
  try {
    const renterId = requireVerifiedRenter(request.auth);
    return await cancelPaidBookingService(request.data, renterId, {
      repository: new FirestoreRenterCancellationRepository(),
    });
  } catch (error) {
    return rethrow(error, 'renter_cancellation.booking');
  }
});
