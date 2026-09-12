import { createHash, randomUUID } from 'node:crypto';

import {
  approveRentalRequestCommandSchema,
  type ApproveRentalRequestResult,
  createRentalRequestCommandSchema,
  type CreateRentalRequestResult,
  declineRentalRequestCommandSchema,
  type DeclineRentalRequestResult,
  openRentalRequestPaymentWindowCommandSchema,
  type OpenRentalRequestPaymentWindowResult,
  releaseRentalRequestPaymentHoldCommandSchema,
  type ReleaseRentalRequestPaymentHoldResult,
} from '@mmg/contracts/rental-request';

import { BookingCommandError } from './errors.js';

export const RENTAL_REQUEST_PAYMENT_WINDOW_MINUTES = 30;

export type RentalRequestDecisionActor = {
  uid: string;
  isStaff: boolean;
  role?: 'support' | 'super_admin';
};

export type RentalRequestStaffActor = {
  uid: string;
  role: 'support' | 'super_admin';
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
  reason?: string;
};

export type OpenRentalRequestPaymentWindowInput = {
  actor: RentalRequestStaffActor;
  requestId: string;
  expectedVersion: number;
  intentId: string;
  holdExpiresAt: Date;
  commandRequestId: string;
  requestHash: string;
  idempotencyDocumentId: string;
  now: Date;
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
  approveRequest(input: DecideRentalRequestInput): Promise<ApproveRentalRequestResult>;
  openPaymentWindow(input: OpenRentalRequestPaymentWindowInput): Promise<OpenRentalRequestPaymentWindowResult>;
  declineRequest(input: DecideRentalRequestInput): Promise<DeclineRentalRequestResult>;
  releasePaymentHold(input: ReleaseRentalRequestPaymentHoldInput): Promise<ReleaseRentalRequestPaymentHoldResult>;
  expirePaymentWindows(now: Date): Promise<{ scanned: number; expired: number; protected: number; invalid: number }>;
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
  if (!parsed.success) throw new BookingCommandError('INVALID_ARGUMENT', parsed.error.issues[0]?.message || 'Rental request is invalid.');
  const now = (dependencies.now ?? (() => new Date()))();
  return dependencies.repository.createRequest({
    renterId,
    requestId: (dependencies.createId ?? randomUUID)(),
    commandRequestId: (dependencies.createRequestId ?? randomUUID)(),
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
  return dependencies.repository.approveRequest({
    actor,
    requestId: parsed.data.data.requestId,
    expectedVersion: parsed.data.data.expectedVersion,
    commandRequestId: (dependencies.createRequestId ?? randomUUID)(),
    requestHash: stableHash(parsed.data.data),
    idempotencyDocumentId: idempotencyDocumentId(actor.uid, 'approveRentalRequest', parsed.data.idempotencyKey),
    now,
  });
}

export async function openRentalRequestPaymentWindow(
  untrustedCommand: unknown,
  actor: RentalRequestStaffActor,
  dependencies: RentalRequestDependencies,
): Promise<OpenRentalRequestPaymentWindowResult> {
  const parsed = openRentalRequestPaymentWindowCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) throw new BookingCommandError('INVALID_ARGUMENT', 'Payment-window request is invalid.');
  const now = (dependencies.now ?? (() => new Date()))();
  return dependencies.repository.openPaymentWindow({
    actor,
    requestId: parsed.data.data.requestId,
    expectedVersion: parsed.data.data.expectedVersion,
    intentId: (dependencies.createId ?? randomUUID)(),
    holdExpiresAt: new Date(now.getTime() + RENTAL_REQUEST_PAYMENT_WINDOW_MINUTES * 60 * 1000),
    commandRequestId: (dependencies.createRequestId ?? randomUUID)(),
    requestHash: stableHash(parsed.data.data),
    idempotencyDocumentId: idempotencyDocumentId(actor.uid, 'openRentalRequestPaymentWindow', parsed.data.idempotencyKey),
    now,
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
  return dependencies.repository.declineRequest({
    actor,
    requestId: parsed.data.data.requestId,
    expectedVersion: parsed.data.data.expectedVersion,
    reason: parsed.data.data.reason,
    commandRequestId: (dependencies.createRequestId ?? randomUUID)(),
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
  return dependencies.repository.releasePaymentHold({
    renterId,
    requestId: parsed.data.data.requestId,
    commandRequestId: (dependencies.createRequestId ?? randomUUID)(),
    requestHash: stableHash(parsed.data.data),
    idempotencyDocumentId: idempotencyDocumentId(renterId, 'releaseRentalRequestPaymentHold', parsed.data.idempotencyKey),
    now,
  });
}
