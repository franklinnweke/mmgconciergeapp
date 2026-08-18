'use server';

import 'server-only';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  BookingCommandError,
  canonicalErrorCodeSchema,
  commandSafeReasonSchema,
} from '@mmg/contracts';

import { getAdminFirestore } from '@/features/auth/server/firebase-admin';
import { assertSameOrigin } from '@/features/auth/server/same-origin';
import {
  requireLiveStaffSession,
  staffActorRole,
  staffSessionHasCapability,
} from '@/features/auth/server/session';
import { FirestoreBookingRepository } from '@mmg/functions-booking/firestore-booking-repository';
import { staffConfirmBooking } from '@mmg/functions-booking/staff-confirm-booking-service';
import { staffRejectBooking } from '@mmg/functions-booking/staff-reject-booking-service';

export type ExecuteBookingActionInput = {
  bookingId: string;
  expectedVersion: number;
  action: 'confirm' | 'reject';
  adminNotes?: string;
  rejectionReason?: 'owner_declined' | 'vehicle_maintenance' | 'pricing_error' | 'chauffeur_unavailable' | 'safety_hold';
  rejectionDetails?: string;
  idempotencyKey?: string;
};

export type ExecuteBookingActionResult =
  | { success: true; state: string; version: number; updatedAt: string }
  | { success: false; error: string };

const GENERIC_BOOKING_ERROR = 'The booking operations action could not be completed. Please try again.';

function safeBookingErrorMessage(error: unknown): string {
  if (!(error instanceof BookingCommandError)) return GENERIC_BOOKING_ERROR;

  const code = canonicalErrorCodeSchema.safeParse(error.code);
  if (!code.success) return GENERIC_BOOKING_ERROR;

  const reason = error.safeDetails?.reason;
  if (reason !== undefined && !commandSafeReasonSchema.safeParse(reason).success) {
    return GENERIC_BOOKING_ERROR;
  }

  if (code.data === 'FORBIDDEN' && reason === 'not_staff') {
    return 'You are not authorized to perform actions on this booking.';
  }
  if (code.data === 'NOT_FOUND') return 'That booking record is no longer available.';
  if (code.data === 'FAILED_PRECONDITION' && reason === 'stale_version') {
    return 'This booking record has changed. Refresh the queue and try again.';
  }
  if (code.data === 'INVALID_STATE_TRANSITION') {
    return 'That booking cannot transition to the requested state.';
  }
  if (code.data === 'INVALID_ARGUMENT') return 'Check the action details and try again.';
  if (code.data === 'IDEMPOTENCY_CONFLICT') {
    return 'This action conflicts with an earlier attempt. Refresh and try again.';
  }
  return GENERIC_BOOKING_ERROR;
}

export async function executeBookingAction(
  input: ExecuteBookingActionInput,
): Promise<ExecuteBookingActionResult> {
  try {
    assertSameOrigin(await headers());

    const session = await requireLiveStaffSession();

    // In fixture mode, simulate the operation without writing to live Firestore
    if (process.env.MMG_ADMIN_FIXTURES === '1' && process.env.NODE_ENV !== 'production') {
      const now = new Date().toISOString();
      const state = input.action === 'confirm' ? 'confirmed' : 'intervention_required';

      revalidatePath('/');

      return {
        success: true,
        state,
        version: input.expectedVersion + 1,
        updatedAt: now,
      };
    }

    const idempotencyKey =
      input.idempotencyKey ||
      `action-book-${input.bookingId}-${input.action}-${input.expectedVersion}`;

    const actorRole = staffActorRole(session, ['super_admin', 'booking_admin'] as const);
    if (!actorRole || !staffSessionHasCapability(session, 'bookings.review')) {
      return {
        success: false,
        error: 'You are not authorized to perform booking operations.',
      };
    }

    const authContext = {
      uid: session.uid,
      token: {
        email: session.email,
        email_verified: true,
        [actorRole]: true,
      },
    };

    const repository = new FirestoreBookingRepository(getAdminFirestore());

    if (input.action === 'confirm') {
      const result = await staffConfirmBooking(
        {
          schemaVersion: 1,
          idempotencyKey,
          data: {
            bookingId: input.bookingId,
            expectedVersion: input.expectedVersion,
            adminNotes: input.adminNotes,
          },
        },
        authContext,
        { repository },
      );

      revalidatePath('/');

      return {
        success: true,
        state: result.result.state,
        version: result.result.version,
        updatedAt: result.result.updatedAt,
      };
    } else {
      const result = await staffRejectBooking(
        {
          schemaVersion: 1,
          idempotencyKey,
          data: {
            bookingId: input.bookingId,
            expectedVersion: input.expectedVersion,
            reason: input.rejectionReason ?? 'chauffeur_unavailable',
            details: input.rejectionDetails,
            adminNotes: input.adminNotes,
          },
        },
        authContext,
        { repository },
      );

      revalidatePath('/');

      return {
        success: true,
        state: result.result.state,
        version: result.result.version,
        updatedAt: result.result.updatedAt,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: safeBookingErrorMessage(error),
    };
  }
}
