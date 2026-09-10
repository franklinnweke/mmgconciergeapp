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
import {
  approveRentalRequest,
  declineRentalRequest,
  openRentalRequestPaymentWindow,
} from '@mmg/functions-booking/rental-request-service';

export type RentalRequestAdminAction = 'approve' | 'decline' | 'open_payment_window';

export type ExecuteRentalRequestActionInput = {
  requestId: string;
  expectedVersion: number;
  action: RentalRequestAdminAction;
  reason?: string;
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

function idempotencyKey(input: ExecuteRentalRequestActionInput): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({
      requestId: input.requestId,
      expectedVersion: input.expectedVersion,
      action: input.action,
      reason: input.reason?.trim() || null,
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

    if (!input.requestId || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      return { success: false, error: 'A valid request and expected version are required.' };
    }

    if (process.env.MMG_ADMIN_FIXTURES === '1' && process.env.NODE_ENV !== 'production') {
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
