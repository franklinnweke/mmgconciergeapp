import { randomUUID } from 'node:crypto';

import {
  BookingCommandError,
  dateOnlySchema,
  paidBookingStateSchema,
  priceSnapshotSchema,
} from '@mmg/contracts';
import {
  confirmBookingCompletionEnvelopeSchema,
  confirmBookingCompletionResultSchema,
  reportTripEndedEnvelopeSchema,
  reportTripEndedResultSchema,
  setOwnerSettlementHoldEnvelopeSchema,
  setOwnerSettlementHoldResultSchema,
  type ConfirmBookingCompletionEnvelope,
  type ConfirmBookingCompletionResult,
  type ReportTripEndedEnvelope,
  type ReportTripEndedResult,
  type SetOwnerSettlementHoldEnvelope,
  type SetOwnerSettlementHoldResult,
} from '@mmg/contracts/earnings';
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { z } from 'zod';

import {
  canOwnerReportTripEnded,
  evaluateBookingLifecycleProgression,
} from '@mmg/domain';

import type {
  ConfirmBookingCompletionInput,
  ReportTripEndedInput,
  SetOwnerSettlementHoldInput,
  SettlementHoldActor,
  StoredBookingForLifecycle,
  StoredOwnerEarning,
  StoredOwnerSettlementState,
  TripCompletionActor,
  TripReportEndedActor,
} from './types.js';

export function lagosDateOnly(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Africa/Lagos',
    year: 'numeric',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const bookingSchema = z.object({
  bookingId: z.string().min(1).max(128),
  ownerId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  renterId: z.string().min(1).max(128),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  state: paidBookingStateSchema,
  version: z.number().int().positive(),
  priceSnapshot: priceSnapshotSchema.optional(),
  vehicleSnapshot: z.object({ displayName: z.string() }).passthrough().optional(),
  settlementRestriction: z.boolean().optional(),
}).passthrough();

const earningSchema = z.object({
  bookingId: z.string().min(1).max(128),
  ownerId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  amountKobo: z.number().int().nonnegative(),
  currency: z.literal('NGN'),
  state: z.enum(['pending', 'available', 'review_required']),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  vehicleSnapshot: z.object({ displayName: z.string() }),
  version: z.number().int().positive(),
  availableAt: z.any().optional().nullable(),
  reviewReason: z.string().optional().nullable(),
}).passthrough();

const settlementStateSchema = z.object({
  ownerId: z.string().min(1).max(128),
  pendingKobo: z.number().int().nonnegative(),
  availableKobo: z.number().int().nonnegative(),
  reservedKobo: z.number().int().nonnegative(),
  activePayoutId: z.string().nullable(),
  settlementHold: z.boolean(),
  holdReason: z.string().optional().nullable(),
  version: z.number().int().positive(),
}).passthrough();

export class FirestoreOwnerEarningsRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  /**
   * Atomically records a pending owner earning and increments ownerSettlementState.pendingKobo.
   * Assumes earningSnapshot and settlementSnapshot were read beforehand if inside an existing transaction,
   * or can be passed as pre-read snapshots.
   */
  recordPendingEarningInTransaction(
    transaction: Transaction,
    input: {
      bookingId: string;
      ownerId: string;
      vehicleId: string;
      amountKobo: number;
      startDate: string;
      endDate: string;
      vehicleDisplayName: string;
      now: Date;
    },
    snapshots: {
      earningSnapshot?: FirebaseFirestore.DocumentSnapshot;
      earningExists?: boolean;
      settlementSnapshot: FirebaseFirestore.DocumentSnapshot;
    },
  ): void {
    const earningRef = this.firestore.doc(`ownerEarnings/${input.bookingId}`);
    const settlementRef = this.firestore.doc(`ownerSettlementState/${input.ownerId}`);

    if (snapshots.earningSnapshot?.exists) {
      const parsedEarning = earningSchema.safeParse(snapshots.earningSnapshot.data());
      if (!parsedEarning.success) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          'Existing owner earning record is invalid or malformed.',
        );
      }
      const existingEarning = parsedEarning.data;
      if (
        existingEarning.bookingId !== input.bookingId ||
        existingEarning.ownerId !== input.ownerId ||
        existingEarning.vehicleId !== input.vehicleId ||
        existingEarning.amountKobo !== input.amountKobo ||
        existingEarning.state !== 'pending'
      ) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          'Existing owner earning record conflicts with booking financial details.',
        );
      }

      if (!snapshots.settlementSnapshot?.exists) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          'Owner settlement state document is missing for existing pending earning.',
        );
      }
      const parsedSettlement = settlementStateSchema.safeParse(snapshots.settlementSnapshot.data());
      if (!parsedSettlement.success || parsedSettlement.data.ownerId !== input.ownerId) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          'Existing owner settlement state document is invalid or malformed.',
        );
      }
      if (parsedSettlement.data.pendingKobo < input.amountKobo) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          'Owner settlement pending balance is insufficient for existing pending earning.',
        );
      }
      return; // Idempotent: verified consistent pending earning already exists
    } else if (snapshots.earningExists && !snapshots.earningSnapshot) {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        'Cannot verify existing owner earning without document snapshot.',
      );
    }

    if (snapshots.settlementSnapshot.exists) {
      const parsedSettlement = settlementStateSchema.safeParse(snapshots.settlementSnapshot.data());
      if (!parsedSettlement.success || parsedSettlement.data.ownerId !== input.ownerId) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          'Existing owner settlement state document is invalid or malformed.',
        );
      }
      const current = parsedSettlement.data;
      transaction.update(settlementRef, {
        pendingKobo: current.pendingKobo + input.amountKobo,
        version: current.version + 1,
        updatedAt: Timestamp.fromDate(input.now),
      });
    } else {
      transaction.create(settlementRef, {
        ownerId: input.ownerId,
        pendingKobo: input.amountKobo,
        availableKobo: 0,
        reservedKobo: 0,
        activePayoutId: null,
        settlementHold: false,
        version: 1,
        updatedAt: Timestamp.fromDate(input.now),
      });
    }

    transaction.create(earningRef, {
      bookingId: input.bookingId,
      ownerId: input.ownerId,
      vehicleId: input.vehicleId,
      amountKobo: input.amountKobo,
      currency: 'NGN',
      state: 'pending',
      startDate: input.startDate,
      endDate: input.endDate,
      vehicleSnapshot: { displayName: input.vehicleDisplayName },
      createdAt: Timestamp.fromDate(input.now),
      updatedAt: Timestamp.fromDate(input.now),
      version: 1,
    });

    transaction.create(this.firestore.collection('auditEvents').doc(), {
      actorId: 'system',
      actorType: 'system',
      entityId: input.bookingId,
      entityType: 'ownerEarning',
      eventType: 'earning.created',
      fromState: null,
      toState: 'pending',
      occurredAt: Timestamp.fromDate(input.now),
      details: { amountKobo: input.amountKobo, ownerId: input.ownerId, vehicleId: input.vehicleId },
    });
  }

  async reportTripEnded(
    input: ReportTripEndedInput,
  ): Promise<ReportTripEndedEnvelope> {
    return this.firestore.runTransaction(async (transaction) => {
      // 1. ALL READS FIRST
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const idempotencySnapshot = await transaction.get(idempotencyRef);
      if (idempotencySnapshot.exists) {
        const stored = idempotencySnapshot.data();
        if (stored?.actorId !== input.actor.uid || stored?.requestHash !== input.requestHash) {
          throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used differently.');
        }
        const envelopeCandidate = stored?.envelope ?? {
          requestId: stored?.requestId ?? input.commandRequestId,
          result: stored?.result,
        };
        return reportTripEndedEnvelopeSchema.parse(envelopeCandidate);
      }

      const bookingRef = this.firestore.doc(`bookings/${input.bookingId}`);
      const snapshot = await transaction.get(bookingRef);
      if (!snapshot.exists) {
        throw new BookingCommandError('NOT_FOUND', 'Booking was not found.');
      }

      const parsed = bookingSchema.safeParse(snapshot.data());
      if (!parsed.success) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Booking data is invalid.');
      }
      const booking = parsed.data;

      if (booking.ownerId !== input.actor.uid) {
        throw new BookingCommandError('FORBIDDEN', 'Only the vehicle owner can report the trip ended.');
      }

      const today = lagosDateOnly(input.now);
      if (!canOwnerReportTripEnded(booking.state, booking.startDate, today)) {
        if (booking.state !== 'confirmed' && booking.state !== 'in_progress') {
          throw new BookingCommandError(
            'FAILED_PRECONDITION',
            `Trip cannot be reported ended from "${booking.state}". It must be confirmed or in progress.`,
          );
        }
        if (today < booking.startDate) {
          throw new BookingCommandError(
            'FAILED_PRECONDITION',
            'Cannot report trip ended before the trip start date.',
          );
        }
      }

      const nextVersion = booking.version + 1;
      transaction.update(bookingRef, {
        state: 'completion_pending',
        reportedEndedAt: Timestamp.fromDate(input.now),
        reportedEndedBy: input.actor.uid,
        version: nextVersion,
        updatedAt: Timestamp.fromDate(input.now),
      });

      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: input.actor.uid,
        actorType: 'owner',
        entityId: input.bookingId,
        entityType: 'booking',
        eventType: 'trip.owner_reported_ended',
        fromState: booking.state,
        toState: 'completion_pending',
        occurredAt: Timestamp.fromDate(input.now),
        details: {
          requestId: input.commandRequestId,
          reportedEarly: today < booking.endDate,
          today,
          startDate: booking.startDate,
          endDate: booking.endDate,
        },
      });

      const envelope: ReportTripEndedEnvelope = {
        requestId: input.commandRequestId,
        result: {
          bookingId: input.bookingId,
          state: 'completion_pending',
          version: nextVersion,
        },
      };

      transaction.create(idempotencyRef, {
        actorId: input.actor.uid,
        commandName: 'reportTripEnded',
        requestHash: input.requestHash,
        requestId: input.commandRequestId,
        result: envelope.result,
        envelope,
        createdAt: Timestamp.fromDate(input.now),
      });

      return envelope;
    });
  }

  async confirmBookingCompletion(
    input: ConfirmBookingCompletionInput,
  ): Promise<ConfirmBookingCompletionEnvelope> {
    return this.firestore.runTransaction(async (transaction) => {
      // 1. ALL READS FIRST
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const idempotencySnapshot = await transaction.get(idempotencyRef);
      if (idempotencySnapshot.exists) {
        const stored = idempotencySnapshot.data();
        if (stored?.actorId !== input.actor.uid || stored?.requestHash !== input.requestHash) {
          throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used differently.');
        }
        const envelopeCandidate = stored?.envelope ?? {
          requestId: stored?.requestId ?? input.commandRequestId,
          result: stored?.result,
        };
        return confirmBookingCompletionEnvelopeSchema.parse(envelopeCandidate);
      }

      const bookingRef = this.firestore.doc(`bookings/${input.bookingId}`);
      const bookingSnapshot = await transaction.get(bookingRef);
      if (!bookingSnapshot.exists) {
        throw new BookingCommandError('NOT_FOUND', 'Booking was not found.');
      }

      const parsedBooking = bookingSchema.safeParse(bookingSnapshot.data());
      if (!parsedBooking.success) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Booking data is invalid.');
      }
      const booking = parsedBooking.data;

      // Authorization check
      const isRenter = input.actor.uid === booking.renterId;
      const isOwner = input.actor.uid === booking.ownerId;
      if (isOwner && !input.actor.isStaff) {
        throw new BookingCommandError('FORBIDDEN', 'Vehicle owners cannot confirm final booking completion.');
      }
      if (!isRenter && !input.actor.isStaff) {
        throw new BookingCommandError('FORBIDDEN', 'You are not authorized to confirm completion for this booking.');
      }

      if (booking.state !== 'completion_pending') {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          `Booking must be in completion_pending state to confirm completion (currently "${booking.state}").`,
        );
      }

      // Read earning
      const earningRef = this.firestore.doc(`ownerEarnings/${input.bookingId}`);
      const earningSnapshot = await transaction.get(earningRef);

      // Read settlement state
      const settlementRef = this.firestore.doc(`ownerSettlementState/${booking.ownerId}`);
      const settlementSnapshot = await transaction.get(settlementRef);

      // Determine earning amount and validate earning invariant (item 1 & 4)
      let earningAmountKobo: number;
      if (earningSnapshot.exists) {
        const parsedEarning = earningSchema.safeParse(earningSnapshot.data());
        if (!parsedEarning.success) {
          throw new BookingCommandError('FAILED_PRECONDITION', 'Existing owner earning record is invalid.');
        }
        if (parsedEarning.data.state !== 'pending') {
          throw new BookingCommandError(
            'FAILED_PRECONDITION',
            `Existing owner earning must be in pending state (currently "${parsedEarning.data.state}").`,
          );
        }
        if (
          parsedEarning.data.bookingId !== input.bookingId ||
          parsedEarning.data.ownerId !== booking.ownerId ||
          parsedEarning.data.vehicleId !== booking.vehicleId
        ) {
          throw new BookingCommandError(
            'FAILED_PRECONDITION',
            'Existing owner earning record conflicts with booking details.',
          );
        }
        earningAmountKobo = parsedEarning.data.amountKobo;
      } else {
        // Safe ensure from trusted booking price snapshot
        if (!booking.priceSnapshot || typeof booking.priceSnapshot.ownerEarningsKobo !== 'number') {
          throw new BookingCommandError('FAILED_PRECONDITION', 'Booking price snapshot is missing owner earnings.');
        }
        earningAmountKobo = booking.priceSnapshot.ownerEarningsKobo;
      }

      // Fail-closed checks on settlement state (no silent clamping, no zero/version 1 defaults)
      let parsedSettlementData: z.infer<typeof settlementStateSchema> | null = null;
      if (settlementSnapshot.exists) {
        const parsedSettlement = settlementStateSchema.safeParse(settlementSnapshot.data());
        if (!parsedSettlement.success || parsedSettlement.data.ownerId !== booking.ownerId) {
          throw new BookingCommandError(
            'FAILED_PRECONDITION',
            'Owner settlement state document is invalid or malformed.',
          );
        }
        parsedSettlementData = parsedSettlement.data;
        if (earningSnapshot.exists && parsedSettlementData.pendingKobo < earningAmountKobo) {
          throw new BookingCommandError(
            'FAILED_PRECONDITION',
            'Settlement pending balance is insufficient for earning release.',
          );
        }
      } else if (earningSnapshot.exists) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          'Owner settlement state document is missing for existing earning release.',
        );
      }

      // Check settlement restriction
      const hasSettlementHold = Boolean(parsedSettlementData?.settlementHold);
      const hasBookingRestriction = Boolean(booking.settlementRestriction);
      const hasRestriction = hasSettlementHold || hasBookingRestriction;

      const targetEarningState = hasRestriction ? ('review_required' as const) : ('available' as const);
      const reviewReason = hasRestriction
        ? (parsedSettlementData?.holdReason || (hasBookingRestriction ? 'booking_settlement_restriction' : 'settlement_hold'))
        : null;

      // 2. ALL WRITES AFTER READS
      const nextBookingVersion = booking.version + 1;
      transaction.update(bookingRef, {
        state: 'completed',
        completedAt: Timestamp.fromDate(input.now),
        completedBy: input.actor.uid,
        completedByType: isRenter ? 'renter' : 'staff',
        version: nextBookingVersion,
        updatedAt: Timestamp.fromDate(input.now),
      });

      // Update / Create earning
      if (earningSnapshot.exists) {
        const currentEarning = earningSnapshot.data()!;
        transaction.update(earningRef, {
          state: targetEarningState,
          ...(targetEarningState === 'available' ? { availableAt: Timestamp.fromDate(input.now) } : {}),
          ...(reviewReason ? { reviewReason } : { reviewReason: FieldValue.delete() }),
          version: (currentEarning.version || 1) + 1,
          updatedAt: Timestamp.fromDate(input.now),
        });
      } else {
        transaction.create(earningRef, {
          bookingId: input.bookingId,
          ownerId: booking.ownerId,
          vehicleId: booking.vehicleId,
          amountKobo: earningAmountKobo,
          currency: 'NGN',
          state: targetEarningState,
          startDate: booking.startDate,
          endDate: booking.endDate,
          vehicleSnapshot: { displayName: booking.vehicleSnapshot?.displayName || 'Vehicle' },
          createdAt: Timestamp.fromDate(input.now),
          ...(targetEarningState === 'available' ? { availableAt: Timestamp.fromDate(input.now) } : {}),
          ...(reviewReason ? { reviewReason } : {}),
          version: 1,
          updatedAt: Timestamp.fromDate(input.now),
        });
      }

      // Update / Create settlement state (strict accounting, fail closed, no Math.max)
      if (parsedSettlementData) {
        let newPending = parsedSettlementData.pendingKobo;
        let newAvailable = parsedSettlementData.availableKobo;

        if (earningSnapshot.exists) {
          newPending = parsedSettlementData.pendingKobo - earningAmountKobo;
        }

        if (targetEarningState === 'available') {
          newAvailable = parsedSettlementData.availableKobo + earningAmountKobo;
        }

        transaction.update(settlementRef, {
          pendingKobo: newPending,
          availableKobo: newAvailable,
          version: parsedSettlementData.version + 1,
          updatedAt: Timestamp.fromDate(input.now),
        });
      } else {
        transaction.create(settlementRef, {
          ownerId: booking.ownerId,
          pendingKobo: 0,
          availableKobo: targetEarningState === 'available' ? earningAmountKobo : 0,
          reservedKobo: 0,
          activePayoutId: null,
          settlementHold: false,
          version: 1,
          updatedAt: Timestamp.fromDate(input.now),
        });
      }

      // Write audit events
      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: input.actor.uid,
        actorType: isRenter ? 'renter' : 'admin',
        entityId: input.bookingId,
        entityType: 'booking',
        eventType: isRenter ? 'trip.renter_confirmed_complete' : 'trip.admin_confirmed_complete',
        fromState: 'completion_pending',
        toState: 'completed',
        occurredAt: Timestamp.fromDate(input.now),
        details: {
          requestId: input.commandRequestId,
          earningState: targetEarningState,
          amountKobo: earningAmountKobo,
          completedByType: isRenter ? 'renter' : 'staff',
        },
      });

      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: input.actor.uid,
        actorType: isRenter ? 'renter' : 'admin',
        entityId: input.bookingId,
        entityType: 'ownerEarning',
        eventType: targetEarningState === 'available' ? 'earning.released' : 'earning.held_for_review',
        fromState: earningSnapshot.exists ? 'pending' : null,
        toState: targetEarningState,
        occurredAt: Timestamp.fromDate(input.now),
        details: {
          requestId: input.commandRequestId,
          amountKobo: earningAmountKobo,
          ...(reviewReason ? { reason: reviewReason } : {}),
        },
      });

      if (input.actor.isStaff) {
        transaction.create(this.firestore.collection('adminAuditLogs').doc(), {
          actorId: input.actor.uid,
          role: input.actor.role || 'support',
          action: 'booking.confirm_completion',
          target: `bookings/${input.bookingId}`,
          reason: null,
          requestId: input.commandRequestId,
          createdAt: Timestamp.fromDate(input.now),
          metadata: {
            ownerId: booking.ownerId,
            amountKobo: earningAmountKobo,
            earningState: targetEarningState,
          },
        });
      }

      const envelope: ConfirmBookingCompletionEnvelope = {
        requestId: input.commandRequestId,
        result: {
          bookingId: input.bookingId,
          bookingState: 'completed',
          earningState: targetEarningState,
          amountKobo: earningAmountKobo,
          version: nextBookingVersion,
        },
      };

      transaction.create(idempotencyRef, {
        actorId: input.actor.uid,
        commandName: 'confirmBookingCompletion',
        requestHash: input.requestHash,
        requestId: input.commandRequestId,
        result: envelope.result,
        envelope,
        createdAt: Timestamp.fromDate(input.now),
      });

      return envelope;
    });
  }

  async progressBookingLifecycle(
    now: Date = new Date(),
    batchLimit = 50,
  ): Promise<{ scanned: number; transitioned: number }> {
    const today = lagosDateOnly(now);
    // Two separate targeted queries ensure future bookings never starve due bookings:
    // 1. confirmed bookings where startDate <= today (due for in_progress or completion_pending)
    // 2. in_progress bookings where endDate <= today (due for completion_pending)
    const [confirmedSnapshot, inProgressSnapshot] = await Promise.all([
      this.firestore
        .collection('bookings')
        .where('state', '==', 'confirmed')
        .where('startDate', '<=', today)
        .orderBy('startDate', 'asc')
        .limit(batchLimit)
        .get(),
      this.firestore
        .collection('bookings')
        .where('state', '==', 'in_progress')
        .where('endDate', '<=', today)
        .orderBy('endDate', 'asc')
        .limit(batchLimit)
        .get(),
    ]);

    const candidateDocs = [...confirmedSnapshot.docs, ...inProgressSnapshot.docs];
    let transitioned = 0;

    for (const doc of candidateDocs) {
      const parsed = bookingSchema.safeParse(doc.data());
      if (!parsed.success) continue;

      const booking = parsed.data;
      const targetState = evaluateBookingLifecycleProgression(
        booking.state,
        booking.startDate,
        booking.endDate,
        today,
      );

      if (!targetState || targetState === booking.state) {
        continue;
      }

      try {
        const didTransition = await this.firestore.runTransaction(async (transaction) => {
          const fresh = await transaction.get(doc.ref);
          if (!fresh.exists) return false;
          const current = bookingSchema.safeParse(fresh.data());
          if (!current.success || current.data.version !== booking.version || current.data.state !== booking.state) {
            return false;
          }

          const freshTargetState = evaluateBookingLifecycleProgression(
            current.data.state,
            current.data.startDate,
            current.data.endDate,
            today,
          );
          if (!freshTargetState || freshTargetState === current.data.state) return false;

          const nextVersion = current.data.version + 1;
          transaction.update(doc.ref, {
            state: freshTargetState,
            version: nextVersion,
            updatedAt: Timestamp.fromDate(now),
            ...(freshTargetState === 'in_progress' ? { startedAt: Timestamp.fromDate(now) } : {}),
            ...(freshTargetState === 'completion_pending' ? { completionPendingAt: Timestamp.fromDate(now) } : {}),
          });

          transaction.create(this.firestore.collection('auditEvents').doc(), {
            actorId: 'system',
            actorType: 'system',
            entityId: doc.id,
            entityType: 'booking',
            eventType: freshTargetState === 'in_progress' ? 'booking.started' : 'booking.completion_pending',
            fromState: current.data.state,
            toState: freshTargetState,
            occurredAt: Timestamp.fromDate(now),
            details: {
              scheduledWorker: true,
              today,
              startDate: current.data.startDate,
              endDate: current.data.endDate,
            },
          });

          return true;
        });

        if (didTransition === true) {
          transitioned += 1;
        }
      } catch {
        // Continue scanning remaining batch items on concurrency conflicts
      }
    }

    return { scanned: candidateDocs.length, transitioned };
  }

  async setOwnerSettlementHold(
    input: SetOwnerSettlementHoldInput,
  ): Promise<SetOwnerSettlementHoldEnvelope> {
    return this.firestore.runTransaction(async (transaction) => {
      // 1. ALL READS FIRST
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const idempotencySnapshot = await transaction.get(idempotencyRef);
      if (idempotencySnapshot.exists) {
        const stored = idempotencySnapshot.data();
        if (stored?.actorId !== input.actor.uid || stored?.requestHash !== input.requestHash) {
          throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used differently.');
        }
        const envelopeCandidate = stored?.envelope ?? {
          requestId: stored?.requestId ?? input.commandRequestId,
          result: stored?.result,
        };
        return setOwnerSettlementHoldEnvelopeSchema.parse(envelopeCandidate);
      }

      const ref = this.firestore.doc(`ownerSettlementState/${input.ownerId}`);
      const snapshot = await transaction.get(ref);

      let nextVersion = 1;
      if (snapshot.exists) {
        const parsedSettlement = settlementStateSchema.safeParse(snapshot.data());
        if (!parsedSettlement.success || parsedSettlement.data.ownerId !== input.ownerId) {
          throw new BookingCommandError(
            'FAILED_PRECONDITION',
            'Owner settlement state document is invalid or malformed.',
          );
        }
        const current = parsedSettlement.data;
        nextVersion = current.version + 1;
        transaction.update(ref, {
          settlementHold: input.hold,
          holdReason: input.hold ? input.reason || 'Admin hold' : FieldValue.delete(),
          version: nextVersion,
          updatedAt: Timestamp.fromDate(input.now),
        });
      } else {
        transaction.create(ref, {
          ownerId: input.ownerId,
          pendingKobo: 0,
          availableKobo: 0,
          reservedKobo: 0,
          activePayoutId: null,
          settlementHold: input.hold,
          holdReason: input.hold ? input.reason || 'Admin hold' : null,
          version: 1,
          updatedAt: Timestamp.fromDate(input.now),
        });
      }

      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: input.actor.uid,
        actorType: 'admin',
        entityId: input.ownerId,
        entityType: 'ownerSettlement',
        eventType: input.hold ? 'settlement.hold_applied' : 'settlement.hold_released',
        fromState: snapshot.exists ? String(snapshot.data()?.settlementHold) : 'false',
        toState: String(input.hold),
        occurredAt: Timestamp.fromDate(input.now),
        details: { requestId: input.commandRequestId, reason: input.reason || null },
      });

      transaction.create(this.firestore.collection('adminAuditLogs').doc(), {
        actorId: input.actor.uid,
        role: input.actor.role || 'finance_admin',
        action: input.hold ? 'settlement.apply_hold' : 'settlement.release_hold',
        target: `ownerSettlement/${input.ownerId}`,
        reason: input.reason || null,
        requestId: input.commandRequestId,
        createdAt: Timestamp.fromDate(input.now),
        metadata: { hold: input.hold, reason: input.reason || null },
      });

      const envelope: SetOwnerSettlementHoldEnvelope = {
        requestId: input.commandRequestId,
        result: {
          ownerId: input.ownerId,
          settlementHold: input.hold,
          version: nextVersion,
        },
      };

      transaction.create(idempotencyRef, {
        actorId: input.actor.uid,
        commandName: 'setOwnerSettlementHold',
        requestHash: input.requestHash,
        requestId: input.commandRequestId,
        result: envelope.result,
        envelope,
        createdAt: Timestamp.fromDate(input.now),
      });

      return envelope;
    });
  }

  async holdEarningForReview(
    input: { bookingId: string; reason: string; requestId?: string },
    actor: SettlementHoldActor,
    now: Date = new Date(),
  ): Promise<{ bookingId: string; state: 'review_required'; version: number }> {
    return this.firestore.runTransaction(async (transaction) => {
      const earningRef = this.firestore.doc(`ownerEarnings/${input.bookingId}`);
      const earningSnapshot = await transaction.get(earningRef);
      if (!earningSnapshot.exists) {
        throw new BookingCommandError('NOT_FOUND', 'Owner earning not found.');
      }
      const parsedEarning = earningSchema.safeParse(earningSnapshot.data());
      if (!parsedEarning.success) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Owner earning record is invalid or malformed.');
      }
      const earning = parsedEarning.data;

      const settlementRef = this.firestore.doc(`ownerSettlementState/${earning.ownerId}`);
      const settlementSnapshot = await transaction.get(settlementRef);

      const nextEarningVersion = earning.version + 1;
      transaction.update(earningRef, {
        state: 'review_required',
        reviewReason: input.reason,
        version: nextEarningVersion,
        updatedAt: Timestamp.fromDate(now),
      });

      if (earning.state === 'available') {
        if (!settlementSnapshot.exists) {
          throw new BookingCommandError(
            'FAILED_PRECONDITION',
            'Owner settlement state document is missing to hold earning for review.',
          );
        }
        const parsedSettlement = settlementStateSchema.safeParse(settlementSnapshot.data());
        if (!parsedSettlement.success || parsedSettlement.data.ownerId !== earning.ownerId) {
          throw new BookingCommandError(
            'FAILED_PRECONDITION',
            'Owner settlement state document is invalid or malformed.',
          );
        }
        const settlement = parsedSettlement.data;
        if (settlement.availableKobo < earning.amountKobo) {
          throw new BookingCommandError(
            'FAILED_PRECONDITION',
            'Settlement available balance is insufficient to hold earning for review.',
          );
        }
        const newAvailable = settlement.availableKobo - earning.amountKobo;
        transaction.update(settlementRef, {
          availableKobo: newAvailable,
          version: settlement.version + 1,
          updatedAt: Timestamp.fromDate(now),
        });
      }

      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: actor.uid,
        actorType: 'admin',
        entityId: input.bookingId,
        entityType: 'ownerEarning',
        eventType: 'earning.held_for_review',
        fromState: earning.state,
        toState: 'review_required',
        occurredAt: Timestamp.fromDate(now),
        details: { reason: input.reason, amountKobo: earning.amountKobo },
      });

      transaction.create(this.firestore.collection('adminAuditLogs').doc(), {
        actorId: actor.uid,
        role: actor.role || 'finance_admin',
        action: 'earning.hold_for_review',
        target: `ownerEarnings/${input.bookingId}`,
        reason: input.reason,
        requestId: input.requestId || randomUUID(),
        createdAt: Timestamp.fromDate(now),
        metadata: { reason: input.reason, amountKobo: earning.amountKobo },
      });

      return { bookingId: input.bookingId, state: 'review_required' as const, version: nextEarningVersion };
    });
  }
}
