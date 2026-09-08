import { createHash, randomUUID } from 'node:crypto';

import {
  CommandError,
  completeOwnerProfileCommandSchema,
  completeOwnerProfileResultSchema,
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  type CompleteOwnerProfileCommand,
  type CompleteOwnerProfileResult,
} from '@mmg/contracts';
import { isCurrentTerms, ownerMayMutateProfile } from '@mmg/domain';
import {
  requireVerifiedEmailOwnerAuth,
  type CallableAuth,
} from './callable-auth.js';
import type {
  OwnerProfileRecord,
  OwnerRepository,
  OwnerVerificationRecord,
} from './firestore-owner-repository.js';

export type CompleteOwnerProfileDependencies = {
  repository: OwnerRepository;
  now?: () => Date;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function completeOwnerProfile(
  untrustedCommand: unknown,
  authContext: CallableAuth,
  dependencies: CompleteOwnerProfileDependencies,
): Promise<CompleteOwnerProfileResult> {
  const auth = requireVerifiedEmailOwnerAuth(authContext);

  const parsed = completeOwnerProfileCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new CommandError('INVALID_ARGUMENT', 'Owner profile data is invalid.');
  }
  const command: CompleteOwnerProfileCommand = parsed.data;

  const currentVersionSnapshot = {
    ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
    commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
    privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
  };

  if (
    !isCurrentTerms(
      {
        ownerTermsVersion: command.data.acceptedOwnerTermsVersion,
        commissionTermsVersion: command.data.acceptedCommissionTermsVersion,
        privacyNoticeVersion: command.data.acceptedPrivacyNoticeVersion,
      },
      currentVersionSnapshot,
    )
  ) {
    throw new CommandError(
      'FAILED_PRECONDITION',
      'Accepted terms versions are outdated. Please review and accept current terms.',
      { reason: 'terms_stale' },
    );
  }

  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocumentId = stableHash({
    actorId: auth.uid,
    commandName: 'completeOwnerProfile',
    idempotencyKey: command.idempotencyKey,
  });

  return dependencies.repository.runTransaction(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocumentId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new CommandError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }
      return completeOwnerProfileResultSchema.parse(replay.result);
    }

    const user = await transaction.getUser(auth.uid);
    if (!user || user.uid !== auth.uid || !['owner', 'renter'].includes(user.accountType)) {
      throw new CommandError(
        'FORBIDDEN',
        'A registered MMG account is required to complete an owner profile.',
        { reason: 'not_owner' },
      );
    }

    const existingVerification = await transaction.getOwnerVerification(auth.uid);
    const currentStatus = existingVerification?.status ?? null;
    if (!ownerMayMutateProfile(currentStatus)) {
      throw new CommandError(
        'INVALID_STATE_TRANSITION',
        'Profile cannot be modified while verification is in progress or resolved.',
        { reason: 'stale_version' },
      );
    }

    const config = await transaction.getOwnerVerificationConfig();
    if (config) {
      const configSnapshot = {
        ownerTermsVersion: config.termsVersion,
        commissionTermsVersion: config.commissionTermsVersion,
        privacyNoticeVersion: config.privacyNoticeVersion,
      };
      if (!isCurrentTerms(configSnapshot, currentVersionSnapshot)) {
        throw new CommandError(
          'FAILED_PRECONDITION',
          'System terms configuration has been updated. Please refresh.',
          { reason: 'terms_stale' },
        );
      }
    }

    const targetStatus = existingVerification?.status ?? 'draft';
    const existingProfile = await transaction.getOwnerProfile(auth.uid);
    if ((existingProfile !== null) !== (existingVerification !== null) ||
      (existingProfile && existingVerification && (
        existingProfile.ownerId !== auth.uid || existingVerification.ownerId !== auth.uid ||
        existingProfile.verificationStatus !== existingVerification.status ||
        !Number.isSafeInteger(existingProfile.version) || existingProfile.version < 1 ||
        !Number.isSafeInteger(existingVerification.version) || existingVerification.version < 1
      ))) {
      throw new CommandError('FAILED_PRECONDITION', 'Owner application records are inconsistent.');
    }
    const nextProfileVersion = (existingProfile?.version ?? 0) + 1;
    const nextVerificationVersion = (existingVerification?.version ?? 0) + 1;

    const profileRecord: OwnerProfileRecord = {
      ownerId: auth.uid,
      legalName: command.data.legalName,
      displayName: command.data.legalName,
      address: command.data.address,
      verificationStatus: targetStatus,
      verificationUpdatedAt: now.toISOString(),
      lastDecisionReason: existingProfile?.lastDecisionReason ?? null,
      ownerTermsVersion: command.data.acceptedOwnerTermsVersion,
      commissionTermsVersion: command.data.acceptedCommissionTermsVersion,
      privacyNoticeVersion: command.data.acceptedPrivacyNoticeVersion,
      termsAcceptedAt: now.toISOString(),
      governmentId: existingProfile?.governmentId ?? null,
      createdAt: existingProfile?.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
      version: nextProfileVersion,
    };

    const verificationRecord: OwnerVerificationRecord = {
      ownerId: auth.uid,
      status: targetStatus,
      legalName: command.data.legalName,
      address: command.data.address,
      email: auth.email,
      phoneE164: auth.phoneE164 ?? existingVerification?.phoneE164 ?? null,
      ownerTermsVersion: command.data.acceptedOwnerTermsVersion,
      commissionTermsVersion: command.data.acceptedCommissionTermsVersion,
      privacyNoticeVersion: command.data.acceptedPrivacyNoticeVersion,
      termsAcceptedAt: now.toISOString(),
      governmentId: existingVerification?.governmentId ?? null,
      version: nextVerificationVersion,
      submittedAt: existingVerification?.submittedAt ?? null,
      reviewerUid: existingVerification?.reviewerUid ?? null,
      reviewedAt: existingVerification?.reviewedAt ?? null,
      lastDecision: existingVerification?.lastDecision ?? null,
      lastDecisionReason: existingVerification?.lastDecisionReason ?? null,
      previousDecisionReason: existingVerification?.previousDecisionReason ?? null,
      reviewChecklist: existingVerification?.reviewChecklist ?? null,
      createdAt: existingVerification?.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const result = completeOwnerProfileResultSchema.parse({
      requestId,
      result: {
        ownerId: auth.uid,
        verificationStatus: targetStatus,
        profileVersion: nextProfileVersion,
      },
    });

    transaction.setOwnerProfile(auth.uid, profileRecord, now);
    transaction.setOwnerVerification(auth.uid, verificationRecord, now);
    transaction.createAuditEvent({
      actorId: auth.uid,
      actorType: 'owner',
      entityId: auth.uid,
      entityType: 'ownerProfile',
      eventType: 'owner.profile_completed',
      fromState: currentStatus,
      toState: targetStatus,
      requestId,
      occurredAt: now,
      details: {
        profileVersion: nextProfileVersion,
        verificationVersion: nextVerificationVersion,
      },
    });
    transaction.saveIdempotency(
      idempotencyDocumentId,
      {
        requestHash,
        commandName: 'completeOwnerProfile',
        actorId: auth.uid,
        result,
      },
      now,
    );

    return result;
  });
}
