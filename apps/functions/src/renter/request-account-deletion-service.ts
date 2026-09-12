import { createHash, randomUUID } from 'node:crypto';
import {
  requestAccountDeletionCommandSchema,
  type RequestAccountDeletionCommand,
  type RequestAccountDeletionResult,
} from '@mmg/contracts';
import { renterMayRequestDeletion } from '@mmg/domain';

import { CommandError } from '../errors.js';
import type { AuthenticatedRenter } from './callable-auth.js';
import type { RenterRepository } from './renter-repository.js';

function hashCommand(command: RequestAccountDeletionCommand): string {
  return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}

export async function requestAccountDeletionService(
  rawCommand: unknown,
  actor: AuthenticatedRenter,
  repository: RenterRepository,
): Promise<RequestAccountDeletionResult> {
  const parsed = requestAccountDeletionCommandSchema.safeParse(rawCommand);
  if (!parsed.success) {
    throw new CommandError('INVALID_ARGUMENT', parsed.error.issues[0]?.message || 'Invalid deletion request.');
  }

  const command = parsed.data;
  const { data, idempotencyKey } = command;

  const requestHash = hashCommand(command);
  const idempotencyDocId = `deletion_${actor.uid}_${idempotencyKey}`;
  const now = new Date();
  const nowIso = now.toISOString();

  return repository.runTransaction(async (tx) => {
    const existingIdempotency = await tx.getIdempotency(idempotencyDocId);
    if (existingIdempotency) {
      if (existingIdempotency.requestHash !== requestHash) {
        throw new CommandError('IDEMPOTENCY_CONFLICT', 'Idempotency key was reused with different payload.');
      }
      return existingIdempotency.result as RequestAccountDeletionResult;
    }

    const existing = await tx.getRenterProfile(actor.uid);
    if (!existing) {
      throw new CommandError('NOT_FOUND', 'Renter profile not found.');
    }

    if (!renterMayRequestDeletion(existing.accountStatus)) {
      throw new CommandError('FAILED_PRECONDITION', `Account in ${existing.accountStatus} status cannot request deletion.`);
    }

    const hasBookings = await tx.hasActiveBookings(actor.uid);
    if (hasBookings) {
      throw new CommandError('FAILED_PRECONDITION', 'Cannot delete account with active or in-progress rentals.');
    }

    const hasRequests = await tx.hasActiveRentalRequests(actor.uid);
    if (hasRequests) {
      throw new CommandError(
        'FAILED_PRECONDITION',
        'Cannot delete account while a concierge rental request is still active.',
      );
    }

    const purgeSummary = await tx.purgeRenterPrivacyData(actor.uid);

    const updatedProfile = {
      ...existing,
      accountStatus: 'deletion_requested' as const,
      deletionReason: data.reason ?? null,
      deletionRequestedAt: nowIso,
      updatedAt: nowIso,
    };

    tx.setRenterProfile(actor.uid, updatedProfile, now);

    tx.createAuditEvent({
      actorId: actor.uid,
      actorType: 'renter',
      entityId: actor.uid,
      entityType: 'renterProfile',
      eventType: 'renter_deletion_requested',
      fromState: existing.accountStatus,
      toState: 'deletion_requested',
      requestId: idempotencyKey,
      occurredAt: now,
      details: {
        reason: data.reason ?? null,
        deletedRentalRequestContactCount: purgeSummary.deletedRentalRequestContactCount,
        redactedRentalRequestLocationCount: purgeSummary.redactedRentalRequestLocationCount,
        deletedIdempotencyKeyCount: purgeSummary.deletedIdempotencyKeyCount,
      },
    });

    const result: RequestAccountDeletionResult = {
      requestId: randomUUID(),
      result: {
        renterId: actor.uid,
        accountStatus: 'deletion_requested',
        requestedAt: nowIso,
      },
    };

    tx.saveIdempotency(
      idempotencyDocId,
      {
        actorId: actor.uid,
        commandName: 'requestAccountDeletion',
        requestHash,
        result,
      },
      now,
    );

    return result;
  });
}
