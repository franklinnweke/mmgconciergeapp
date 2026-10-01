import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

import { isProductionAppCheck } from '../app-check-env.js';
import { CommandError } from '../errors.js';
import {
  confirmBookingCompletion as confirmBookingCompletionService,
  reportTripEnded as reportTripEndedService,
  setOwnerSettlementHold as setOwnerSettlementHoldService,
} from './owner-earnings-service.js';

const callableRuntimeOptions = {
  region: 'africa-south1',
  invoker: 'public' as const,
  timeoutSeconds: 30,
  memory: '256MiB' as const,
};

const httpsCode = {
  UNAUTHENTICATED: 'unauthenticated',
  FORBIDDEN: 'permission-denied',
  INVALID_ARGUMENT: 'invalid-argument',
  NOT_FOUND: 'not-found',
  FAILED_PRECONDITION: 'failed-precondition',
  ALREADY_EXISTS: 'already-exists',
  IDEMPOTENCY_CONFLICT: 'already-exists',
  VEHICLE_UNAVAILABLE: 'failed-precondition',
  CONFIGURATION_UNAVAILABLE: 'unavailable',
  INTERNAL: 'internal',
  INVALID_STATE_TRANSITION: 'failed-precondition',
  PROFILE_INCOMPLETE: 'failed-precondition',
} as const;

function rethrow(error: unknown, fallback: string): never {
  if (error instanceof CommandError) {
    const code = httpsCode[error.code as keyof typeof httpsCode] || 'failed-precondition';
    throw new HttpsError(code, error.message, { code: error.code, ...error.safeDetails });
  }
  if (error instanceof z.ZodError) {
    throw new HttpsError('invalid-argument', 'Trip completion command payload is invalid.', {
      issues: error.issues,
    });
  }
  logger.error(fallback, { error });
  throw new HttpsError('internal', 'Trip completion operation could not be completed.');
}

export const reportTripEnded = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(),
  },
  async (request) => {
    try {
      if (!request.auth?.uid) {
        throw new CommandError('UNAUTHENTICATED', 'Sign in to report trip ended.');
      }
      if (request.auth.token.email_verified !== true) {
        throw new CommandError('FORBIDDEN', 'Verify your email before managing trips.');
      }

      const result = await reportTripEndedService(request.data, { uid: request.auth.uid });
      logger.info('trip.owner_reported_ended', {
        requestId: result.requestId,
        bookingId: result.result.bookingId,
      });
      return result;
    } catch (error) {
      return rethrow(error, 'trip.report_ended_failed');
    }
  },
);

export const confirmBookingCompletion = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(),
  },
  async (request) => {
    try {
      if (!request.auth?.uid) {
        throw new CommandError('UNAUTHENTICATED', 'Sign in to confirm trip completion.');
      }
      if (request.auth.token.email_verified !== true) {
        throw new CommandError('FORBIDDEN', 'Verify your email before confirming trip completion.');
      }

      const isStaff = Boolean(
        request.auth.token.super_admin === true ||
        request.auth.token.support === true ||
        request.auth.token['bookings.complete_trip'] === true,
      );

      const actor = {
        uid: request.auth.uid,
        email: typeof request.auth.token.email === 'string' ? request.auth.token.email : undefined,
        isStaff,
        role: isStaff ? (request.auth.token.super_admin ? 'super_admin' : 'support') : undefined,
      };

      const result = await confirmBookingCompletionService(request.data, actor);
      logger.info('trip.confirmed_complete', {
        requestId: result.requestId,
        bookingId: result.result.bookingId,
        earningState: result.result.earningState,
      });
      return result;
    } catch (error) {
      return rethrow(error, 'trip.confirm_completion_failed');
    }
  },
);

export const setOwnerSettlementHold = onCall(
  {
    ...callableRuntimeOptions,
    enforceAppCheck: isProductionAppCheck(),
  },
  async (request) => {
    try {
      if (!request.auth?.uid) {
        throw new CommandError('UNAUTHENTICATED', 'Sign in to manage settlement holds.');
      }
      const isFinance = Boolean(
        request.auth.token.super_admin === true || request.auth.token.finance_admin === true,
      );
      if (!isFinance) {
        throw new CommandError(
          'FORBIDDEN',
          'Finance administrator privileges required to manage settlement holds.',
        );
      }

      const actor = {
        uid: request.auth.uid,
        email: typeof request.auth.token.email === 'string' ? request.auth.token.email : undefined,
        role: request.auth.token.super_admin === true ? ('super_admin' as const) : ('finance_admin' as const),
      };

      const result = await setOwnerSettlementHoldService(request.data, actor);
      logger.info('settlement.hold_updated', {
        requestId: result.requestId,
        ownerId: result.result.ownerId,
        settlementHold: result.result.settlementHold,
      });
      return result;
    } catch (error) {
      return rethrow(error, 'settlement.set_hold_failed');
    }
  },
);
