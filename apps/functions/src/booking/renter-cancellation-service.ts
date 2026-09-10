import { createHash, randomUUID } from 'node:crypto';

import {
  cancelBookingCommandSchema,
  type CancelBookingResult,
  cancelRentalRequestCommandSchema,
  type CancelRentalRequestResult,
  quoteBookingCancellationCommandSchema,
  type QuoteBookingCancellationResult,
} from '@mmg/contracts/cancellation';

import { BookingCommandError } from './errors.js';

export type CancelRentalRequestInput = {
  renterId: string;
  requestId: string;
  expectedVersion: number;
  commandRequestId: string;
  requestHash: string;
  idempotencyDocumentId: string;
  now: Date;
};

export type QuoteBookingCancellationInput = {
  renterId: string;
  bookingId: string;
  now: Date;
};

export type CancelPaidBookingInput = {
  renterId: string;
  bookingId: string;
  expectedVersion: number;
  caseId: string;
  commandRequestId: string;
  requestHash: string;
  idempotencyDocumentId: string;
  now: Date;
};

export interface RenterCancellationRepository {
  cancelRentalRequest(input: CancelRentalRequestInput): Promise<CancelRentalRequestResult>;
  quoteBookingCancellation(input: QuoteBookingCancellationInput): Promise<QuoteBookingCancellationResult>;
  cancelPaidBooking(input: CancelPaidBookingInput): Promise<CancelBookingResult>;
  resolvePendingCancellations(now: Date): Promise<{ scanned: number; resolved: number; protected: number; invalid: number }>;
}

export type RenterCancellationDependencies = {
  repository: RenterCancellationRepository;
  now?: () => Date;
  createRequestId?: () => string;
  createCaseId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function idempotencyDocumentId(actorId: string, commandName: string, key: string): string {
  return stableHash({ actorId, commandName, key });
}

export async function cancelRentalRequest(
  untrustedCommand: unknown,
  renterId: string,
  dependencies: RenterCancellationDependencies,
): Promise<CancelRentalRequestResult> {
  if (!renterId) throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to cancel this request.');
  const parsed = cancelRentalRequestCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) throw new BookingCommandError('INVALID_ARGUMENT', 'Cancellation request is invalid.');
  const now = (dependencies.now ?? (() => new Date()))();
  return dependencies.repository.cancelRentalRequest({
    renterId,
    requestId: parsed.data.data.requestId,
    expectedVersion: parsed.data.data.expectedVersion,
    commandRequestId: (dependencies.createRequestId ?? randomUUID)(),
    requestHash: stableHash(parsed.data.data),
    idempotencyDocumentId: idempotencyDocumentId(renterId, 'cancelRentalRequest', parsed.data.idempotencyKey),
    now,
  });
}

export async function quoteBookingCancellation(
  untrustedCommand: unknown,
  renterId: string,
  dependencies: RenterCancellationDependencies,
): Promise<QuoteBookingCancellationResult> {
  if (!renterId) throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to review cancellation consequences.');
  const parsed = quoteBookingCancellationCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) throw new BookingCommandError('INVALID_ARGUMENT', 'Cancellation quote request is invalid.');
  return dependencies.repository.quoteBookingCancellation({
    renterId,
    bookingId: parsed.data.data.bookingId,
    now: (dependencies.now ?? (() => new Date()))(),
  });
}

export async function cancelPaidBooking(
  untrustedCommand: unknown,
  renterId: string,
  dependencies: RenterCancellationDependencies,
): Promise<CancelBookingResult> {
  if (!renterId) throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to cancel this booking.');
  const parsed = cancelBookingCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) throw new BookingCommandError('INVALID_ARGUMENT', 'Booking cancellation is invalid.');
  const now = (dependencies.now ?? (() => new Date()))();
  return dependencies.repository.cancelPaidBooking({
    renterId,
    bookingId: parsed.data.data.bookingId,
    expectedVersion: parsed.data.data.expectedVersion,
    caseId: (dependencies.createCaseId ?? randomUUID)(),
    commandRequestId: (dependencies.createRequestId ?? randomUUID)(),
    requestHash: stableHash(parsed.data.data),
    idempotencyDocumentId: idempotencyDocumentId(renterId, 'cancelBooking', parsed.data.idempotencyKey),
    now,
  });
}
