import {
  reconcilePaymentResultSchema,
  type ReconcilePaymentResult,
  type TrustedPaymentValueDeliveryResult,
} from '@mmg/contracts/payment';

import { BookingCommandError } from './errors.js';
import type { PaymentGateway } from './payment-gateway.js';
import {
  processPaymentEvent,
  reconcilePayment,
  type PaymentVerificationCompletion,
  type PaymentVerificationRepository,
} from './payment-verification-service.js';
import {
  deliverVerifiedPaymentValue,
  type VerifiedPaymentValueRepository,
} from './verified-payment-value-service.js';

export type PaymentValueOrchestrationDependencies = {
  verificationRepository: PaymentVerificationRepository;
  paymentGateway: PaymentGateway;
  valueRepository: VerifiedPaymentValueRepository;
  now?: () => Date;
  createId?: () => string;
  createRequestId?: () => string;
};

export type ProcessAndDeliverPaymentEventResult = {
  verification: PaymentVerificationCompletion | null;
  delivery: TrustedPaymentValueDeliveryResult | null;
};

async function deliverIfVerified(
  eventId: string,
  dependencies: PaymentValueOrchestrationDependencies,
): Promise<TrustedPaymentValueDeliveryResult | null> {
  const storedEvent = await dependencies.verificationRepository.getEvent(eventId);
  if (!storedEvent || storedEvent.status !== 'verified_success') return null;

  return deliverVerifiedPaymentValue(eventId, {
    repository: dependencies.valueRepository,
    now: dependencies.now,
    createId: dependencies.createId,
    createRequestId: dependencies.createRequestId,
  });
}

/**
 * Retry-safe event orchestration.
 *
 * R3 may have committed `verified_success` before a previous invocation crashed.
 * Re-reading durable event state after `processPaymentEvent` means a retry still
 * reaches R4 even when R3 itself returns a terminal-event no-op.
 */
export async function processAndDeliverPaymentEvent(
  eventId: string,
  dependencies: PaymentValueOrchestrationDependencies,
): Promise<ProcessAndDeliverPaymentEventResult> {
  const verification = await processPaymentEvent(eventId, {
    repository: dependencies.verificationRepository,
    paymentGateway: dependencies.paymentGateway,
    now: dependencies.now,
  });
  const delivery = await deliverIfVerified(eventId, dependencies);
  return { verification, delivery };
}

/**
 * Renter reconciliation uses the same trusted R3 -> R4 processor. The client
 * still supplies only the intent ID; reference, amount, provider facts and value
 * transition all remain server-authoritative.
 */
export async function reconcileAndDeliverPayment(
  untrustedCommand: unknown,
  renterId: string,
  dependencies: PaymentValueOrchestrationDependencies,
): Promise<ReconcilePaymentResult> {
  const reconciliation = await reconcilePayment(untrustedCommand, renterId, {
    repository: dependencies.verificationRepository,
    paymentGateway: dependencies.paymentGateway,
    now: dependencies.now,
    createRequestId: dependencies.createRequestId,
  });

  if (reconciliation.result.verification !== 'verified_success') {
    return reconciliation;
  }

  const delivery = await deliverIfVerified(reconciliation.result.eventId, dependencies);
  if (!delivery) {
    throw new BookingCommandError(
      'FAILED_PRECONDITION',
      'Verified payment could not be delivered into booking value.',
    );
  }
  if (
    delivery.paymentId !== reconciliation.result.paymentId ||
    delivery.intentId !== reconciliation.result.intentId
  ) {
    throw new BookingCommandError(
      'FAILED_PRECONDITION',
      'Verified payment delivery does not match the reconciled payment.',
    );
  }

  return reconcilePaymentResultSchema.parse({
    requestId: reconciliation.requestId,
    result: {
      ...reconciliation.result,
      paymentState: 'succeeded',
      valueDeliveryOutcome: delivery.outcome,
    },
  });
}
