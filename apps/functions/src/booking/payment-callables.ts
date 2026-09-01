import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';

import { requireCheckoutRenter, requireVerifiedRenter } from './callable-auth.js';
import { CommandError } from '../errors.js';
import { FirestoreBookingPaymentInitializationRepository } from './firestore-booking-payment-initialization-repository.js';
import { FirestorePaymentVerificationRepository } from './firestore-payment-verification-repository.js';
import { FirestoreVerifiedPaymentValueRepository } from './firestore-verified-payment-value-repository.js';
import { initializeBookingPayment as initializeBookingPaymentService } from './initialize-booking-payment-service.js';
import { PaystackPaymentAdapter } from './paystack-payment-adapter.js';
import {
  ingestPaystackWebhook,
  MAX_PAYSTACK_WEBHOOK_BYTES,
} from './paystack-webhook-service.js';
import {
  processAndDeliverPaymentEvent as processAndDeliverPaymentEventService,
  reconcileAndDeliverPayment as reconcileAndDeliverPaymentService,
} from './payment-value-orchestration-service.js';

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

function testPaymentGateway(): PaystackPaymentAdapter {
  return new PaystackPaymentAdapter({
    secretKey: paystackSecret.value(),
    // WP4 development integration is intentionally test-mode only. Enabling
    // live credentials requires a separate controlled-production change.
    requiredEnvironment: 'test',
  });
}

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
      const result = await initializeBookingPaymentService(request.data, actor, {
        repository,
        paymentGateway: testPaymentGateway(),
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

export const paystackWebhook = onRequest(
  {
    region: 'africa-south1',
    invoker: 'public',
    timeoutSeconds: 15,
    memory: '256MiB',
    secrets: [paystackSecret],
    cors: false,
  },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).set('Allow', 'POST').send('Method Not Allowed');
      return;
    }

    const declaredLength = Number(request.header('content-length') ?? '0');
    if (
      (Number.isFinite(declaredLength) && declaredLength > MAX_PAYSTACK_WEBHOOK_BYTES) ||
      request.rawBody.length > MAX_PAYSTACK_WEBHOOK_BYTES
    ) {
      response.status(413).send('Payload Too Large');
      return;
    }

    try {
      const repository = new FirestorePaymentVerificationRepository();
      const result = await ingestPaystackWebhook(
        request.rawBody,
        request.header('x-paystack-signature'),
        paystackSecret.value(),
        repository,
        { requiredEnvironment: 'test' },
      );
      logger.info('booking_payment.webhook_ingested', {
        status: result.status,
        ...(result.status === 'stored' || result.status === 'duplicate'
          ? { eventId: result.eventId }
          : {}),
      });
      response.status(200).json({ received: true, status: result.status });
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('booking_payment.webhook_rejected', { code: error.code });
        if (error.code === 'CONFIGURATION_UNAVAILABLE') {
          response.status(503).send('Webhook unavailable');
        } else if (error.code === 'FORBIDDEN') {
          response.status(401).send('Invalid signature');
        } else if (error.code === 'INVALID_ARGUMENT') {
          response.status(400).send('Invalid webhook');
        } else {
          response.status(500).send('Webhook processing failed');
        }
        return;
      }
      logger.error('booking_payment.webhook_failed');
      response.status(500).send('Webhook processing failed');
    }
  },
);

export const processPaystackPaymentEvent = onDocumentCreated(
  {
    document: 'paymentEvents/{eventId}',
    region: 'africa-south1',
    retry: true,
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [paystackSecret],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot || snapshot.data()?.source !== 'webhook') return;

    const eventId = event.params.eventId;
    const verificationRepository = new FirestorePaymentVerificationRepository();
    const valueRepository = new FirestoreVerifiedPaymentValueRepository();
    try {
      const result = await processAndDeliverPaymentEventService(eventId, {
        verificationRepository,
        paymentGateway: testPaymentGateway(),
        valueRepository,
      });
      logger.info('booking_payment.webhook_processed', {
        eventId,
        verification: result.verification?.verification ?? 'durable_replay',
        providerStatus: result.verification?.providerStatus,
        valueDeliveryOutcome: result.delivery?.outcome,
        paymentId: result.delivery?.paymentId,
        intentId: result.delivery?.intentId,
      });
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('booking_payment.webhook_processing_failed', {
          eventId,
          code: error.code,
        });
      } else {
        logger.error('booking_payment.webhook_processing_failed', { eventId });
      }
      // Provider failures and transactional conflicts remain retryable. Durable
      // terminal verification/value outcomes are idempotent on retry.
      throw error;
    }
  },
);

export const reconcilePayment = onCall(
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
      const renterId = requireVerifiedRenter(request.auth);
      const verificationRepository = new FirestorePaymentVerificationRepository();
      const valueRepository = new FirestoreVerifiedPaymentValueRepository();
      const result = await reconcileAndDeliverPaymentService(request.data, renterId, {
        verificationRepository,
        paymentGateway: testPaymentGateway(),
        valueRepository,
      });
      logger.info('booking_payment.reconciled', {
        requestId: result.requestId,
        eventId: result.result.eventId,
        intentId: result.result.intentId,
        paymentId: result.result.paymentId,
        paymentState: result.result.paymentState,
        providerStatus: result.result.providerStatus,
        verification: result.result.verification,
        valueDeliveryOutcome: result.result.valueDeliveryOutcome,
      });
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        logger.warn('booking_payment.reconciliation_rejected', { code: error.code });
        throw new HttpsError(httpsCodeByDomainCode[error.code], error.message, {
          code: error.code,
          ...error.safeDetails,
        });
      }
      logger.error('booking_payment.reconciliation_failed');
      throw new HttpsError('internal', 'Payment status could not be reconciled.');
    }
  },
);
