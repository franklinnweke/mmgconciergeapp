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

export async function reportTripEnded(
  rawCommand: unknown,
  actor: TripReportEndedActor,
  dependencies: {
    repository?: FirestoreOwnerEarningsRepository;
    now?: () => Date;
  } = {},
) {
  const command = reportTripEndedCommandSchema.parse(rawCommand);
  const repository = dependencies.repository ?? new FirestoreOwnerEarningsRepository();
  const now = dependencies.now ? dependencies.now() : new Date();

  return repository.reportTripEnded(command.data.bookingId, actor, now);
}

export async function confirmBookingCompletion(
  rawCommand: unknown,
  actor: TripCompletionActor,
  dependencies: {
    repository?: FirestoreOwnerEarningsRepository;
    now?: () => Date;
  } = {},
) {
  const command = confirmBookingCompletionCommandSchema.parse(rawCommand);
  const repository = dependencies.repository ?? new FirestoreOwnerEarningsRepository();
  const now = dependencies.now ? dependencies.now() : new Date();

  return repository.confirmBookingCompletion(command.data.bookingId, actor, now);
}

export async function setOwnerSettlementHold(
  rawCommand: unknown,
  actor: SettlementHoldActor,
  dependencies: {
    repository?: FirestoreOwnerEarningsRepository;
    now?: () => Date;
  } = {},
) {
  const command = setOwnerSettlementHoldCommandSchema.parse(rawCommand);
  const repository = dependencies.repository ?? new FirestoreOwnerEarningsRepository();
  const now = dependencies.now ? dependencies.now() : new Date();

  return repository.setOwnerSettlementHold(command.data, actor, now);
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
