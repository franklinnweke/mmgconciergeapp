'use server';

import 'server-only';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  canonicalErrorCodeSchema,
  CommandError,
  commandSafeReasonSchema,
  reviewOwnerVerificationDataSchema,
  type OwnerReviewDecision,
} from '@mmg/contracts';

import { getAdminFirestore } from '@/features/auth/server/firebase-admin';
import { assertSameOrigin } from '@/features/auth/server/same-origin';
import { requireLiveStaffSession, staffActorRole, staffSessionHasCapability } from '@/features/auth/server/session';
import { FirestoreOwnerRepository } from '@mmg/functions-owner/firestore-owner-repository';
import { reviewOwnerVerification } from '@mmg/functions-owner/review-owner-verification-service';

export type ExecuteReviewDecisionInput = {
  ownerId: string;
  expectedVersion: number;
  decision: OwnerReviewDecision;
  reason?: string;
  checklist?: {
    identity_matches_id: boolean;
    document_legible: boolean;
    lagos_address_plausible: boolean;
    current_terms_accepted: boolean;
    no_fraud_indicators: boolean;
  };
  idempotencyKey?: string;
};

export type ExecuteReviewDecisionResult =
  | { success: true; toStatus: string; decidedAt: string }
  | { success: false; error: string };

const GENERIC_REVIEW_ERROR = 'The review action could not be completed. Please try again.';

function safeReviewErrorMessage(error: unknown): string {
  if (!(error instanceof CommandError)) return GENERIC_REVIEW_ERROR;

  const code = canonicalErrorCodeSchema.safeParse(error.code);
  if (!code.success) return GENERIC_REVIEW_ERROR;

  const reason = error.safeDetails?.reason;
  if (reason !== undefined && !commandSafeReasonSchema.safeParse(reason).success) {
    return GENERIC_REVIEW_ERROR;
  }

  if (code.data === 'FORBIDDEN' && reason === 'not_staff') {
    return 'You are not authorized to review owner applications.';
  }
  if (code.data === 'NOT_FOUND') return 'That owner application is no longer available.';
  if (code.data === 'FAILED_PRECONDITION' && reason === 'stale_version') {
    return 'This application changed. Refresh the queue and try again.';
  }
  if (code.data === 'INVALID_STATE_TRANSITION') {
    return 'That application cannot move to the requested state.';
  }
  if (code.data === 'INVALID_ARGUMENT') return 'Check the review details and try again.';
  if (code.data === 'IDEMPOTENCY_CONFLICT') {
    return 'This review request conflicts with an earlier attempt. Refresh and try again.';
  }
  return GENERIC_REVIEW_ERROR;
}

export async function executeReviewDecisionAction(
  input: ExecuteReviewDecisionInput,
): Promise<ExecuteReviewDecisionResult> {
  try {
    // The strict origin gate from the session endpoints, applied to the one
    // action that changes verification state. Next's built-in Server Action
    // check lets a missing Origin header through with a warning; this fails
    // closed unless Origin (or Sec-Fetch-Site) proves same-origin.
    assertSameOrigin(await headers());

    const session = await requireLiveStaffSession();

    // In fixture mode, simulate the review decision without writing to live Firestore
    if (process.env.MMG_ADMIN_FIXTURES === '1' && process.env.NODE_ENV !== 'production') {
      const now = new Date().toISOString();
      const toStatus =
        input.decision === 'approve'
          ? 'approved'
          : input.decision === 'reject'
            ? 'rejected'
            : input.decision === 'suspend'
              ? 'suspended'
              : input.decision === 'revoke'
                ? 'revoked'
                : 'under_review';

      revalidatePath('/owners');
      revalidatePath(`/owners/${input.ownerId}`);

      return {
        success: true,
        toStatus,
        decidedAt: now,
      };
    }

    // Deterministic per intent (owner + decision + version): a double-fire of
    // the same decision replays the stored result instead of minting a fresh
    // Date.now()-salted key that the service's idempotency store can never
    // deduplicate. Version increments on every successful review, so two
    // genuinely different decisions can never collide on one key.
    const idempotencyKey =
      input.idempotencyKey ||
      `action-rev-${input.ownerId}-${input.decision}-${input.expectedVersion}`;

    const commandData = reviewOwnerVerificationDataSchema.parse({
      ownerId: input.ownerId,
      expectedVersion: input.expectedVersion,
      decision: input.decision,
      reason: input.reason,
      checklist: input.checklist,
    });

    const command = {
      schemaVersion: 1 as const,
      idempotencyKey,
      data: commandData,
    };

    // Capability, not the scalar display role: a staffer who also holds
    // vehicle_admin still reviews owners. Actions cannot use
    // requireStaffCapability — its redirect() throws, and this try/catch would
    // turn that into a generic failure message.
    const actorRole = staffActorRole(session, ['super_admin', 'verification_admin'] as const);
    if (!actorRole || !staffSessionHasCapability(session, 'owners.review')) {
      return {
        success: false,
        error: 'You are not authorized to review owner applications.',
      };
    }

    const actor = {
      uid: session.uid,
      role: actorRole,
    };

    // Constructed lazily inside the action: the module-scope default
    // (getFirestore() -> getApp()) throws app/no-app whenever this module is
    // first imported before any page has initialized the Admin app — exactly
    // what happens in fixture mode, where the action module loads on first
    // POST without a live gateway ever having been constructed.
    const repository = new FirestoreOwnerRepository(getAdminFirestore());

    const result = await reviewOwnerVerification(command, actor, { repository });

    revalidatePath('/owners');
    revalidatePath(`/owners/${input.ownerId}`);

    return {
      success: true,
      toStatus: result.result.toStatus,
      decidedAt: result.result.decidedAt,
    };
  } catch (error) {
    return {
      success: false,
      error: safeReviewErrorMessage(error),
    };
  }
}
