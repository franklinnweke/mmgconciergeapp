import { createHash, randomUUID } from 'node:crypto';

import {
  CommandError,
  reviewOwnerVerificationCommandSchema,
  reviewOwnerVerificationResultSchema,
  type ReviewOwnerVerificationCommand,
  type ReviewOwnerVerificationResult,
} from '@mmg/contracts';
import {
  actorMayApplyDecision,
  canTransitionOwnerVerification,
  decisionTargetStatus,
  requiresApprovalChecklist,
  requiresReviewReason,
  validateReviewReason,
} from '@mmg/domain';
import type {
  OwnerProfileRecord,
  OwnerRepository,
  OwnerVerificationRecord,
} from './firestore-owner-repository.js';
import type { StorageGateway } from './storage-validation.js';

export type ReviewOwnerVerificationActor = {
  uid: string;
  role: 'verification_admin' | 'super_admin';
};

export type ReviewOwnerVerificationDependencies = {
  repository: OwnerRepository;
  storageGateway?: StorageGateway;
  now?: () => Date;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function reviewOwnerVerification(
  untrustedCommand: unknown,
  actor: ReviewOwnerVerificationActor,
  dependencies: ReviewOwnerVerificationDependencies,
): Promise<ReviewOwnerVerificationResult> {
  if (!actor?.uid || !['verification_admin', 'super_admin'].includes(actor.role)) {
    throw new CommandError('FORBIDDEN', 'Staff authorization required.', { reason: 'not_staff' });
  }

  const parsed = reviewOwnerVerificationCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new CommandError('INVALID_ARGUMENT', 'Review command data is invalid.');
  }
  const command: ReviewOwnerVerificationCommand = parsed.data;

  if (!actorMayApplyDecision(actor.role, command.data.decision)) {
    throw new CommandError(
      'FORBIDDEN',
      'Staff role is not authorized to apply this decision.',
      { reason: 'not_staff' },
    );
  }

  if (requiresReviewReason(command.data.decision)) {
    if (!command.data.reason) {
      throw new CommandError(
        'INVALID_ARGUMENT',
        'A valid review reason (10-500 characters) is required.',
      );
    }
    const validatedReason = validateReviewReason(command.data.reason);
    if (!validatedReason) {
      throw new CommandError(
        'INVALID_ARGUMENT',
        'A valid review reason (10-500 characters) is required.',
      );
    }
  }

  if (requiresApprovalChecklist(command.data.decision)) {
    if (!command.data.checklist) {
      throw new CommandError(
        'INVALID_ARGUMENT',
        'The approval checklist must be completed.',
      );
    }
  }

  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocumentId = stableHash({
    actorId: actor.uid,
    commandName: 'reviewOwnerVerification',
    idempotencyKey: command.idempotencyKey,
  });

  const { result, pathToDelete, uploadIdToDelete } = await dependencies.repository.runTransaction(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocumentId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new CommandError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }
      return {
        result: reviewOwnerVerificationResultSchema.parse(replay.result),
        pathToDelete: null,
        uploadIdToDelete: null,
      };
    }

    const existingVerification = await transaction.getOwnerVerification(command.data.ownerId);
    const existingProfile = await transaction.getOwnerProfile(command.data.ownerId);

    if (!existingVerification || !existingProfile) {
      throw new CommandError('NOT_FOUND', 'Owner verification record was not found.');
    }

    if (existingVerification.version !== command.data.expectedVersion) {
      throw new CommandError(
        'FAILED_PRECONDITION',
        'Verification record has been modified by another reviewer. Please refresh.',
        { reason: 'stale_version' },
      );
    }

    const targetStatus = decisionTargetStatus(command.data.decision);
    if (!canTransitionOwnerVerification(existingVerification.status, targetStatus)) {
      throw new CommandError(
        'INVALID_STATE_TRANSITION',
        `Cannot transition verification from ${existingVerification.status} to ${targetStatus}.`,
        { reason: 'stale_version' },
      );
    }

    const nextVerificationVersion = (existingVerification.version ?? 0) + 1;
    const nextProfileVersion = (existingProfile.version ?? 0) + 1;

    const isTerminalDecision = command.data.decision === 'approve' || command.data.decision === 'reject';
    const pathToDelete = isTerminalDecision && existingVerification.governmentId?.storagePath
      ? existingVerification.governmentId.storagePath
      : null;
    const uploadIdToDelete = isTerminalDecision && existingVerification.governmentId?.uploadId
      ? existingVerification.governmentId.uploadId
      : null;

    const updatedVerificationGovId = isTerminalDecision && existingVerification.governmentId && pathToDelete
      ? {
          ...existingVerification.governmentId,
          bytesState: 'deletion_pending' as const,
          storagePath: pathToDelete,
        }
      : existingVerification.governmentId;

    const updatedProfileGovId = existingProfile.governmentId;

    const updatedVerification: OwnerVerificationRecord = {
      ...existingVerification,
      status: targetStatus,
      reviewerUid: actor.uid,
      reviewedAt: now.toISOString(),
      lastDecision: command.data.decision,
      lastDecisionReason: command.data.reason ?? null,
      previousDecisionReason:
        existingVerification.lastDecisionReason ??
        existingVerification.previousDecisionReason ??
        null,
      reviewChecklist: command.data.checklist
        ? {
            identity_matches_id: Boolean(command.data.checklist.identity_matches_id),
            document_legible: Boolean(command.data.checklist.document_legible),
            lagos_address_plausible: Boolean(command.data.checklist.lagos_address_plausible),
            current_terms_accepted: Boolean(command.data.checklist.current_terms_accepted),
            no_fraud_indicators: Boolean(command.data.checklist.no_fraud_indicators),
          }
        : null,
      governmentId: updatedVerificationGovId,
      version: nextVerificationVersion,
      updatedAt: now.toISOString(),
    };

    const updatedProfile: OwnerProfileRecord = {
      ...existingProfile,
      verificationStatus: targetStatus,
      verificationUpdatedAt: now.toISOString(),
      lastDecisionReason: command.data.reason ?? null,
      governmentId: updatedProfileGovId,
      updatedAt: now.toISOString(),
      version: nextProfileVersion,
    };

    const beforeHash = stableHash({
      status: existingVerification.status,
      lastDecision: existingVerification.lastDecision ?? null,
      lastDecisionReason: existingVerification.lastDecisionReason ?? null,
      uploadId: existingVerification.governmentId?.uploadId ?? null,
      version: existingVerification.version,
    });
    const afterHash = stableHash({
      status: targetStatus,
      lastDecision: command.data.decision,
      lastDecisionReason: command.data.reason ?? null,
      uploadId: existingVerification.governmentId?.uploadId ?? null,
      version: nextVerificationVersion,
    });

    const result = reviewOwnerVerificationResultSchema.parse({
      requestId,
      result: {
        ownerId: command.data.ownerId,
        fromStatus: existingVerification.status,
        toStatus: targetStatus,
        decidedAt: now.toISOString(),
      },
    });

    transaction.setOwnerVerification(command.data.ownerId, updatedVerification, now);
    transaction.setOwnerProfile(command.data.ownerId, updatedProfile, now);
    transaction.createAdminAuditLog(
      {
        actorId: actor.uid,
        role: actor.role,
        action: 'owner.verification_decided',
        target: `ownerVerifications/${command.data.ownerId}`,
        beforeHash,
        afterHash,
        reason: command.data.reason ?? null,
        requestId,
        createdAt: now,
      },
      now,
    );
    transaction.createAuditEvent({
      actorId: actor.uid,
      actorType: 'staff',
      entityId: command.data.ownerId,
      entityType: 'ownerVerification',
      eventType: 'owner.verification_decided',
      fromState: existingVerification.status,
      toState: targetStatus,
      requestId,
      occurredAt: now,
      details: {
        decision: command.data.decision,
        reviewerUid: actor.uid,
      },
    });
    transaction.createNotificationOutbox(
      {
        eventType: 'owner.verification_decided',
        ownerId: command.data.ownerId,
        status: 'unavailable',
        reason: 'fcm_not_in_sequence_1',
        createdAt: now,
      },
      now,
    );
    transaction.saveIdempotency(
      idempotencyDocumentId,
      {
        requestHash,
        commandName: 'reviewOwnerVerification',
        actorId: actor.uid,
        result,
      },
      now,
    );

    return { result, pathToDelete, uploadIdToDelete };
  });

  if (pathToDelete && dependencies.storageGateway?.deleteObject) {
    try {
      await dependencies.storageGateway.deleteObject(pathToDelete);
      if (dependencies.repository.markGovernmentIdCleared) {
        await dependencies.repository.markGovernmentIdCleared(command.data.ownerId, now);
      }
    } catch (err) {
      if (dependencies.repository.recordStorageDeletionOutbox) {
        await dependencies.repository.recordStorageDeletionOutbox(
          {
            ownerId: command.data.ownerId,
            storagePath: pathToDelete,
            uploadId: uploadIdToDelete ?? 'unknown',
            attempts: 1,
            lastAttemptAt: now.toISOString(),
            error: err instanceof Error ? err.message : String(err),
            status: 'pending',
          },
          now,
        );
      }
    }
  }

  return result;
}
