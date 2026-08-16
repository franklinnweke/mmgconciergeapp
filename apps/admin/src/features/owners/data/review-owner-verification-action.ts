'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import {
  canonicalErrorCodeSchema,
  CommandError,
  commandSafeReasonSchema,
  type OwnerReviewDecision,
} from '@mmg/contracts';

import { requireLiveStaffSession } from '@/features/auth/server/session';
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

const repository = new FirestoreOwnerRepository();
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

    const idempotencyKey =
      input.idempotencyKey ||
      `action-rev-${input.ownerId}-${input.decision}-${input.expectedVersion}-${Date.now()}`;

    const command = {
      schemaVersion: 1,
      idempotencyKey,
      data: {
        ownerId: input.ownerId,
        expectedVersion: input.expectedVersion,
        decision: input.decision,
        reason: input.reason,
        checklist: input.checklist,
      },
    };

    const actor = {
      uid: session.uid,
      role: session.role,
    };

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
