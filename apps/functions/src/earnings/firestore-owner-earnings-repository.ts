import {
  BookingCommandError,
  dateOnlySchema,
  paidBookingStateSchema,
  priceSnapshotSchema,
} from '@mmg/contracts';
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
      earningExists: boolean;
      settlementSnapshot: FirebaseFirestore.DocumentSnapshot;
    },
  ): void {
    if (snapshots.earningExists) {
      return; // Idempotent: already created
    }

    const earningRef = this.firestore.doc(`ownerEarnings/${input.bookingId}`);
    const settlementRef = this.firestore.doc(`ownerSettlementState/${input.ownerId}`);

    if (snapshots.settlementSnapshot.exists) {
      const current = snapshots.settlementSnapshot.data();
      const currentPending = typeof current?.pendingKobo === 'number' ? current.pendingKobo : 0;
      transaction.update(settlementRef, {
        pendingKobo: currentPending + input.amountKobo,
        version: (current?.version || 1) + 1,
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
    bookingId: string,
    actor: TripReportEndedActor,
    now: Date = new Date(),
  ): Promise<{ bookingId: string; state: 'completion_pending'; version: number }> {
    return this.firestore.runTransaction(async (transaction) => {
      const bookingRef = this.firestore.doc(`bookings/${bookingId}`);
      const snapshot = await transaction.get(bookingRef);
      if (!snapshot.exists) {
        throw new BookingCommandError('NOT_FOUND', 'Booking was not found.');
      }

      const parsed = bookingSchema.safeParse(snapshot.data());
      if (!parsed.success) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Booking data is invalid.');
      }
      const booking = parsed.data;

      if (booking.ownerId !== actor.uid) {
        throw new BookingCommandError('FORBIDDEN', 'Only the vehicle owner can report the trip ended.');
      }

      const today = lagosDateOnly(now);
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
        reportedEndedAt: Timestamp.fromDate(now),
        reportedEndedBy: actor.uid,
        version: nextVersion,
        updatedAt: Timestamp.fromDate(now),
      });

      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: actor.uid,
        actorType: 'owner',
        entityId: bookingId,
        entityType: 'booking',
        eventType: 'trip.owner_reported_ended',
        fromState: booking.state,
        toState: 'completion_pending',
        occurredAt: Timestamp.fromDate(now),
        details: {
          reportedEarly: today < booking.endDate,
          today,
          startDate: booking.startDate,
          endDate: booking.endDate,
        },
      });

      return { bookingId, state: 'completion_pending' as const, version: nextVersion };
    });
  }

  async confirmBookingCompletion(
    bookingId: string,
    actor: TripCompletionActor,
    now: Date = new Date(),
  ): Promise<{
    bookingId: string;
    bookingState: 'completed';
    earningState: 'available' | 'review_required';
    amountKobo: number;
    version: number;
  }> {
    return this.firestore.runTransaction(async (transaction) => {
      // 1. ALL READS FIRST
      const bookingRef = this.firestore.doc(`bookings/${bookingId}`);
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
      const isRenter = actor.uid === booking.renterId;
      const isOwner = actor.uid === booking.ownerId;
      if (isOwner && !actor.isStaff) {
        throw new BookingCommandError('FORBIDDEN', 'Vehicle owners cannot confirm final booking completion.');
      }
      if (!isRenter && !actor.isStaff) {
        throw new BookingCommandError('FORBIDDEN', 'You are not authorized to confirm completion for this booking.');
      }

      if (booking.state !== 'completion_pending') {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          `Booking must be in completion_pending state to confirm completion (currently "${booking.state}").`,
        );
      }

      // Read earning
      const earningRef = this.firestore.doc(`ownerEarnings/${bookingId}`);
      const earningSnapshot = await transaction.get(earningRef);

      // Read settlement state
      const settlementRef = this.firestore.doc(`ownerSettlementState/${booking.ownerId}`);
      const settlementSnapshot = await transaction.get(settlementRef);

      // Determine earning amount
      let earningAmountKobo: number;
      if (earningSnapshot.exists) {
        const parsedEarning = earningSchema.safeParse(earningSnapshot.data());
        if (!parsedEarning.success) {
          throw new BookingCommandError('FAILED_PRECONDITION', 'Existing owner earning record is invalid.');
        }
        earningAmountKobo = parsedEarning.data.amountKobo;
      } else {
        // Safe ensure from trusted booking price snapshot
        if (!booking.priceSnapshot || typeof booking.priceSnapshot.ownerEarningsKobo !== 'number') {
          throw new BookingCommandError('FAILED_PRECONDITION', 'Booking price snapshot is missing owner earnings.');
        }
        earningAmountKobo = booking.priceSnapshot.ownerEarningsKobo;
      }

      // Check settlement restriction
      const settlementData = settlementSnapshot.exists ? settlementSnapshot.data() : null;
      const hasSettlementHold = Boolean(settlementData?.settlementHold);
      const hasBookingRestriction = Boolean(booking.settlementRestriction);
      const hasRestriction = hasSettlementHold || hasBookingRestriction;

      const targetEarningState = hasRestriction ? ('review_required' as const) : ('available' as const);
      const reviewReason = hasRestriction
        ? (settlementData?.holdReason || (hasBookingRestriction ? 'booking_settlement_restriction' : 'settlement_hold'))
        : null;

      // 2. ALL WRITES AFTER READS
      const nextBookingVersion = booking.version + 1;
      transaction.update(bookingRef, {
        state: 'completed',
        completedAt: Timestamp.fromDate(now),
        completedBy: actor.uid,
        completedByType: isRenter ? 'renter' : 'staff',
        version: nextBookingVersion,
        updatedAt: Timestamp.fromDate(now),
      });

      // Update / Create earning
      if (earningSnapshot.exists) {
        const currentEarning = earningSnapshot.data()!;
        transaction.update(earningRef, {
          state: targetEarningState,
          ...(targetEarningState === 'available' ? { availableAt: Timestamp.fromDate(now) } : {}),
          ...(reviewReason ? { reviewReason } : { reviewReason: FieldValue.delete() }),
          version: (currentEarning.version || 1) + 1,
          updatedAt: Timestamp.fromDate(now),
        });
      } else {
        transaction.create(earningRef, {
          bookingId,
          ownerId: booking.ownerId,
          vehicleId: booking.vehicleId,
          amountKobo: earningAmountKobo,
          currency: 'NGN',
          state: targetEarningState,
          startDate: booking.startDate,
          endDate: booking.endDate,
          vehicleSnapshot: { displayName: booking.vehicleSnapshot?.displayName || 'Vehicle' },
          createdAt: Timestamp.fromDate(now),
          ...(targetEarningState === 'available' ? { availableAt: Timestamp.fromDate(now) } : {}),
          ...(reviewReason ? { reviewReason } : {}),
          version: 1,
          updatedAt: Timestamp.fromDate(now),
        });
      }

      // Update / Create settlement state
      if (settlementSnapshot.exists) {
        const curSettlement = settlementSnapshot.data()!;
        const curPending = typeof curSettlement.pendingKobo === 'number' ? curSettlement.pendingKobo : 0;
        const curAvailable = typeof curSettlement.availableKobo === 'number' ? curSettlement.availableKobo : 0;

        let newPending = curPending;
        let newAvailable = curAvailable;

        if (earningSnapshot.exists) {
          newPending = Math.max(0, curPending - earningAmountKobo);
        }

        if (targetEarningState === 'available') {
          newAvailable = curAvailable + earningAmountKobo;
        }

        transaction.update(settlementRef, {
          pendingKobo: newPending,
          availableKobo: newAvailable,
          version: (curSettlement.version || 1) + 1,
          updatedAt: Timestamp.fromDate(now),
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
          updatedAt: Timestamp.fromDate(now),
        });
      }

      // Write audit events
      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: actor.uid,
        actorType: isRenter ? 'renter' : 'admin',
        entityId: bookingId,
        entityType: 'booking',
        eventType: isRenter ? 'trip.renter_confirmed_complete' : 'trip.admin_confirmed_complete',
        fromState: 'completion_pending',
        toState: 'completed',
        occurredAt: Timestamp.fromDate(now),
        details: {
          earningState: targetEarningState,
          amountKobo: earningAmountKobo,
          completedByType: isRenter ? 'renter' : 'staff',
        },
      });

      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: actor.uid,
        actorType: isRenter ? 'renter' : 'admin',
        entityId: bookingId,
        entityType: 'ownerEarning',
        eventType: targetEarningState === 'available' ? 'earning.released' : 'earning.held_for_review',
        fromState: earningSnapshot.exists ? 'pending' : null,
        toState: targetEarningState,
        occurredAt: Timestamp.fromDate(now),
        details: {
          amountKobo: earningAmountKobo,
          ...(reviewReason ? { reason: reviewReason } : {}),
        },
      });

      if (actor.isStaff) {
        transaction.create(this.firestore.collection('adminAuditLogs').doc(), {
          actorId: actor.uid,
          adminEmail: actor.email || 'staff@mmg.ng',
          action: 'booking.confirm_completion',
          targetType: 'booking',
          targetId: bookingId,
          occurredAt: Timestamp.fromDate(now),
          metadata: {
            ownerId: booking.ownerId,
            amountKobo: earningAmountKobo,
            earningState: targetEarningState,
          },
        });
      }

      return {
        bookingId,
        bookingState: 'completed' as const,
        earningState: targetEarningState,
        amountKobo: earningAmountKobo,
        version: nextBookingVersion,
      };
    });
  }

  async progressBookingLifecycle(
    now: Date = new Date(),
    batchLimit = 50,
  ): Promise<{ scanned: number; transitioned: number }> {
    const today = lagosDateOnly(now);
    const candidateSnapshot = await this.firestore
      .collection('bookings')
      .where('state', 'in', ['confirmed', 'in_progress'])
      .limit(batchLimit)
      .get();

    let transitioned = 0;

    for (const doc of candidateSnapshot.docs) {
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
        await this.firestore.runTransaction(async (transaction) => {
          const fresh = await transaction.get(doc.ref);
          if (!fresh.exists) return;
          const current = bookingSchema.safeParse(fresh.data());
          if (!current.success || current.data.version !== booking.version || current.data.state !== booking.state) {
            return;
          }

          const freshTargetState = evaluateBookingLifecycleProgression(
            current.data.state,
            current.data.startDate,
            current.data.endDate,
            today,
          );
          if (!freshTargetState || freshTargetState === current.data.state) return;

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
        });
        transitioned += 1;
      } catch {
        // Continue scanning remaining batch items on concurrency conflicts
      }
    }

    return { scanned: candidateSnapshot.docs.length, transitioned };
  }

  async setOwnerSettlementHold(
    input: { ownerId: string; hold: boolean; reason?: string },
    actor: SettlementHoldActor,
    now: Date = new Date(),
  ): Promise<{ ownerId: string; settlementHold: boolean; version: number }> {
    return this.firestore.runTransaction(async (transaction) => {
      const ref = this.firestore.doc(`ownerSettlementState/${input.ownerId}`);
      const snapshot = await transaction.get(ref);

      let nextVersion = 1;
      if (snapshot.exists) {
        const current = settlementStateSchema.parse(snapshot.data());
        nextVersion = current.version + 1;
        transaction.update(ref, {
          settlementHold: input.hold,
          holdReason: input.hold ? input.reason || 'Admin hold' : FieldValue.delete(),
          version: nextVersion,
          updatedAt: Timestamp.fromDate(now),
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
          updatedAt: Timestamp.fromDate(now),
        });
      }

      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: actor.uid,
        actorType: 'admin',
        entityId: input.ownerId,
        entityType: 'ownerSettlement',
        eventType: input.hold ? 'settlement.hold_applied' : 'settlement.hold_released',
        fromState: snapshot.exists ? String(snapshot.data()?.settlementHold) : 'false',
        toState: String(input.hold),
        occurredAt: Timestamp.fromDate(now),
        details: { reason: input.reason || null },
      });

      transaction.create(this.firestore.collection('adminAuditLogs').doc(), {
        actorId: actor.uid,
        adminEmail: actor.email || 'staff@mmg.ng',
        action: input.hold ? 'settlement.apply_hold' : 'settlement.release_hold',
        targetType: 'ownerSettlement',
        targetId: input.ownerId,
        occurredAt: Timestamp.fromDate(now),
        metadata: { hold: input.hold, reason: input.reason || null },
      });

      return { ownerId: input.ownerId, settlementHold: input.hold, version: nextVersion };
    });
  }

  async holdEarningForReview(
    input: { bookingId: string; reason: string },
    actor: SettlementHoldActor,
    now: Date = new Date(),
  ): Promise<{ bookingId: string; state: 'review_required'; version: number }> {
    return this.firestore.runTransaction(async (transaction) => {
      const earningRef = this.firestore.doc(`ownerEarnings/${input.bookingId}`);
      const earningSnapshot = await transaction.get(earningRef);
      if (!earningSnapshot.exists) {
        throw new BookingCommandError('NOT_FOUND', 'Owner earning not found.');
      }
      const earning = earningSchema.parse(earningSnapshot.data());

      const settlementRef = this.firestore.doc(`ownerSettlementState/${earning.ownerId}`);
      const settlementSnapshot = await transaction.get(settlementRef);

      const nextEarningVersion = earning.version + 1;
      transaction.update(earningRef, {
        state: 'review_required',
        reviewReason: input.reason,
        version: nextEarningVersion,
        updatedAt: Timestamp.fromDate(now),
      });

      if (earning.state === 'available' && settlementSnapshot.exists) {
        const settlement = settlementStateSchema.parse(settlementSnapshot.data());
        const newAvailable = Math.max(0, settlement.availableKobo - earning.amountKobo);
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
        adminEmail: actor.email || 'staff@mmg.ng',
        action: 'earning.hold_for_review',
        targetType: 'ownerEarning',
        targetId: input.bookingId,
        occurredAt: Timestamp.fromDate(now),
        metadata: { reason: input.reason, amountKobo: earning.amountKobo },
      });

      return { bookingId: input.bookingId, state: 'review_required' as const, version: nextEarningVersion };
    });
  }
}
