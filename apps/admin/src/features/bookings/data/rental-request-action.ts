'use server';

import 'server-only';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { getAdminFirestore } from '@/features/auth/server/firebase-admin';
import { assertSameOrigin } from '@/features/auth/server/same-origin';
import {
  requireLiveStaffSession,
  staffActorRole,
  staffSessionHasCapability,
} from '@/features/auth/server/session';
import { BookingCommandError } from '@mmg/functions-booking/errors';
import { FirestoreRentalRequestRepository } from '@mmg/functions-booking/firestore-rental-request-repository';
import { confirmRentalRequestPickup } from '@mmg/functions-booking/confirm-rental-request-pickup';
import { confirmedPickupTimeSchema } from '@mmg/contracts/rental-request';
import { z } from 'zod';
import {
  approveRentalRequest,
  declineRentalRequest,
  openRentalRequestPaymentWindow,
} from '@mmg/functions-booking/rental-request-service';

export type RentalRequestAdminAction = 'approve' | 'decline' | 'open_payment_window' | 'confirm_pickup';

export type ExecuteRentalRequestActionInput = {
  requestId: string;
  expectedVersion: number;
  action: RentalRequestAdminAction;
  reason?: string;
  confirmedPickupTime?: string;
};

export type ExecuteRentalRequestActionResult =
  | {
      success: true;
      state: string;
      version: number;
      holdExpiresAt?: string;
    }
  | { success: false; error: string };

const GENERIC_ERROR = 'The rental request action could not be completed. Refresh the queue and try again.';
const actionInputSchema = z.object({
  requestId: z.string().min(1).max(128).regex(/^[^/]+$/),
  expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1),
  action: z.enum(['approve', 'decline', 'open_payment_window', 'confirm_pickup']),
  reason: z.string().trim().max(500).optional(),
  confirmedPickupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
}).strict();

function idempotencyKey(input: ExecuteRentalRequestActionInput): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({
      requestId: input.requestId,
      expectedVersion: input.expectedVersion,
      action: input.action,
      reason: input.reason?.trim() || null,
      confirmedPickupTime: input.confirmedPickupTime ?? null,
    }))
    .digest('hex')
    .slice(0, 48);
  return `admin_rental_${digest}`;
}

function safeError(error: unknown): string {
  if (!(error instanceof BookingCommandError)) return GENERIC_ERROR;
  if (error.code === 'NOT_FOUND') return 'This rental request no longer exists.';
  if (error.code === 'VEHICLE_UNAVAILABLE') return 'Those dates are no longer available. Keep the request open for concierge follow-up.';
  if (error.code === 'INVALID_STATE_TRANSITION') return 'This request changed state. Refresh before taking another action.';
  if (error.code === 'CONFIGURATION_UNAVAILABLE') return 'Booking configuration is unavailable. Do not open payment until it is restored.';
  if (error.code === 'FORBIDDEN') return 'You are not authorized to manage concierge rental requests.';
  if (error.code === 'IDEMPOTENCY_CONFLICT') return 'This action conflicts with an earlier attempt. Refresh the request first.';
  if (error.code === 'FAILED_PRECONDITION') return 'The request cannot safely move to that state. Refresh and review availability.';
  if (error.code === 'INVALID_ARGUMENT') return 'Check the request action details and try again.';
  return GENERIC_ERROR;
}

export async function executeRentalRequestAction(
  input: ExecuteRentalRequestActionInput,
): Promise<ExecuteRentalRequestActionResult> {
  try {
    assertSameOrigin(await headers());

    const session = await requireLiveStaffSession();
    const role = staffActorRole(session, ['support', 'super_admin'] as const);
    if (!role || !staffSessionHasCapability(session, 'bookings.manage_requests')) {
      return { success: false, error: 'You are not authorized to manage concierge rental requests.' };
    }
    const validated = actionInputSchema.safeParse(input);
    if (!validated.success) return { success: false, error: 'Check the request action details and try again.' };
    input = validated.data;

    if (input.action === 'confirm_pickup' && !confirmedPickupTimeSchema.safeParse(input.confirmedPickupTime).success) {
      return { success: false, error: 'Enter a valid pickup time in Lagos time (HH:mm).' };
    }

    if (process.env.MMG_ADMIN_FIXTURES === '1' && process.env.NODE_ENV !== 'production') {
      if (input.action === 'confirm_pickup') {
        return { success: false, error: 'Pickup confirmation is unavailable in fixture mode. No record changed.' };
      }
      const state = input.action === 'approve'
        ? 'approved'
        : input.action === 'decline'
          ? 'declined'
          : 'ready_for_payment';
      return {
        success: true,
        state,
        version: input.expectedVersion + 1,
        ...(input.action === 'open_payment_window'
          ? { holdExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() }
          : {}),
      };
    }

    const repository = new FirestoreRentalRequestRepository(getAdminFirestore());
    const key = idempotencyKey(input);

    if (input.action === 'confirm_pickup') {
      const result = await confirmRentalRequestPickup({ schemaVersion: 1, idempotencyKey: key, data: {
        requestId: input.requestId, expectedVersion: input.expectedVersion,
        confirmedPickupTime: input.confirmedPickupTime,
      } }, { uid: session.uid, role }, getAdminFirestore());
      revalidatePath('/bookings');
      return { success: true, ...result };
    }

    if (input.action === 'open_payment_window') {
      const result = await openRentalRequestPaymentWindow({
        schemaVersion: 1,
        idempotencyKey: key,
        data: {
          requestId: input.requestId,
          expectedVersion: input.expectedVersion,
        },
      }, { uid: session.uid, role }, { repository });
      revalidatePath('/');
      return {
        success: true,
        state: result.result.state,
        version: result.result.version,
        holdExpiresAt: result.result.holdExpiresAt,
      };
    }

    const actor = { uid: session.uid, isStaff: true, role } as const;
    if (input.action === 'approve') {
      const result = await approveRentalRequest({
        schemaVersion: 1,
        idempotencyKey: key,
        data: {
          requestId: input.requestId,
          expectedVersion: input.expectedVersion,
        },
      }, actor, { repository });
      revalidatePath('/');
      return {
        success: true,
        state: result.result.state,
        version: result.result.version,
      };
    }

    const result = await declineRentalRequest({
      schemaVersion: 1,
      idempotencyKey: key,
      data: {
        requestId: input.requestId,
        expectedVersion: input.expectedVersion,
        ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
      },
    }, actor, { repository });
    revalidatePath('/');
    return {
      success: true,
      state: result.result.state,
      version: result.result.version,
    };
  } catch (error) {
    return { success: false, error: safeError(error) };
  }
}
