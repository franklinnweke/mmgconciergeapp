import { randomUUID } from 'node:crypto';

import {
  BookingCommandError,
  initializeBookingPaymentCommandSchema,
  initializeBookingPaymentResultSchema,
  type InitializeBookingPaymentResult,
  type PaymentPort,
} from '@mmg/contracts';
import { canTransitionBookingIntent } from '@mmg/domain';

import type { BookingRepository } from './booking-repository.js';
import { requireVerifiedRenter, type CallableAuth } from './callable-auth.js';

export type InitializeBookingPaymentDependencies = {
  repository: BookingRepository;
  paymentPort: PaymentPort;
  now?: () => Date;
  createRequestId?: () => string;
};

/**
 * Server-authoritative booking payment initialization service.
 * Validates renter authorization, checks intent state and expiry,
 * derives amountKobo and customer email securely on the server,
 * initializes the transaction with the payment gateway (Paystack),
 * and binds the resulting payment reference to the booking intent in 'checkout_pending' state.
 */
export async function initializeBookingPayment(
  untrustedCommand: unknown,
  authContext: CallableAuth,
  dependencies: InitializeBookingPaymentDependencies,
): Promise<InitializeBookingPaymentResult> {
  const renterId = requireVerifiedRenter(authContext);

  const parseResult = initializeBookingPaymentCommandSchema.safeParse(untrustedCommand);
  if (!parseResult.success) {
    throw new BookingCommandError(
      'INVALID_ARGUMENT',
      'The payment initialization command payload is malformed.',
    );
  }

  const { data } = parseResult.data;
  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();

  const userEmail = (authContext?.token?.email as string) || '';
  if (!userEmail || !userEmail.includes('@')) {
    throw new BookingCommandError(
      'INVALID_ARGUMENT',
      'A valid email address associated with your account is required to initialize payment.',
    );
  }

  // 1. First transaction: validate intent, state, ownership, and expiry, extract server amount
  const { amountKobo, callbackUrl } = await dependencies.repository.runTransaction(
    async (transaction) => {
      const intent = await transaction.getIntent(data.intentId);
      if (!intent) {
        throw new BookingCommandError('NOT_FOUND', 'Booking intent was not found.');
      }

      if (intent.renterId !== renterId) {
        throw new BookingCommandError(
          'FORBIDDEN',
          'You are not authorized to initialize payment for this booking intent.',
        );
      }

      if (!canTransitionBookingIntent(intent.state, 'checkout_pending')) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          `Cannot initialize payment for intent in state: ${intent.state}`,
        );
      }

      if (intent.expiresAt.getTime() <= now.getTime()) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          'Booking intent date hold has expired. Please select dates again.',
          { reason: 'expired' },
        );
      }

      const defaultCallback =
        process.env.PAYSTACK_CALLBACK_URL || 'mmgconcierge://payment/callback';

      return {
        amountKobo: intent.priceSnapshot.renterTotalKobo,
        callbackUrl: defaultCallback,
      };
    },
  );

  // 2. Gateway call: initialize transaction with Paystack (performed outside Firestore transaction)
  const paymentInit = await dependencies.paymentPort.initializePayment({
    intentId: data.intentId,
    amountKobo,
    email: userEmail,
    callbackUrl,
  });

  if (!paymentInit.authorizationUrl || !paymentInit.reference) {
    throw new BookingCommandError(
      'FAILED_PRECONDITION',
      paymentInit.message || 'Payment gateway did not provide an authorization URL.',
      { reason: 'payment_unavailable' },
    );
  }

  // 3. Second transaction: bind payment reference to intent and transition to checkout_pending
  await dependencies.repository.runTransaction(async (transaction) => {
    const intent = await transaction.getIntent(data.intentId);
    if (!intent) {
      throw new BookingCommandError('NOT_FOUND', 'Booking intent was not found.');
    }

    intent.paymentReference = paymentInit.reference;
    intent.state = 'checkout_pending';
    intent.updatedAt = now;

    transaction.updateIntent(intent);

    transaction.createAuditEvent({
      actorId: renterId,
      actorType: 'renter',
      entityId: intent.intentId,
      entityType: 'bookingIntent',
      eventType: 'booking_intent.checkout_initialized',
      fromState: 'intent_created',
      toState: 'checkout_pending',
      requestId,
      occurredAt: now,
      details: {
        reference: paymentInit.reference,
        environment: paymentInit.environment,
      },
    });
  });

  const responsePayload: InitializeBookingPaymentResult = {
    requestId,
    result: {
      intentId: data.intentId,
      reference: paymentInit.reference,
      authorizationUrl: paymentInit.authorizationUrl,
      environment: paymentInit.environment,
    },
  };

  return initializeBookingPaymentResultSchema.parse(responsePayload);
}
