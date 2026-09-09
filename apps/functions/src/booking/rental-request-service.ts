import { createHash, randomUUID } from 'node:crypto';

import {
  approveRentalRequestCommandSchema,
  type ApproveRentalRequestResult,
  createRentalRequestCommandSchema,
  type CreateRentalRequestResult,
  declineRentalRequestCommandSchema,
  type DeclineRentalRequestResult,
  releaseRentalRequestPaymentHoldCommandSchema,
  type ReleaseRentalRequestPaymentHoldResult,
} from '@mmg/contracts/rental-request';

import { BookingCommandError } from './errors.js';

export const RENTAL_REQUEST_PAYMENT_WINDOW_MINUTES = 30;

export type RentalRequestDecisionActor = {
  uid: string;
  isStaff: boolean;
};

export type CreateRentalRequestInput = {
  renterId: string;
  requestId: string;
  commandRequestId: string;
  requestHash: string;
  idempotencyDocumentId: string;
  data: ReturnType<typeof createRentalRequestCommandSchema.parse>['data'];
  now: Date;
};

export type DecideRentalRequestInput = {
  actor: RentalRequestDecisionActor;
  requestId: string;
  expectedVersion: number;
  commandRequestId: string;
  requestHash: string;
  idempotencyDocumentId: string;
  now: Date;
  intentId?: string;
  holdExpiresAt?: Date;
  reason?: string;
};

export type ReleaseRentalRequestPaymentHoldInput = {
  renterId: string;
  requestId: string;
  commandRequestId: string;
  requestHash: string;
  idempotencyDocumentId: string;
  now: Date;
};

export interface RentalRequestRepository {
  createRequest(input: CreateRentalRequestInput): Promise<CreateRentalRequestResult>;
  approveRequest(input: DecideRentalRequestInput & { intentId: string; holdExpiresAt: Date }): Promise<ApproveRentalRequestResult>;
  declineRequest(input: DecideRentalRequestInput): Promise<DeclineRentalRequestResult>;
  releasePaymentHold(input: ReleaseRentalRequestPaymentHoldInput): Promise<ReleaseRentalRequestPaymentHoldResult>;
  expirePaymentWindows(now: Date): Promise<{ scanned: number; expired: number }>;
}

export type RentalRequestDependencies = {
  repository: RentalRequestRepository;
  now?: () => Date;
  createId?: () => string;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function idempotencyDocumentId(actorId: string, commandName: string, key: string): string {
  return stableHash({ actorId, commandName, key });
}

export async function createRentalRequest(
  untrustedCommand: unknown,
  renterId: string,
  dependencies: RentalRequestDependencies,
): Promise<CreateRentalRequestResult> {
  if (!renterId) throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to request a vehicle.');
  const parsed = createRentalRequestCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) throw new BookingCommandError('INVALID_ARGUMENT', 'Rental request is invalid.');

  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createId ?? randomUUID)();
  const commandRequestId = (dependencies.createRequestId ?? randomUUID)();
  return dependencies.repository.createRequest({
    renterId,
    requestId,
    commandRequestId,
    requestHash: stableHash(parsed.data.data),
    idempotencyDocumentId: idempotencyDocumentId(renterId, 'createRentalRequest', parsed.data.idempotencyKey),
    data: parsed.data.data,
    now,
  });
}

export async function approveRentalRequest(
  untrustedCommand: unknown,
  actor: RentalRequestDecisionActor,
  dependencies: RentalRequestDependencies,
): Promise<ApproveRentalRequestResult> {
  const parsed = approveRentalRequestCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) throw new BookingCommandError('INVALID_ARGUMENT', 'Rental request approval is invalid.');
  const now = (dependencies.now ?? (() => new Date()))();
  const intentId = (dependencies.createId ?? randomUUID)();
  const commandRequestId = (dependencies.createRequestId ?? randomUUID)();
  const holdExpiresAt = new Date(now.getTime() + RENTAL_REQUEST_PAYMENT_WINDOW_MINUTES * 60 * 1000);
  return dependencies.repository.approveRequest({
    actor,
    requestId: parsed.data.data.requestId,
    expectedVersion: parsed.data.data.expectedVersion,
    commandRequestId,
    requestHash: stableHash(parsed.data.data),
    idempotencyDocumentId: idempotencyDocumentId(actor.uid, 'approveRentalRequest', parsed.data.idempotencyKey),
    now,
    intentId,
    holdExpiresAt,
  });
}

export async function declineRentalRequest(
  untrustedCommand: unknown,
  actor: RentalRequestDecisionActor,
  dependencies: RentalRequestDependencies,
): Promise<DeclineRentalRequestResult> {
  const parsed = declineRentalRequestCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) throw new BookingCommandError('INVALID_ARGUMENT', 'Rental request decline is invalid.');
  const now = (dependencies.now ?? (() => new Date()))();
  const commandRequestId = (dependencies.createRequestId ?? randomUUID)();
  return dependencies.repository.declineRequest({
    actor,
    requestId: parsed.data.data.requestId,
    expectedVersion: parsed.data.data.expectedVersion,
    reason: parsed.data.data.reason,
    commandRequestId,
    requestHash: stableHash(parsed.data.data),
    idempotencyDocumentId: idempotencyDocumentId(actor.uid, 'declineRentalRequest', parsed.data.idempotencyKey),
    now,
  });
}

export async function releaseRentalRequestPaymentHold(
  untrustedCommand: unknown,
  renterId: string,
  dependencies: RentalRequestDependencies,
): Promise<ReleaseRentalRequestPaymentHoldResult> {
  const parsed = releaseRentalRequestPaymentHoldCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) throw new BookingCommandError('INVALID_ARGUMENT', 'Payment-window release is invalid.');
  const now = (dependencies.now ?? (() => new Date()))();
  const commandRequestId = (dependencies.createRequestId ?? randomUUID)();
  return dependencies.repository.releasePaymentHold({
    renterId,
    requestId: parsed.data.data.requestId,
    commandRequestId,
    requestHash: stableHash(parsed.data.data),
    idempotencyDocumentId: idempotencyDocumentId(renterId, 'releaseRentalRequestPaymentHold', parsed.data.idempotencyKey),
    now,
  });
}
