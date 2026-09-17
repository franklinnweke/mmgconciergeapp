import { createHash, randomUUID } from 'node:crypto';
import {
  completeRenterProfileCommandSchema,
  type CompleteRenterProfileCommand,
  type CompleteRenterProfileResult,
  type RenterProfileRecord,
} from '@mmg/contracts';
import { isCurrentRenterTerms } from '@mmg/domain';

import { CommandError } from '../errors.js';
import type { AuthenticatedRenter } from './callable-auth.js';
import type { RenterRepository } from './renter-repository.js';

const CURRENT_RENTER_TERMS = {
  renterTermsVersion: '2026-03-01',
  privacyNoticeVersion: '2026-03-01',
};

function hashCommand(command: CompleteRenterProfileCommand): string {
  return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}

export async function completeRenterProfileService(
  rawCommand: unknown,
  actor: AuthenticatedRenter,
  repository: RenterRepository,
): Promise<CompleteRenterProfileResult> {
  const parsed = completeRenterProfileCommandSchema.safeParse(rawCommand);
  if (!parsed.success) {
    throw new CommandError('INVALID_ARGUMENT', parsed.error.issues[0]?.message || 'Invalid renter profile data.');
  }

  const command = parsed.data;
  const { data, idempotencyKey } = command;

  const isTermsFresh = isCurrentRenterTerms(
    {
      renterTermsVersion: data.acceptedRenterTermsVersion,
      privacyNoticeVersion: data.acceptedPrivacyNoticeVersion,
    },
    CURRENT_RENTER_TERMS,
  );

  if (!isTermsFresh) {
    throw new CommandError('FAILED_PRECONDITION', 'You must accept the current renter terms and privacy notice.', {
      reason: 'terms_stale',
    });
  }

  const requestHash = hashCommand(command);
  const idempotencyDocId = `renter_${actor.uid}_${idempotencyKey}`;
  const now = new Date();
  const nowIso = now.toISOString();

  return repository.runTransaction(async (tx) => {
    const existingIdempotency = await tx.getIdempotency(idempotencyDocId);
    if (existingIdempotency) {
      if (existingIdempotency.requestHash !== requestHash) {
        throw new CommandError('IDEMPOTENCY_CONFLICT', 'Idempotency key was reused with different payload.');
      }
      return existingIdempotency.result as CompleteRenterProfileResult;
    }

    const existing = await tx.getRenterProfile(actor.uid);
    if (existing?.accountStatus === 'deletion_requested') {
      throw new CommandError(
        'FAILED_PRECONDITION',
        'Account deletion is already in progress. Profile changes are disabled.',
      );
    }
    if (existing && (existing.accountStatus === 'deleted' || existing.accountStatus === 'suspended')) {
      throw new CommandError('FORBIDDEN', 'This renter account is suspended or deleted.');
    }

    const profileVersion = existing ? existing.profileVersion + 1 : 1;
    const createdAt = existing ? existing.createdAt : nowIso;

    const profileRecord: RenterProfileRecord = {
      renterId: actor.uid,
      fullName: data.fullName,
      email: actor.email,
      phone: data.phone,
      defaultDeliveryAddress: data.defaultDeliveryAddress,
      acceptedRenterTermsVersion: data.acceptedRenterTermsVersion,
      acceptedPrivacyNoticeVersion: data.acceptedPrivacyNoticeVersion,
      accountStatus: 'active',
      deletionReason: null,
      deletionRequestedAt: null,
      profileVersion,
      createdAt,
      updatedAt: nowIso,
    };

    tx.setRenterProfile(actor.uid, profileRecord, now);

    tx.createAuditEvent({
      actorId: actor.uid,
      actorType: 'renter',
      entityId: actor.uid,
      entityType: 'renterProfile',
      eventType: 'renter_profile_completed',
      fromState: existing ? existing.accountStatus : null,
      toState: 'active',
      requestId: idempotencyKey,
      occurredAt: now,
      details: {
        profileVersion,
        areaLabel: data.defaultDeliveryAddress.areaLabel,
      },
    });

    const result: CompleteRenterProfileResult = {
      requestId: randomUUID(),
      result: {
        renterId: actor.uid,
        fullName: profileRecord.fullName,
        email: profileRecord.email,
        phone: profileRecord.phone,
        defaultDeliveryAddress: profileRecord.defaultDeliveryAddress,
        accountStatus: 'active',
        profileVersion,
        updatedAt: nowIso,
      },
    };

    tx.saveIdempotency(
      idempotencyDocId,
      {
        actorId: actor.uid,
        commandName: 'completeRenterProfile',
        requestHash,
        result,
      },
      now,
    );

    return result;
  });
}
