import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { initializeBookingPaymentCommandSchema } from '@mmg/contracts/payment';

import { isProductionAppCheck } from '../app-check-env.js';
import { CommandError } from '../errors.js';
import { requireCheckoutRenter, requireVerifiedRenter } from './callable-auth.js';
import { FirestoreBookingPaymentInitializationRepository } from './firestore-booking-payment-initialization-repository.js';
import { FirestoreRentalRequestRepository } from './firestore-rental-request-repository.js';
import { initializeBookingPayment as initializeBookingPaymentService } from './initialize-booking-payment-service.js';
import { PaystackPaymentAdapter } from './paystack-payment-adapter.js';
import { FirestoreRequestFirstPaymentProtection } from './request-first-payment-protection.js';
import {
  approveRentalRequest as approveRentalRequestService,
  createRentalRequest as createRentalRequestService,
  declineRentalRequest as declineRentalRequestService,
  releaseRentalRequestPaymentHold as releaseRentalRequestPaymentHoldService,
  type RentalRequestDecisionActor,
} from './rental-request-service.js';

const paystackSecret = defineSecret('PAYSTACK_SECRET_KEY');
const runtime = { region: 'africa-south1', invoker: 'public' as const, timeoutSeconds: 30, memory: '256MiB' as const };
const httpsCode = {
  UNAUTHENTICATED: 'unauthenticated', FORBIDDEN: 'permission-denied', INVALID_ARGUMENT: 'invalid-argument', NOT_FOUND: 'not-found',
  FAILED_PRECONDITION: 'failed-precondition', ALREADY_EXISTS: 'already-exists', IDEMPOTENCY_CONFLICT: 'already-exists',
  VEHICLE_UNAVAILABLE: 'failed-precondition', CONFIGURATION_UNAVAILABLE: 'unavailable', INTERNAL: 'internal',
  INVALID_STATE_TRANSITION: 'failed-precondition', PROFILE_INCOMPLETE: 'failed-precondition',
} as const;

function rethrow(error: unknown, fallback: string): never {
  if (error instanceof CommandError) throw new HttpsError(httpsCode[error.code], error.message, { code: error.code, ...error.safeDetails });
  logger.error(fallback);
  throw new HttpsError('internal', 'Rental request operation could not be completed.');
}

function requireDecisionActor(auth: { uid: string; token: Record<string, unknown> } | undefined): RentalRequestDecisionActor {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to respond to rental requests.');
  if (auth.token.email_verified !== true) throw new HttpsError('permission-denied', 'Verify your email first.');
  if (auth.token.super_admin === true) return { uid: auth.uid, isStaff: true, role: 'super_admin' };
  if (auth.token.support === true) return { uid: auth.uid, isStaff: true, role: 'support' };
  return { uid: auth.uid, isStaff: false };
}

function requestFirstGateway(): PaystackPaymentAdapter {
  return new PaystackPaymentAdapter({ secretKey: paystackSecret.value(), requiredEnvironment: 'test' });
}

export const createRentalRequest = onCall({ ...runtime, enforceAppCheck: isProductionAppCheck() }, async (request) => {
  try { const renterId = requireVerifiedRenter(request.auth); return await createRentalRequestService(request.data, renterId, { repository: new FirestoreRentalRequestRepository() }); }
  catch (error) { return rethrow(error, 'rental_request.create_failed'); }
});

export const approveRentalRequest = onCall({ ...runtime, enforceAppCheck: isProductionAppCheck() }, async (request) => {
  try { const actor = requireDecisionActor(request.auth); return await approveRentalRequestService(request.data, actor, { repository: new FirestoreRentalRequestRepository() }); }
  catch (error) { return rethrow(error, 'rental_request.approve_failed'); }
});

export const declineRentalRequest = onCall({ ...runtime, enforceAppCheck: isProductionAppCheck() }, async (request) => {
  try { const actor = requireDecisionActor(request.auth); return await declineRentalRequestService(request.data, actor, { repository: new FirestoreRentalRequestRepository() }); }
  catch (error) { return rethrow(error, 'rental_request.decline_failed'); }
});

export const releaseRentalRequestPaymentHold = onCall({ ...runtime, enforceAppCheck: isProductionAppCheck() }, async (request) => {
  try { const renterId = requireVerifiedRenter(request.auth); return await releaseRentalRequestPaymentHoldService(request.data, renterId, { repository: new FirestoreRentalRequestRepository() }); }
  catch (error) { return rethrow(error, 'rental_request.release_failed'); }
});

export const initializeRentalRequestPayment = onCall({
  ...runtime,
  enforceAppCheck: isProductionAppCheck(),
  secrets: [paystackSecret],
}, async (request) => {
  try {
    const actor = requireCheckoutRenter(request.auth);
    const parsed = initializeBookingPaymentCommandSchema.parse(request.data);
    await new FirestoreRequestFirstPaymentProtection().protect(parsed.data.intentId, actor.uid, new Date());
    return await initializeBookingPaymentService(parsed, actor, {
      repository: new FirestoreBookingPaymentInitializationRepository(),
      paymentGateway: requestFirstGateway(),
    });
  } catch (error) { return rethrow(error, 'rental_request.payment_initialization_failed'); }
});
