import { createHash, randomUUID } from 'node:crypto';

import {
  initializeBookingPaymentCommandSchema,
  initializeBookingPaymentResultSchema,
  paymentReferenceSchema,
  type InitializeBookingPaymentResult,
} from '@mmg/contracts/payment';

import { BookingCommandError } from './errors.js';
import type { PaymentGateway } from './payment-gateway.js';

export type CheckoutRenter = {
  uid: string;
  email: string;
};

export type PaymentInitializationReservation =
  | {
      kind: 'replay';
      result: InitializeBookingPaymentResult;
    }
  | {
      kind: 'ready';
      paymentId: string;
      intentId: string;
      reference: string;
      email: string;
      amountKobo: number;
      currency: 'NGN';
      holdExpiresAt: Date;
    };

export type ReservePaymentInitializationInput = {
  actor: CheckoutRenter;
  intentId: string;
  paymentId: string;
  reference: string;
  requestId: string;
  requestHash: string;
  idempotencyDocumentId: string;
  now: Date;
  leaseExpiresAt: Date;
};

export type CompletePaymentInitializationInput = {
  actor: CheckoutRenter;
  reservation: Extract<PaymentInitializationReservation, { kind: 'ready' }>;
  providerResult: Awaited<ReturnType<PaymentGateway['initializePayment']>>;
  requestId: string;
  requestHash: string;
  idempotencyDocumentId: string;
  now: Date;
};

export interface BookingPaymentInitializationRepository {
  reserveInitialization(input: ReservePaymentInitializationInput): Promise<PaymentInitializationReservation>;
  completeInitialization(input: CompletePaymentInitializationInput): Promise<InitializeBookingPaymentResult>;
  releaseInitializationLease(paymentId: string, requestId: string, now: Date): Promise<void>;
}

export type InitializeBookingPaymentDependencies = {
  repository: BookingPaymentInitializationRepository;
  paymentGateway: PaymentGateway;
  now?: () => Date;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildPaymentIdentity(renterId: string, intentId: string): {
  paymentId: string;
  reference: string;
} {
  const digest = stableHash({ renterId, intentId });
  const paymentId = `payment-${digest.slice(0, 40)}`;
  const reference = paymentReferenceSchema.parse(`mmg-${digest.slice(0, 48)}`);
  return { paymentId, reference };
}

export async function initializeBookingPayment(
  untrustedCommand: unknown,
  actor: CheckoutRenter,
  dependencies: InitializeBookingPaymentDependencies,
): Promise<InitializeBookingPaymentResult> {
  const parsed = initializeBookingPaymentCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Payment initialization request is invalid.');
  }

  if (!actor.uid || !actor.email) {
    throw new BookingCommandError(
      'PROFILE_INCOMPLETE',
      'Complete your verified renter profile before checkout.',
    );
  }

  const command = parsed.data;
  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocumentId = stableHash({
    actorId: actor.uid,
    commandName: 'initializeBookingPayment',
    idempotencyKey: command.idempotencyKey,
  });
  const { paymentId, reference } = buildPaymentIdentity(actor.uid, command.data.intentId);

  const reservation = await dependencies.repository.reserveInitialization({
    actor,
    intentId: command.data.intentId,
    paymentId,
    reference,
    requestId,
    requestHash,
    idempotencyDocumentId,
    now,
    leaseExpiresAt: new Date(now.getTime() + 30_000),
  });

  if (reservation.kind === 'replay') {
    const result = initializeBookingPaymentResultSchema.parse(reservation.result);
    if (new Date(result.result.holdExpiresAt).getTime() <= now.getTime()) {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        'The checkout hold has expired. Start a new booking attempt.',
        { reason: 'expired' },
      );
    }
    return result;
  }

  let providerResult: Awaited<ReturnType<PaymentGateway['initializePayment']>>;
  try {
    providerResult = await dependencies.paymentGateway.initializePayment({
      reference: reservation.reference,
      email: reservation.email,
      amountKobo: reservation.amountKobo,
      currency: reservation.currency,
      metadata: { intentId: reservation.intentId },
    });
  } catch (error) {
    await dependencies.repository.releaseInitializationLease(
      reservation.paymentId,
      requestId,
      (dependencies.now ?? (() => new Date()))(),
    );
    throw error;
  }

  if (providerResult.reference !== reservation.reference) {
    throw new BookingCommandError(
      'FAILED_PRECONDITION',
      'Payment provider reference does not match the reserved booking payment.',
    );
  }

  return dependencies.repository.completeInitialization({
    actor,
    reservation,
    providerResult,
    requestId,
    requestHash,
    idempotencyDocumentId,
    now: (dependencies.now ?? (() => new Date()))(),
  });
}
