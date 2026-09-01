import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { requireCheckoutRenter } from './callable-auth.js';
import { CommandError } from '../errors.js';
import { FirestoreBookingPaymentInitializationRepository } from './firestore-booking-payment-initialization-repository.js';
import { initializeBookingPayment as initializeBookingPaymentService } from './initialize-booking-payment-service.js';
import { PaystackPaymentAdapter } from './paystack-payment-adapter.js';

const paystackSecret = defineSecret('PAYSTACK_SECRET_KEY');

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

export const initializeBookingPayment = onCall(
  {
    region: 'africa-south1',
    invoker: 'public',
    enforceAppCheck: true,
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [paystackSecret],
  },
  async (request) => {
    try {
      const actor = requireCheckoutRenter(request.auth);
      const repository = new FirestoreBookingPaymentInitializationRepository();
      const paymentGateway = new PaystackPaymentAdapter({
        secretKey: paystackSecret.value(),
        // WP4 development integration is intentionally test-mode only. Enabling
        // live credentials requires a separate controlled-production change.
        requiredEnvironment: 'test',
      });

      const result = await initializeBookingPaymentService(request.data, actor, {
        repository,
        paymentGateway,
      });

      logger.info('booking_payment.checkout_initialized', {
        requestId: result.requestId,
        intentId: result.result.intentId,
        paymentId: result.result.paymentId,
        environment: result.result.environment,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('booking_payment.checkout_initialization_rejected', {
          code: error.code,
        });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('booking_payment.checkout_initialization_failed');
      throw new HttpsError('internal', 'Payment checkout could not be initialized.');
    }
  },
);
