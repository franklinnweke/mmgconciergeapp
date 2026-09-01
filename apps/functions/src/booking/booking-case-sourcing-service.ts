import { createHash, randomUUID } from 'node:crypto';

import {
  startBookingCaseSourcingCommandSchema,
  startBookingCaseSourcingResultSchema,
  type BookingCaseStatus,
  type BookingCaseType,
  type StartBookingCaseSourcingResult,
} from '@mmg/contracts/booking-case';

import { BookingCommandError } from './errors.js';

export type BookingOperationsActor = {
  uid: string;
  role: 'support' | 'super_admin';
};

export type StoredBookingInterventionCase = {
  caseId: string;
  type: BookingCaseType;
  status: BookingCaseStatus;
  version: number;
};

export type StoredBookingCaseIdempotency = {
  requestHash: string;
  result: unknown;
};

export interface BookingCaseSourcingTransaction {
  getIdempotency(documentId: string): Promise<StoredBookingCaseIdempotency | null>;
  getCase(caseId: string): Promise<StoredBookingInterventionCase | null>;
  updateCase(input: {
    caseId: string;
    version: number;
    actor: BookingOperationsActor;
    updatedAt: Date;
  }): void;
  createDomainAudit(input: {
    caseId: string;
    actor: BookingOperationsActor;
    requestId: string;
    updatedAt: Date;
  }): void;
  createAdminAudit(input: {
    caseId: string;
    actor: BookingOperationsActor;
    requestId: string;
    fromStatus: 'open';
    toStatus: 'sourcing_alternative';
    updatedAt: Date;
  }): void;
  saveIdempotency(input: {
    documentId: string;
    requestHash: string;
    actor: BookingOperationsActor;
    result: StartBookingCaseSourcingResult;
    createdAt: Date;
  }): void;
}

export interface BookingCaseSourcingRepository {
  runTransaction<T>(work: (transaction: BookingCaseSourcingTransaction) => Promise<T>): Promise<T>;
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Bounded, non-financial R5 intervention command.
 *
 * This command only records that support has started sourcing an alternative.
 * It cannot select/reassign a replacement, change availability, charge a top-up,
 * close the case, or initiate/refund money.
 */
export async function startBookingCaseSourcing(
  untrustedCommand: unknown,
  actor: BookingOperationsActor,
  dependencies: {
    repository: BookingCaseSourcingRepository;
    now?: () => Date;
    createRequestId?: () => string;
  },
): Promise<StartBookingCaseSourcingResult> {
  if (!actor.uid) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to manage booking intervention cases.');
  }
  const parsed = startBookingCaseSourcingCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Booking case sourcing command is invalid.');
  }

  const command = parsed.data;
  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocumentId = stableHash({
    actorId: actor.uid,
    commandName: 'startBookingCaseSourcing',
    idempotencyKey: command.idempotencyKey,
  });

  return dependencies.repository.runTransaction(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocumentId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new BookingCommandError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }
      return startBookingCaseSourcingResultSchema.parse(replay.result);
    }

    const current = await transaction.getCase(command.data.caseId);
    if (!current) {
      throw new BookingCommandError('NOT_FOUND', 'Booking intervention case was not found.');
    }
    if (current.version !== command.data.expectedVersion) {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        'This intervention case changed. Refresh and try again.',
        { reason: 'stale_version' },
      );
    }
    if (current.status !== 'open') {
      throw new BookingCommandError(
        'INVALID_STATE_TRANSITION',
        'Only an open intervention case can begin alternative sourcing.',
        { reason: 'case_not_open' },
      );
    }

    const version = current.version + 1;
    transaction.updateCase({
      caseId: current.caseId,
      version,
      actor,
      updatedAt: now,
    });
    transaction.createDomainAudit({
      caseId: current.caseId,
      actor,
      requestId,
      updatedAt: now,
    });
    transaction.createAdminAudit({
      caseId: current.caseId,
      actor,
      requestId,
      fromStatus: 'open',
      toStatus: 'sourcing_alternative',
      updatedAt: now,
    });

    const result = startBookingCaseSourcingResultSchema.parse({
      requestId,
      result: {
        caseId: current.caseId,
        fromStatus: 'open',
        toStatus: 'sourcing_alternative',
        version,
        updatedAt: now.toISOString(),
      },
    });
    transaction.saveIdempotency({
      documentId: idempotencyDocumentId,
      requestHash,
      actor,
      result,
      createdAt: now,
    });
    return result;
  });
}
