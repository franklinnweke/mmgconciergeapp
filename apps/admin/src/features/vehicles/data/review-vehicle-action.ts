'use server';

import 'server-only';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  canonicalErrorCodeSchema,
  CommandError,
  commandSafeReasonSchema,
  reviewVehicleDataSchema,
  type VehicleReviewDecision,
} from '@mmg/contracts';

import { getAdminFirestore, getAdminStorage } from '@/features/auth/server/firebase-admin';
import { assertSameOrigin } from '@/features/auth/server/same-origin';
import { requireLiveStaffSession, staffActorRole, staffSessionHasCapability } from '@/features/auth/server/session';
import { FirestoreVehicleRepository } from '@mmg/functions-vehicle/firestore-vehicle-repository';
import { reviewVehicle } from '@mmg/functions-vehicle/review-vehicle-service';
import { AdminVehicleStorageGateway } from '@mmg/functions-vehicle/vehicle-storage-gateway';

export type ExecuteReviewVehicleInput = {
  vehicleId: string;
  expectedVersion: number;
  decision: VehicleReviewDecision;
  reason?: string;
  checklist?: {
    images_complete_and_legible: boolean;
    specs_match_images: boolean;
    plate_matches_documents: boolean;
    lagos_base_plausible: boolean;
    rate_plausible: boolean;
    chauffeur_delivery_included: boolean;
    no_fraud_indicators: boolean;
  };
  idempotencyKey?: string;
};

export type ExecuteReviewVehicleResult =
  | { success: true; toStatus: string; decidedAt: string; warning?: string }
  | { success: false; error: string };

const GENERIC_REVIEW_ERROR = 'The vehicle review action could not be completed. Please try again.';

/**
 * The decision committed but the photos did not go live. The service treats
 * this as non-fatal by design (the ruling is durable; reporting it as failed
 * would be false), so the desk must say so rather than claim publication.
 */
const PROMOTION_FAILURE_WARNING =
  'Decision recorded, but the listing photos could not be published. The listing is not yet discoverable — retry from the queue or escalate to engineering.';

function safeReviewErrorMessage(error: unknown): string {
  if (!(error instanceof CommandError)) return GENERIC_REVIEW_ERROR;

  const code = canonicalErrorCodeSchema.safeParse(error.code);
  if (!code.success) return GENERIC_REVIEW_ERROR;

  const reason = error.safeDetails?.reason;
  if (reason !== undefined && !commandSafeReasonSchema.safeParse(reason).success) {
    return GENERIC_REVIEW_ERROR;
  }

  if (code.data === 'FORBIDDEN' && reason === 'not_staff') {
    return 'You are not authorized to review vehicle listings.';
  }
  if (code.data === 'NOT_FOUND') return 'That vehicle listing is no longer available.';
  if (code.data === 'FAILED_PRECONDITION' && reason === 'stale_version') {
    return 'This vehicle changed. Refresh the record and try again.';
  }
  if (code.data === 'INVALID_STATE_TRANSITION') {
    return "This action is not valid for the vehicle's current state. Refresh the record and try again.";
  }
  if (code.data === 'INVALID_ARGUMENT') return 'Check the review checklist and details, then try again.';
  if (code.data === 'IDEMPOTENCY_CONFLICT') {
    return 'This review request conflicts with an earlier attempt. Refresh and try again.';
  }
  return GENERIC_REVIEW_ERROR;
}

export async function executeReviewVehicleAction(
  input: ExecuteReviewVehicleInput,
): Promise<ExecuteReviewVehicleResult> {
  try {
    assertSameOrigin(await headers());

    const session = await requireLiveStaffSession();

    // In fixture mode, simulate the review decision without writing to live Firestore
    if (process.env.MMG_ADMIN_FIXTURES === '1' && process.env.NODE_ENV !== 'production') {
      const now = new Date().toISOString();
      const toStatus =
        input.decision === 'approve' || input.decision === 'restore'
          ? 'approved'
          : input.decision === 'reject'
            ? 'rejected'
            : input.decision === 'suspend'
              ? 'suspended'
              : 'pending_review';

      revalidatePath('/vehicles');
      revalidatePath(`/vehicles/${input.vehicleId}`);

      return {
        success: true,
        toStatus,
        decidedAt: now,
      };
    }

    const idempotencyKey =
      input.idempotencyKey ||
      `action-rev-veh-${input.vehicleId}-${input.decision}-${input.expectedVersion}`;

    const commandData = reviewVehicleDataSchema.parse({
      vehicleId: input.vehicleId,
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
    // verification_admin still moderates vehicles. Actions cannot use
    // requireStaffCapability — its redirect() throws, and this try/catch would
    // turn that into a generic failure message.
    const actorRole = staffActorRole(session, ['super_admin', 'vehicle_admin'] as const);
    if (!actorRole || !staffSessionHasCapability(session, 'vehicles.review')) {
      return {
        success: false,
        error: 'You are not authorized to review vehicle listings.',
      };
    }

    const actor = {
      uid: session.uid,
      role: actorRole,
    };

    let promotionFailed = false;
    const repository = new FirestoreVehicleRepository(getAdminFirestore());
    const storageGateway = new AdminVehicleStorageGateway(getAdminStorage().bucket());
    const result = await reviewVehicle(command, actor, {
      repository,
      storageGateway,
      onPromotionFailure: () => {
        promotionFailed = true;
      },
    });

    revalidatePath('/vehicles');
    revalidatePath(`/vehicles/${input.vehicleId}`);

    return {
      success: true,
      toStatus: result.result.toStatus,
      decidedAt: result.result.decidedAt,
      ...(promotionFailed ? { warning: PROMOTION_FAILURE_WARNING } : {}),
    };
  } catch (error) {
    return {
      success: false,
      error: safeReviewErrorMessage(error),
    };
  }
}
