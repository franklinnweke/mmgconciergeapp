import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { isProductionAppCheck } from '../app-check-env.js';
import { CommandError } from '../errors.js';
import { requireVerifiedRenter } from './callable-auth.js';
import { FirestoreRentalRequestRepository } from './firestore-rental-request-repository.js';
import {
  approveRentalRequest as approveRentalRequestService,
  createRentalRequest as createRentalRequestService,
  declineRentalRequest as declineRentalRequestService,
  releaseRentalRequestPaymentHold as releaseRentalRequestPaymentHoldService,
  type RentalRequestDecisionActor,
} from './rental-request-service.js';

const runtime = { region: 'africa-south1', invoker: 'public' as const, timeoutSeconds: 30, memory: '256MiB' as const };

const httpsCode = {
  UNAUTHENTICATED: 'unauthenticated', FORBIDDEN: 'permission-denied', INVALID_ARGUMENT: 'invalid-argument',
  NOT_FOUND: 'not-found', FAILED_PRECONDITION: 'failed-precondition', ALREADY_EXISTS: 'already-exists',
  IDEMPOTENCY_CONFLICT: 'already-exists', VEHICLE_UNAVAILABLE: 'failed-precondition',
  CONFIGURATION_UNAVAILABLE: 'unavailable', INTERNAL: 'internal', INVALID_STATE_TRANSITION: 'failed-precondition',
  PROFILE_INCOMPLETE: 'failed-precondition',
} as const;

function rethrow(error: unknown, fallback: string): never {
  if (error instanceof CommandError) {
    throw new HttpsError(httpsCode[error.code], error.message, { code: error.code, ...error.safeDetails });
  }
  logger.error(fallback);
  throw new HttpsError('internal', 'Rental request operation could not be completed.');
}

function requireDecisionActor(auth: { uid: string; token: Record<string, unknown> } | undefined): RentalRequestDecisionActor {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to respond to rental requests.');
  if (auth.token.email_verified !== true) throw new HttpsError('permission-denied', 'Verify your email first.');
  return { uid: auth.uid, isStaff: auth.token.support === true || auth.token.super_admin === true };
}

export const createRentalRequest = onCall(
  { ...runtime, enforceAppCheck: isProductionAppCheck() },
  async (request) => {
    try {
      const renterId = requireVerifiedRenter(request.auth);
      const result = await createRentalRequestService(request.data, renterId, { repository: new FirestoreRentalRequestRepository() });
      logger.info('rental_request.created', { requestId: result.result.requestId });
      return result;
    } catch (error) { return rethrow(error, 'rental_request.create_failed'); }
  },
);

export const approveRentalRequest = onCall(
  { ...runtime, enforceAppCheck: isProductionAppCheck() },
  async (request) => {
    try {
      const actor = requireDecisionActor(request.auth);
      const result = await approveRentalRequestService(request.data, actor, { repository: new FirestoreRentalRequestRepository() });
      logger.info('rental_request.approved', { requestId: result.result.requestId, actorId: actor.uid });
      return result;
    } catch (error) { return rethrow(error, 'rental_request.approve_failed'); }
  },
);

export const declineRentalRequest = onCall(
  { ...runtime, enforceAppCheck: isProductionAppCheck() },
  async (request) => {
    try {
      const actor = requireDecisionActor(request.auth);
      const result = await declineRentalRequestService(request.data, actor, { repository: new FirestoreRentalRequestRepository() });
      logger.info('rental_request.declined', { requestId: result.result.requestId, actorId: actor.uid });
      return result;
    } catch (error) { return rethrow(error, 'rental_request.decline_failed'); }
  },
);

export const releaseRentalRequestPaymentHold = onCall(
  { ...runtime, enforceAppCheck: isProductionAppCheck() },
  async (request) => {
    try {
      const renterId = requireVerifiedRenter(request.auth);
      const result = await releaseRentalRequestPaymentHoldService(request.data, renterId, { repository: new FirestoreRentalRequestRepository() });
      logger.info('rental_request.payment_hold_released', { requestId: result.result.requestId });
      return result;
    } catch (error) { return rethrow(error, 'rental_request.release_failed'); }
  },
);
