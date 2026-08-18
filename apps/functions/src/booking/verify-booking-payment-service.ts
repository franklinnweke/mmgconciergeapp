import { randomUUID } from 'node:crypto';

import {
  BookingCommandError,
  verifyBookingPaymentCommandSchema,
  verifyBookingPaymentResultSchema,
  type PaymentPort,
  type VerifyBookingPaymentResult,
} from '@mmg/contracts';

import type { BookingRepository, StoredBookingRecord } from './booking-repository.js';
import { requireVerifiedRenter, type CallableAuth } from './callable-auth.js';
import { processPaidBookingEvent } from './process-paid-booking-event-service.js';

export type VerifyBookingPaymentDependencies = {
  repository: BookingRepository;
  paymentPort: PaymentPort;
  now?: () => Date;
  createId?: () => string;
  createRequestId?: () => string;
  ownerSlaHours?: number;
};

/**
 * Server-authoritative payment verification service.
 * Strictly verifies the transaction reference with the payment gateway (Paystack),
 * validates that the paid amount matches the server-priced quote in integer kobo,
 * validates that the payment reference matches the reference bound to the intent,
 * and atomically transitions the booking intent to 'paid' and creates a 'paid_pending_owner' booking.
 */
export async function verifyBookingPayment(
  untrustedCommand: unknown,
  authContext: CallableAuth,
  dependencies: VerifyBookingPaymentDependencies,
): Promise<VerifyBookingPaymentResult> {
  const renterId = requireVerifiedRenter(authContext);

  const parseResult = verifyBookingPaymentCommandSchema.safeParse(untrustedCommand);
  if (!parseResult.success) {
    throw new BookingCommandError(
      'INVALID_ARGUMENT',
      'The payment verification command payload is malformed.',
    );
  }

  const { data } = parseResult.data;
  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();

  // 1. Authoritatively verify with Payment Gateway (Paystack)
  const verification = await dependencies.paymentPort.verifyPayment({
    reference: data.paymentReference,
  });

  if (verification.status !== 'succeeded') {
    throw new BookingCommandError(
      'FAILED_PRECONDITION',
      verification.gatewayResponse || 'Payment verification failed at Paystack.',
    );
  }

  if (typeof verification.amountKobo !== 'number' || verification.amountKobo <= 0) {
    throw new BookingCommandError(
      'FAILED_PRECONDITION',
      'Payment verification did not return a valid amount.',
    );
  }

  const paidAmountKobo = verification.amountKobo;
  const paidAtIso = verification.paidAtIso || now.toISOString();

  // 2. Fetch intent inside transaction to verify ownership, reference binding, and match exact amount
  const booking: StoredBookingRecord = await dependencies.repository.runTransaction(
    async (transaction) => {
      const intent = await transaction.getIntent(data.intentId);
      if (!intent) {
        throw new BookingCommandError('NOT_FOUND', 'Booking intent was not found.');
      }

      if (intent.renterId !== renterId) {
        throw new BookingCommandError(
          'FORBIDDEN',
          'You are not authorized to verify payment for this booking intent.',
        );
      }

      // Bind reference check to prevent replay of arbitrary payment references
      if (intent.paymentReference && intent.paymentReference !== data.paymentReference) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          'Payment reference does not match the reference initialized for this booking intent.',
          { reason: 'payment_reference_mismatch' },
        );
      }

      if (paidAmountKobo !== intent.priceSnapshot.renterTotalKobo) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          `Verified paid amount (${paidAmountKobo} kobo) does not match required quote total (${intent.priceSnapshot.renterTotalKobo} kobo).`,
        );
      }

      // Delegate state transition and booking record creation atomically
      return processPaidBookingEvent(
        {
          intentId: data.intentId,
          paymentReference: data.paymentReference,
          amountKobo: paidAmountKobo,
          paymentEnvironment: verification.environment,
          paidAtIso,
        },
        {
          repository: {
            runTransaction: async (cb) => cb(transaction),
          },
          now: dependencies.now,
          createId: dependencies.createId,
          createRequestId: () => requestId,
          ownerSlaHours: dependencies.ownerSlaHours,
        },
      );
    },
  );

  const result: VerifyBookingPaymentResult = {
    requestId,
    result: {
      bookingId: booking.bookingId,
      intentId: booking.intentId,
      state: booking.state,
      renterTotalKobo: booking.priceSnapshot.renterTotalKobo,
      paymentReference: data.paymentReference,
      paymentEnvironment: verification.environment,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
    },
  };

  return verifyBookingPaymentResultSchema.parse(result);
}
