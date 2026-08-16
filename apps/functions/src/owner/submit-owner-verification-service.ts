import { createHash, randomUUID } from 'node:crypto';

import {
  CommandError,
  submitOwnerVerificationCommandSchema,
  submitOwnerVerificationResultSchema,
  type SubmitOwnerVerificationCommand,
  type SubmitOwnerVerificationResult,
} from '@mmg/contracts';
import { ownerMaySubmit } from '@mmg/domain';
import {
  requireLinkedNigerianPhone,
  requireVerifiedEmailOwnerAuth,
  type CallableAuth,
} from './callable-auth.js';
import type {
  OwnerProfileRecord,
  OwnerRepository,
  OwnerVerificationRecord,
} from './firestore-owner-repository.js';
import {
  validateOwnerVerificationUpload,
  type StorageGateway,
} from './storage-validation.js';

export type SubmitOwnerVerificationDependencies = {
  repository: OwnerRepository;
  storageGateway: StorageGateway;
  now?: () => Date;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function submitOwnerVerification(
  untrustedCommand: unknown,
  authContext: CallableAuth,
  dependencies: SubmitOwnerVerificationDependencies,
): Promise<SubmitOwnerVerificationResult> {
  const auth = requireVerifiedEmailOwnerAuth(authContext);
  const linkedPhone = requireLinkedNigerianPhone(authContext);

  const parsed = submitOwnerVerificationCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new CommandError('INVALID_ARGUMENT', 'Owner verification submission data is invalid.');
  }
  const command: SubmitOwnerVerificationCommand = parsed.data;

  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocumentId = stableHash({
    actorId: auth.uid,
    commandName: 'submitOwnerVerification',
    idempotencyKey: command.idempotencyKey,
  });

  const validatedUpload = await validateOwnerVerificationUpload(
    auth.uid,
    command.data.uploadId,
    dependencies.storageGateway,
    now,
  );

  return dependencies.repository.runTransaction(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocumentId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new CommandError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }
      return submitOwnerVerificationResultSchema.parse(replay.result);
    }

    const user = await transaction.getUser(auth.uid);
    if (!user || user.accountType !== 'owner') {
      throw new CommandError(
        'FORBIDDEN',
        'Only registered owner accounts can submit owner verification.',
        { reason: 'not_owner' },
      );
    }

    const existingVerification = await transaction.getOwnerVerification(auth.uid);
    const existingProfile = await transaction.getOwnerProfile(auth.uid);

    if (!existingVerification || !existingProfile) {
      throw new CommandError(
        'PROFILE_INCOMPLETE',
        'Complete your owner profile before submitting verification.',
      );
    }

    if (
      !existingProfile.legalName ||
      !existingProfile.address?.line1 ||
      !existingProfile.address?.areaLabel ||
      !existingProfile.termsAcceptedAt
    ) {
      throw new CommandError(
        'PROFILE_INCOMPLETE',
        'Complete your owner profile details before submitting verification.',
      );
    }

    if (!ownerMaySubmit(existingVerification.status)) {
      throw new CommandError(
        'INVALID_STATE_TRANSITION',
        'Verification can only be submitted from draft or rejected status.',
        { reason: 'stale_version' },
      );
    }

    const nextVerificationVersion = (existingVerification.version ?? 0) + 1;
    const nextProfileVersion = (existingProfile.version ?? 0) + 1;

    const updatedVerification: OwnerVerificationRecord = {
      ...existingVerification,
      status: 'submitted',
      submittedAt: now.toISOString(),
      phoneE164: linkedPhone,
      governmentId: {
        uploadId: command.data.uploadId,
        documentKind: command.data.documentKind,
        originalFileName: command.data.originalFileName,
        storagePath: validatedUpload.storagePath,
        contentType: validatedUpload.contentType,
        byteSize: validatedUpload.byteSize,
        uploadedAt: validatedUpload.uploadedAt,
        bytesState: 'present',
      },
      reviewerUid: null,
      reviewedAt: null,
      lastDecision: null,
      previousDecisionReason:
        existingVerification.lastDecisionReason ??
        existingVerification.previousDecisionReason ??
        null,
      lastDecisionReason: null,
      reviewChecklist: null,
      version: nextVerificationVersion,
      updatedAt: now.toISOString(),
    };

    const updatedProfile: OwnerProfileRecord = {
      ...existingProfile,
      verificationStatus: 'submitted',
      verificationUpdatedAt: now.toISOString(),
      lastDecisionReason: null,
      governmentId: {
        uploadId: command.data.uploadId,
        documentKind: command.data.documentKind,
        contentType: validatedUpload.contentType,
        byteSize: validatedUpload.byteSize,
        uploadedAt: validatedUpload.uploadedAt,
        status: 'submitted',
      },
      updatedAt: now.toISOString(),
      version: nextProfileVersion,
    };

    const result = submitOwnerVerificationResultSchema.parse({
      requestId,
      result: {
        ownerId: auth.uid,
        verificationStatus: 'submitted',
        submittedAt: now.toISOString(),
        receiptId: auth.uid,
      },
    });

    transaction.setOwnerVerification(auth.uid, updatedVerification, now);
    transaction.setOwnerProfile(auth.uid, updatedProfile, now);
    transaction.createAuditEvent({
      actorId: auth.uid,
      actorType: 'owner',
      entityId: auth.uid,
      entityType: 'ownerVerification',
      eventType: 'owner.verification_submitted',
      fromState: existingVerification.status,
      toState: 'submitted',
      requestId,
      occurredAt: now,
      details: {
        uploadId: command.data.uploadId,
        documentKind: command.data.documentKind,
        receiptId: auth.uid,
      },
    });
    transaction.createNotificationOutbox(
      {
        eventType: 'owner.verification_submitted',
        ownerId: auth.uid,
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
        commandName: 'submitOwnerVerification',
        actorId: auth.uid,
        result,
      },
      now,
    );

    return result;
  });
}
