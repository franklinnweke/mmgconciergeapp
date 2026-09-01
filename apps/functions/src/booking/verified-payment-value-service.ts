import { randomUUID } from 'node:crypto';

import {
  boundedIdSchema,
  trustedPaymentValueDeliveryResultSchema,
  type TrustedPaymentValueDeliveryResult,
} from '@mmg/contracts';

import { BookingCommandError } from './errors.js';

export type VerifiedPaymentValueIds = {
  bookingId: string;
  caseId: string;
  outboxEventId: string;
  requestId: string;
};

export interface VerifiedPaymentValueRepository {
  consumeVerifiedPayment(input: {
    eventId: string;
    ids: VerifiedPaymentValueIds;
    now: Date;
  }): Promise<TrustedPaymentValueDeliveryResult>;
}

export type DeliverVerifiedPaymentValueDependencies = {
  repository: VerifiedPaymentValueRepository;
  now?: () => Date;
  createId?: () => string;
  createRequestId?: () => string;
};

/**
 * Consume durable R3 verification evidence into booking value.
 *
 * The only input is a persisted payment-event document ID. Provider reference,
 * amount, currency, payment state, dates and booking state are intentionally not
 * accepted here; the transactional repository re-reads those trusted facts.
 */
export async function deliverVerifiedPaymentValue(
  untrustedEventId: unknown,
  dependencies: DeliverVerifiedPaymentValueDependencies,
): Promise<TrustedPaymentValueDeliveryResult> {
  const parsedEventId = boundedIdSchema.safeParse(untrustedEventId);
  if (!parsedEventId.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Verified payment event ID is invalid.');
  }

  const createId = dependencies.createId ?? randomUUID;
  const ids: VerifiedPaymentValueIds = {
    bookingId: createId(),
    caseId: createId(),
    outboxEventId: createId(),
    requestId: (dependencies.createRequestId ?? randomUUID)(),
  };
  const result = await dependencies.repository.consumeVerifiedPayment({
    eventId: parsedEventId.data,
    ids,
    now: (dependencies.now ?? (() => new Date()))(),
  });

  const parsedResult = trustedPaymentValueDeliveryResultSchema.safeParse(result);
  if (!parsedResult.success) {
    throw new BookingCommandError(
      'FAILED_PRECONDITION',
      'Trusted payment value delivery returned an invalid result.',
    );
  }
  return parsedResult.data;
}
