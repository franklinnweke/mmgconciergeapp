import { createHash, randomUUID } from 'node:crypto';

import { BookingCommandError } from '@mmg/contracts';
import {
  confirmBookingCompletionCommandSchema,
  reportTripEndedCommandSchema,
  setOwnerSettlementHoldCommandSchema,
} from '@mmg/contracts/earnings';

import { FirestoreOwnerEarningsRepository } from './firestore-owner-earnings-repository.js';
import type {
  SettlementHoldActor,
  TripCompletionActor,
  TripReportEndedActor,
} from './types.js';

export function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function idempotencyDocumentId(actorId: string, commandName: string, key: string): string {
  return stableHash({ actorId, commandName, key });
}

export type OwnerEarningsServiceDependencies = {
  repository?: FirestoreOwnerEarningsRepository;
  now?: () => Date;
  createRequestId?: () => string;
};

export async function reportTripEnded(
  rawCommand: unknown,
  actor: TripReportEndedActor,
  dependencies: OwnerEarningsServiceDependencies = {},
) {
  const parsed = reportTripEndedCommandSchema.safeParse(rawCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Invalid trip end report command.', {
      issues: parsed.error.issues,
    });
  }

  const repository = dependencies.repository ?? new FirestoreOwnerEarningsRepository();
  const now = dependencies.now ? dependencies.now() : new Date();
  const commandRequestId = (dependencies.createRequestId ?? randomUUID)();

  return repository.reportTripEnded({
    bookingId: parsed.data.data.bookingId,
    actor,
    commandRequestId,
    requestHash: stableHash(parsed.data.data),
    idempotencyDocumentId: idempotencyDocumentId(actor.uid, 'reportTripEnded', parsed.data.idempotencyKey),
    now,
  });
}

export async function confirmBookingCompletion(
  rawCommand: unknown,
  actor: TripCompletionActor,
  dependencies: OwnerEarningsServiceDependencies = {},
) {
  const parsed = confirmBookingCompletionCommandSchema.safeParse(rawCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Invalid booking completion confirmation command.', {
      issues: parsed.error.issues,
    });
  }

  const repository = dependencies.repository ?? new FirestoreOwnerEarningsRepository();
  const now = dependencies.now ? dependencies.now() : new Date();
  const commandRequestId = (dependencies.createRequestId ?? randomUUID)();

  return repository.confirmBookingCompletion({
    bookingId: parsed.data.data.bookingId,
    actor,
    commandRequestId,
    requestHash: stableHash(parsed.data.data),
    idempotencyDocumentId: idempotencyDocumentId(actor.uid, 'confirmBookingCompletion', parsed.data.idempotencyKey),
    now,
  });
}

export async function setOwnerSettlementHold(
  rawCommand: unknown,
  actor: SettlementHoldActor,
  dependencies: OwnerEarningsServiceDependencies = {},
) {
  const parsed = setOwnerSettlementHoldCommandSchema.safeParse(rawCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Invalid owner settlement hold command.', {
      issues: parsed.error.issues,
    });
  }

  const repository = dependencies.repository ?? new FirestoreOwnerEarningsRepository();
  const now = dependencies.now ? dependencies.now() : new Date();
  const commandRequestId = (dependencies.createRequestId ?? randomUUID)();

  return repository.setOwnerSettlementHold({
    ownerId: parsed.data.data.ownerId,
    hold: parsed.data.data.hold,
    reason: parsed.data.data.reason,
    actor,
    commandRequestId,
    requestHash: stableHash(parsed.data.data),
    idempotencyDocumentId: idempotencyDocumentId(actor.uid, 'setOwnerSettlementHold', parsed.data.idempotencyKey),
    now,
  });
}

export async function progressBookingLifecycle(
  dependencies: {
    repository?: FirestoreOwnerEarningsRepository;
    now?: () => Date;
    batchLimit?: number;
  } = {},
) {
  const repository = dependencies.repository ?? new FirestoreOwnerEarningsRepository();
  const now = dependencies.now ? dependencies.now() : new Date();

  return repository.progressBookingLifecycle(now, dependencies.batchLimit);
}
