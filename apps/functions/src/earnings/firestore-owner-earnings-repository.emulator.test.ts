import { createHash, randomUUID } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FirestoreOwnerEarningsRepository } from './firestore-owner-earnings-repository.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

const now = new Date('2026-10-06T12:00:00.000Z');
const startDate = '2026-10-05';
const endDate = '2026-10-08';

const priceSnapshot = {
  currency: 'NGN' as const,
  chargedDays: 3,
  ownerDailyRateKobo: 35_000_000,
  baseRentalKobo: 105_000_000,
  deliveryFeeKobo: 0,
  serviceFeeBps: 800,
  serviceFeeFixedKobo: 0,
  serviceFeeKobo: 8_400_000,
  ownerCommissionBps: 1500,
  ownerCommissionKobo: 15_750_000,
  ownerEarningsKobo: 89_250_000,
  renterTotalKobo: 113_400_000,
  configVersion: 'pricing-v1',
  termsVersion: 'terms-v1',
  cancellationPolicyVersion: 'cancel-v1',
};

const vehicleSnapshot = {
  displayName: 'Toyota Land Cruiser Prado',
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function idempotencyDocumentId(actorId: string, commandName: string, key: string): string {
  return stableHash({ actorId, commandName, key });
}

async function clearCollection(database: Firestore, name: string) {
  const documents = await database.collection(name).listDocuments();
  await Promise.all(documents.map((document) => document.delete()));
}

async function clearDatabase(database: Firestore) {
  for (const name of [
    'adminAuditLogs',
    'auditEvents',
    'bookings',
    'idempotencyKeys',
    'ownerEarnings',
    'ownerSettlementState',
  ]) {
    await clearCollection(database, name);
  }
}

describeWithEmulator('FirestoreOwnerEarningsRepository emulator', () => {
  let database: Firestore;
  let repository: FirestoreOwnerEarningsRepository;

  beforeAll(() => {
    if (getApps().length === 0) {
      initializeApp({ projectId: 'mmg-concierge-dev' });
    }
    database = getFirestore();
    repository = new FirestoreOwnerEarningsRepository(database);
  });

  beforeEach(async () => {
    await clearDatabase(database);
  });

  afterAll(async () => {
    await clearDatabase(database);
  });

  it('records a pending owner earning and increments settlement pending balance atomically', async () => {
    await database.runTransaction(async (transaction) => {
      const earningSnapshot = await transaction.get(database.doc('ownerEarnings/booking-1'));
      const settlementSnapshot = await transaction.get(database.doc('ownerSettlementState/owner-1'));

      repository.recordPendingEarningInTransaction(
        transaction,
        {
          bookingId: 'booking-1',
          ownerId: 'owner-1',
          vehicleId: 'vehicle-1',
          amountKobo: 89_250_000,
          startDate,
          endDate,
          vehicleDisplayName: 'Toyota Prado',
          now,
        },
        {
          earningSnapshot,
          settlementSnapshot,
        },
      );
    });

    const earningDoc = await database.doc('ownerEarnings/booking-1').get();
    expect(earningDoc.exists).toBe(true);
    expect(earningDoc.data()).toMatchObject({
      bookingId: 'booking-1',
      ownerId: 'owner-1',
      vehicleId: 'vehicle-1',
      amountKobo: 89_250_000,
      state: 'pending',
    });

    const settlementDoc = await database.doc('ownerSettlementState/owner-1').get();
    expect(settlementDoc.exists).toBe(true);
    expect(settlementDoc.data()).toMatchObject({
      ownerId: 'owner-1',
      pendingKobo: 89_250_000,
      availableKobo: 0,
      reservedKobo: 0,
      settlementHold: false,
    });

    // Idempotent retry: does not duplicate or double-count
    await database.runTransaction(async (transaction) => {
      const earningSnapshot = await transaction.get(database.doc('ownerEarnings/booking-1'));
      const settlementSnapshot = await transaction.get(database.doc('ownerSettlementState/owner-1'));

      repository.recordPendingEarningInTransaction(
        transaction,
        {
          bookingId: 'booking-1',
          ownerId: 'owner-1',
          vehicleId: 'vehicle-1',
          amountKobo: 89_250_000,
          startDate,
          endDate,
          vehicleDisplayName: 'Toyota Prado',
          now,
        },
        {
          earningSnapshot,
          settlementSnapshot,
        },
      );
    });

    const settlementDoc2 = await database.doc('ownerSettlementState/owner-1').get();
    expect(settlementDoc2.data()?.pendingKobo).toBe(89_250_000);
  });

  it('allows owner to report trip ended early and transitions to completion_pending with idempotency', async () => {
    await database.doc('bookings/booking-report-1').set({
      bookingId: 'booking-report-1',
      ownerId: 'owner-1',
      renterId: 'renter-1',
      vehicleId: 'vehicle-1',
      startDate: '2026-10-05',
      endDate: '2026-10-10',
      state: 'in_progress',
      version: 2,
      priceSnapshot,
      vehicleSnapshot,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    const idempotencyKey = 'idem-key-report-ended-0001';
    const requestData = { bookingId: 'booking-report-1' };
    const input = {
      bookingId: 'booking-report-1',
      actor: { uid: 'owner-1' },
      commandRequestId: 'req-report-01',
      requestHash: stableHash(requestData),
      idempotencyDocumentId: idempotencyDocumentId('owner-1', 'reportTripEnded', idempotencyKey),
      now, // 2026-10-06 is >= 2026-10-05
    };

    const result = await repository.reportTripEnded(input);

    expect(result.requestId).toBe('req-report-01');
    expect(result.result.bookingId).toBe('booking-report-1');
    expect(result.result.state).toBe('completion_pending');
    expect(result.result.version).toBe(3);

    const updatedBooking = await database.doc('bookings/booking-report-1').get();
    expect(updatedBooking.data()?.state).toBe('completion_pending');
    // Invariant: original dates and pricing must be preserved untouched
    expect(updatedBooking.data()?.startDate).toBe('2026-10-05');
    expect(updatedBooking.data()?.endDate).toBe('2026-10-10');
    expect(updatedBooking.data()?.priceSnapshot?.ownerEarningsKobo).toBe(89_250_000);

    // Idempotent replay: returns same envelope with original requestId and result without re-mutating
    const replayResult = await repository.reportTripEnded(input);
    expect(replayResult).toEqual(result);
    expect(replayResult.requestId).toBe('req-report-01');

    const recheckBooking = await database.doc('bookings/booking-report-1').get();
    expect(recheckBooking.data()?.version).toBe(3);

    // Replay with different payload triggers IDEMPOTENCY_CONFLICT
    const conflictInput = {
      ...input,
      requestHash: stableHash({ bookingId: 'booking-different' }),
    };
    await expect(repository.reportTripEnded(conflictInput)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });

  it('rejects report trip ended before the start date or by non-owner', async () => {
    await database.doc('bookings/booking-future').set({
      bookingId: 'booking-future',
      ownerId: 'owner-1',
      renterId: 'renter-1',
      vehicleId: 'vehicle-1',
      startDate: '2026-10-20',
      endDate: '2026-10-25',
      state: 'confirmed',
      version: 1,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    const badActorInput = {
      bookingId: 'booking-future',
      actor: { uid: 'stranger-99' },
      commandRequestId: 'req-bad-actor',
      requestHash: stableHash({ bookingId: 'booking-future' }),
      idempotencyDocumentId: idempotencyDocumentId('stranger-99', 'reportTripEnded', 'idem-stranger-000001'),
      now,
    };
    await expect(repository.reportTripEnded(badActorInput)).rejects.toThrow(
      'Only the vehicle owner can report the trip ended.',
    );

    const futureInput = {
      bookingId: 'booking-future',
      actor: { uid: 'owner-1' },
      commandRequestId: 'req-future',
      requestHash: stableHash({ bookingId: 'booking-future' }),
      idempotencyDocumentId: idempotencyDocumentId('owner-1', 'reportTripEnded', 'idem-future-00000001'),
      now,
    };
    await expect(repository.reportTripEnded(futureInput)).rejects.toThrow(
      'Cannot report trip ended before the trip start date.',
    );
  });

  it('atomically completes booking, releases pending earning to available, records audit logs, and handles idempotency', async () => {
    await database.doc('bookings/booking-comp-1').set({
      bookingId: 'booking-comp-1',
      ownerId: 'owner-1',
      renterId: 'renter-1',
      vehicleId: 'vehicle-1',
      startDate,
      endDate,
      state: 'completion_pending',
      version: 3,
      priceSnapshot,
      vehicleSnapshot,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    await database.doc('ownerEarnings/booking-comp-1').set({
      bookingId: 'booking-comp-1',
      ownerId: 'owner-1',
      vehicleId: 'vehicle-1',
      amountKobo: 89_250_000,
      currency: 'NGN',
      state: 'pending',
      startDate,
      endDate,
      vehicleSnapshot,
      version: 1,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    await database.doc('ownerSettlementState/owner-1').set({
      ownerId: 'owner-1',
      pendingKobo: 89_250_000,
      availableKobo: 0,
      reservedKobo: 0,
      activePayoutId: null,
      settlementHold: false,
      version: 1,
      updatedAt: Timestamp.fromDate(now),
    });

    const idempotencyKey = 'idem-confirm-complete-0001';
    const requestData = { bookingId: 'booking-comp-1' };
    const input = {
      bookingId: 'booking-comp-1',
      actor: { uid: 'staff-admin-1', isStaff: true, role: 'support' },
      commandRequestId: 'req-confirm-staff-001',
      requestHash: stableHash(requestData),
      idempotencyDocumentId: idempotencyDocumentId('staff-admin-1', 'confirmBookingCompletion', idempotencyKey),
      now,
    };

    const result = await repository.confirmBookingCompletion(input);

    expect(result.requestId).toBe('req-confirm-staff-001');
    expect(result.result.bookingId).toBe('booking-comp-1');
    expect(result.result.bookingState).toBe('completed');
    expect(result.result.earningState).toBe('available');
    expect(result.result.amountKobo).toBe(89_250_000);

    const bookingDoc = await database.doc('bookings/booking-comp-1').get();
    expect(bookingDoc.data()?.state).toBe('completed');
    expect(bookingDoc.data()?.completedByType).toBe('staff');

    const earningDoc = await database.doc('ownerEarnings/booking-comp-1').get();
    expect(earningDoc.data()?.state).toBe('available');
    expect(earningDoc.data()?.availableAt).toBeDefined();

    const settlementDoc = await database.doc('ownerSettlementState/owner-1').get();
    expect(settlementDoc.data()?.pendingKobo).toBe(0);
    expect(settlementDoc.data()?.availableKobo).toBe(89_250_000);

    // Verify normalized admin audit log
    const auditQuery = await database
      .collection('adminAuditLogs')
      .where('target', '==', 'bookings/booking-comp-1')
      .get();
    expect(auditQuery.docs.length).toBe(1);
    const adminLog = auditQuery.docs[0].data();
    expect(adminLog).toMatchObject({
      actorId: 'staff-admin-1',
      role: 'support',
      action: 'booking.confirm_completion',
      target: 'bookings/booking-comp-1',
      requestId: 'req-confirm-staff-001',
    });
    expect(adminLog.createdAt).toBeDefined();

    // Idempotent replay: returns same result without re-mutating
    const replay = await repository.confirmBookingCompletion(input);
    expect(replay).toEqual(result);
    expect(replay.requestId).toBe('req-confirm-staff-001');

    const auditQueryAfterReplay = await database
      .collection('adminAuditLogs')
      .where('target', '==', 'bookings/booking-comp-1')
      .get();
    expect(auditQueryAfterReplay.docs.length).toBe(1);
  });

  it('fails closed if pending settlement balance is insufficient for release', async () => {
    await database.doc('bookings/booking-inconsistent').set({
      bookingId: 'booking-inconsistent',
      ownerId: 'owner-inconsistent',
      renterId: 'renter-1',
      vehicleId: 'vehicle-1',
      startDate,
      endDate,
      state: 'completion_pending',
      version: 3,
      priceSnapshot,
      vehicleSnapshot,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    await database.doc('ownerEarnings/booking-inconsistent').set({
      bookingId: 'booking-inconsistent',
      ownerId: 'owner-inconsistent',
      vehicleId: 'vehicle-1',
      amountKobo: 89_250_000,
      currency: 'NGN',
      state: 'pending',
      startDate,
      endDate,
      vehicleSnapshot,
      version: 1,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    // Inconsistent settlement state: pendingKobo is less than earning amount
    await database.doc('ownerSettlementState/owner-inconsistent').set({
      ownerId: 'owner-inconsistent',
      pendingKobo: 10_000_000, // < 89_250_000
      availableKobo: 0,
      reservedKobo: 0,
      activePayoutId: null,
      settlementHold: false,
      version: 1,
      updatedAt: Timestamp.fromDate(now),
    });

    const input = {
      bookingId: 'booking-inconsistent',
      actor: { uid: 'renter-1', isStaff: false },
      commandRequestId: 'req-fail-closed-01',
      requestHash: stableHash({ bookingId: 'booking-inconsistent' }),
      idempotencyDocumentId: idempotencyDocumentId('renter-1', 'confirmBookingCompletion', 'idem-fail-closed-0001'),
      now,
    };

    // Must fail closed with FAILED_PRECONDITION instead of clamping
    await expect(repository.confirmBookingCompletion(input)).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      message: 'Settlement pending balance is insufficient for earning release.',
    });
  });

  it('owner cannot confirm final completion', async () => {
    await database.doc('bookings/booking-owner-comp').set({
      bookingId: 'booking-owner-comp',
      ownerId: 'owner-1',
      renterId: 'renter-1',
      vehicleId: 'vehicle-1',
      startDate,
      endDate,
      state: 'completion_pending',
      version: 2,
      priceSnapshot,
      vehicleSnapshot,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    const input = {
      bookingId: 'booking-owner-comp',
      actor: { uid: 'owner-1', isStaff: false },
      commandRequestId: 'req-owner-comp',
      requestHash: stableHash({ bookingId: 'booking-owner-comp' }),
      idempotencyDocumentId: idempotencyDocumentId('owner-1', 'confirmBookingCompletion', 'idem-owner-comp-0001'),
      now,
    };

    await expect(repository.confirmBookingCompletion(input)).rejects.toThrow(
      'Vehicle owners cannot confirm final booking completion.',
    );
  });

  it('holds earning in review_required on completion if a settlement hold exists', async () => {
    await database.doc('bookings/booking-hold-1').set({
      bookingId: 'booking-hold-1',
      ownerId: 'owner-hold',
      renterId: 'renter-1',
      vehicleId: 'vehicle-1',
      startDate,
      endDate,
      state: 'completion_pending',
      version: 3,
      priceSnapshot,
      vehicleSnapshot,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    await database.doc('ownerEarnings/booking-hold-1').set({
      bookingId: 'booking-hold-1',
      ownerId: 'owner-hold',
      vehicleId: 'vehicle-1',
      amountKobo: 89_250_000,
      currency: 'NGN',
      state: 'pending',
      startDate,
      endDate,
      vehicleSnapshot,
      version: 1,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    await database.doc('ownerSettlementState/owner-hold').set({
      ownerId: 'owner-hold',
      pendingKobo: 89_250_000,
      availableKobo: 0,
      reservedKobo: 0,
      activePayoutId: null,
      settlementHold: true,
      holdReason: 'Investigation into reported vehicle breakdown',
      version: 2,
      updatedAt: Timestamp.fromDate(now),
    });

    const input = {
      bookingId: 'booking-hold-1',
      actor: { uid: 'renter-1', isStaff: false },
      commandRequestId: 'req-hold-comp',
      requestHash: stableHash({ bookingId: 'booking-hold-1' }),
      idempotencyDocumentId: idempotencyDocumentId('renter-1', 'confirmBookingCompletion', 'idem-hold-comp-000001'),
      now,
    };

    const result = await repository.confirmBookingCompletion(input);

    expect(result.requestId).toBe('req-hold-comp');
    expect(result.result.bookingState).toBe('completed');
    expect(result.result.earningState).toBe('review_required');

    const earningDoc = await database.doc('ownerEarnings/booking-hold-1').get();
    expect(earningDoc.data()?.state).toBe('review_required');
    expect(earningDoc.data()?.reviewReason).toBe('Investigation into reported vehicle breakdown');

    // Invariant: Available kobo remains 0 when restricted
    const settlementDoc = await database.doc('ownerSettlementState/owner-hold').get();
    expect(settlementDoc.data()?.availableKobo).toBe(0);
    expect(settlementDoc.data()?.pendingKobo).toBe(0);
  });

  it('manages administrative settlement hold with idempotency and audit logs', async () => {
    const idempotencyKey = 'idem-settle-hold-0001';
    const requestData = { ownerId: 'owner-1', hold: true, reason: 'Suspected fraudulent vehicle' };
    const input = {
      ownerId: 'owner-1',
      hold: true,
      reason: 'Suspected fraudulent vehicle',
      actor: { uid: 'admin-finance-1', role: 'finance_admin' as const },
      commandRequestId: 'req-admin-hold-01',
      requestHash: stableHash(requestData),
      idempotencyDocumentId: idempotencyDocumentId('admin-finance-1', 'setOwnerSettlementHold', idempotencyKey),
      now,
    };

    const result = await repository.setOwnerSettlementHold(input);
    expect(result.requestId).toBe('req-admin-hold-01');
    expect(result.result.settlementHold).toBe(true);

    const doc = await database.doc('ownerSettlementState/owner-1').get();
    expect(doc.data()?.settlementHold).toBe(true);
    expect(doc.data()?.holdReason).toBe('Suspected fraudulent vehicle');

    // Verify normalized admin audit log
    const auditLogs = await database
      .collection('adminAuditLogs')
      .where('target', '==', 'ownerSettlement/owner-1')
      .get();
    expect(auditLogs.docs.length).toBe(1);
    expect(auditLogs.docs[0].data()).toMatchObject({
      actorId: 'admin-finance-1',
      role: 'finance_admin',
      action: 'settlement.apply_hold',
      target: 'ownerSettlement/owner-1',
      requestId: 'req-admin-hold-01',
    });

    // Idempotent replay
    const replay = await repository.setOwnerSettlementHold(input);
    expect(replay).toEqual(result);
    expect(replay.requestId).toBe('req-admin-hold-01');
  });

  it('progressBookingLifecycle is starvation-immune and advances due bookings even when future bookings exist', async () => {
    // Populate 5 future bookings (startDate > 2026-10-06)
    for (let i = 1; i <= 5; i++) {
      await database.doc(`bookings/future-booking-${i}`).set({
        bookingId: `future-booking-${i}`,
        ownerId: 'owner-1',
        renterId: 'renter-1',
        vehicleId: 'vehicle-1',
        startDate: '2026-10-25',
        endDate: '2026-10-28',
        state: 'confirmed',
        version: 1,
        priceSnapshot,
        vehicleSnapshot,
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
      });
    }

    // 1. Trip starting today (now: 2026-10-06, start: 2026-10-06, end: 2026-10-09) -> in_progress
    await database.doc('bookings/prog-start-today').set({
      bookingId: 'prog-start-today',
      ownerId: 'owner-1',
      renterId: 'renter-1',
      vehicleId: 'vehicle-1',
      startDate: '2026-10-06',
      endDate: '2026-10-09',
      state: 'confirmed',
      version: 1,
      priceSnapshot,
      vehicleSnapshot,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    // 2. Trip reached end date (now: 2026-10-06, start: 2026-10-01, end: 2026-10-06) -> completion_pending
    await database.doc('bookings/prog-end-today').set({
      bookingId: 'prog-end-today',
      ownerId: 'owner-1',
      renterId: 'renter-1',
      vehicleId: 'vehicle-1',
      startDate: '2026-10-01',
      endDate: '2026-10-06',
      state: 'in_progress',
      version: 2,
      priceSnapshot,
      vehicleSnapshot,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    const progressResult = await repository.progressBookingLifecycle(now, 10);
    // Both due bookings MUST be transitioned without being starved by future bookings
    expect(progressResult.transitioned).toBe(2);

    const doc1 = await database.doc('bookings/prog-start-today').get();
    expect(doc1.data()?.state).toBe('in_progress');

    const doc2 = await database.doc('bookings/prog-end-today').get();
    expect(doc2.data()?.state).toBe('completion_pending');

    const futureDoc = await database.doc('bookings/future-booking-1').get();
    expect(futureDoc.data()?.state).toBe('confirmed');
  });

  it('rejects confirmBookingCompletion with FAILED_PRECONDITION when ownerEarnings already exists with state available and does not mutate state', async () => {
    await database.doc('bookings/booking-inv-avail').set({
      bookingId: 'booking-inv-avail',
      ownerId: 'owner-1',
      renterId: 'renter-1',
      vehicleId: 'vehicle-1',
      startDate,
      endDate,
      state: 'completion_pending',
      version: 2,
      priceSnapshot,
      vehicleSnapshot,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    await database.doc('ownerEarnings/booking-inv-avail').set({
      bookingId: 'booking-inv-avail',
      ownerId: 'owner-1',
      vehicleId: 'vehicle-1',
      amountKobo: 89_250_000,
      currency: 'NGN',
      state: 'available',
      startDate,
      endDate,
      vehicleSnapshot,
      version: 2,
      availableAt: Timestamp.fromDate(now),
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    await database.doc('ownerSettlementState/owner-1').set({
      ownerId: 'owner-1',
      pendingKobo: 0,
      availableKobo: 89_250_000,
      reservedKobo: 0,
      activePayoutId: null,
      settlementHold: false,
      version: 2,
      updatedAt: Timestamp.fromDate(now),
    });

    const input = {
      bookingId: 'booking-inv-avail',
      actor: { uid: 'renter-1', isStaff: false },
      commandRequestId: 'req-inv-avail-01',
      requestHash: stableHash({ bookingId: 'booking-inv-avail' }),
      idempotencyDocumentId: idempotencyDocumentId('renter-1', 'confirmBookingCompletion', 'idem-inv-avail-0001'),
      now,
    };

    await expect(repository.confirmBookingCompletion(input)).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      message: 'Existing owner earning must be in pending state (currently "available").',
    });

    // Verify invariant: booking, earning, and settlement state are NOT mutated
    const bookingDoc = await database.doc('bookings/booking-inv-avail').get();
    expect(bookingDoc.data()?.state).toBe('completion_pending');
    expect(bookingDoc.data()?.version).toBe(2);

    const earningDoc = await database.doc('ownerEarnings/booking-inv-avail').get();
    expect(earningDoc.data()?.state).toBe('available');
    expect(earningDoc.data()?.version).toBe(2);

    const settlementDoc = await database.doc('ownerSettlementState/owner-1').get();
    expect(settlementDoc.data()?.pendingKobo).toBe(0);
    expect(settlementDoc.data()?.availableKobo).toBe(89_250_000);
    expect(settlementDoc.data()?.version).toBe(2);
  });

  it('rejects confirmBookingCompletion with FAILED_PRECONDITION when ownerEarnings already exists with state review_required and does not mutate state', async () => {
    await database.doc('bookings/booking-inv-rev').set({
      bookingId: 'booking-inv-rev',
      ownerId: 'owner-1',
      renterId: 'renter-1',
      vehicleId: 'vehicle-1',
      startDate,
      endDate,
      state: 'completion_pending',
      version: 2,
      priceSnapshot,
      vehicleSnapshot,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    await database.doc('ownerEarnings/booking-inv-rev').set({
      bookingId: 'booking-inv-rev',
      ownerId: 'owner-1',
      vehicleId: 'vehicle-1',
      amountKobo: 89_250_000,
      currency: 'NGN',
      state: 'review_required',
      reviewReason: 'Investigation hold',
      startDate,
      endDate,
      vehicleSnapshot,
      version: 2,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    await database.doc('ownerSettlementState/owner-1').set({
      ownerId: 'owner-1',
      pendingKobo: 0,
      availableKobo: 0,
      reservedKobo: 0,
      activePayoutId: null,
      settlementHold: true,
      version: 2,
      updatedAt: Timestamp.fromDate(now),
    });

    const input = {
      bookingId: 'booking-inv-rev',
      actor: { uid: 'renter-1', isStaff: false },
      commandRequestId: 'req-inv-rev-01',
      requestHash: stableHash({ bookingId: 'booking-inv-rev' }),
      idempotencyDocumentId: idempotencyDocumentId('renter-1', 'confirmBookingCompletion', 'idem-inv-rev-0001'),
      now,
    };

    await expect(repository.confirmBookingCompletion(input)).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      message: 'Existing owner earning must be in pending state (currently "review_required").',
    });

    // Invariant: no mutation
    const bookingDoc = await database.doc('bookings/booking-inv-rev').get();
    expect(bookingDoc.data()?.state).toBe('completion_pending');

    const earningDoc = await database.doc('ownerEarnings/booking-inv-rev').get();
    expect(earningDoc.data()?.state).toBe('review_required');

    const settlementDoc = await database.doc('ownerSettlementState/owner-1').get();
    expect(settlementDoc.data()?.availableKobo).toBe(0);
  });

  it('progressBookingLifecycle returns accurate transitioned count and does not increment on stale records or concurrency race', async () => {
    await database.doc('bookings/prog-race-1').set({
      bookingId: 'prog-race-1',
      ownerId: 'owner-1',
      renterId: 'renter-1',
      vehicleId: 'vehicle-1',
      startDate: '2026-10-06',
      endDate: '2026-10-09',
      state: 'confirmed',
      version: 1,
      priceSnapshot,
      vehicleSnapshot,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    const origRunTransaction = database.runTransaction.bind(database);
    let runCount = 0;
    vi.spyOn(database, 'runTransaction').mockImplementation(async (updateFunction, options) => {
      runCount++;
      if (runCount === 1) {
        // Mutate the doc before the transaction reads it, simulating a concurrent transition that changed version
        await database.doc('bookings/prog-race-1').update({ version: 2, state: 'in_progress' });
      }
      return origRunTransaction(updateFunction, options);
    });

    const progressResult = await repository.progressBookingLifecycle(now, 10);
    // Scanned was 1, but transitioned MUST NOT be incremented because stale record was detected
    expect(progressResult.scanned).toBe(1);
    expect(progressResult.transitioned).toBe(0);
    vi.restoreAllMocks();
  });

  it('recordPendingEarningInTransaction fails closed when ownerSettlementState exists with malformed data', async () => {
    await database.doc('ownerSettlementState/owner-malformed').set({
      ownerId: 'owner-malformed',
      pendingKobo: 'not-a-number' as any,
      availableKobo: 0,
      reservedKobo: 0,
      settlementHold: false,
      version: 1,
      updatedAt: Timestamp.fromDate(now),
    });

    await database.runTransaction(async (transaction) => {
      const earningSnapshot = await transaction.get(database.doc('ownerEarnings/booking-mal-1'));
      const settlementSnapshot = await transaction.get(database.doc('ownerSettlementState/owner-malformed'));

      expect(() => {
        repository.recordPendingEarningInTransaction(
          transaction,
          {
            bookingId: 'booking-mal-1',
            ownerId: 'owner-malformed',
            vehicleId: 'vehicle-1',
            amountKobo: 89_250_000,
            startDate,
            endDate,
            vehicleDisplayName: 'Toyota Prado',
            now,
          },
          {
            earningSnapshot,
            settlementSnapshot,
          },
        );
      }).toThrow('Existing owner settlement state document is invalid or malformed.');
    });
  });

  it('recordPendingEarningInTransaction fails closed when ownerEarnings already exists with conflicting amount, owner, or state', async () => {
    // 1. Conflict on amount
    await database.doc('ownerEarnings/booking-conflict-amt').set({
      bookingId: 'booking-conflict-amt',
      ownerId: 'owner-1',
      vehicleId: 'vehicle-1',
      amountKobo: 50_000_000, // Conflicts with 89_250_000
      currency: 'NGN',
      state: 'pending',
      startDate,
      endDate,
      vehicleSnapshot,
      version: 1,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    await database.runTransaction(async (transaction) => {
      const earningSnapshot = await transaction.get(database.doc('ownerEarnings/booking-conflict-amt'));
      const settlementSnapshot = await transaction.get(database.doc('ownerSettlementState/owner-1'));

      expect(() => {
        repository.recordPendingEarningInTransaction(
          transaction,
          {
            bookingId: 'booking-conflict-amt',
            ownerId: 'owner-1',
            vehicleId: 'vehicle-1',
            amountKobo: 89_250_000,
            startDate,
            endDate,
            vehicleDisplayName: 'Toyota Prado',
            now,
          },
          {
            earningSnapshot,
            settlementSnapshot,
          },
        );
      }).toThrow('Existing owner earning record conflicts with booking financial details.');
    });

    // 2. Conflict on state (already available)
    await database.doc('ownerEarnings/booking-conflict-st').set({
      bookingId: 'booking-conflict-st',
      ownerId: 'owner-1',
      vehicleId: 'vehicle-1',
      amountKobo: 89_250_000,
      currency: 'NGN',
      state: 'available', // Conflicts with pending
      startDate,
      endDate,
      vehicleSnapshot,
      version: 1,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    await database.runTransaction(async (transaction) => {
      const earningSnapshot = await transaction.get(database.doc('ownerEarnings/booking-conflict-st'));
      const settlementSnapshot = await transaction.get(database.doc('ownerSettlementState/owner-1'));

      expect(() => {
        repository.recordPendingEarningInTransaction(
          transaction,
          {
            bookingId: 'booking-conflict-st',
            ownerId: 'owner-1',
            vehicleId: 'vehicle-1',
            amountKobo: 89_250_000,
            startDate,
            endDate,
            vehicleDisplayName: 'Toyota Prado',
            now,
          },
          {
            earningSnapshot,
            settlementSnapshot,
          },
        );
      }).toThrow('Existing owner earning record conflicts with booking financial details.');
    });
  });

  it('recordPendingEarningInTransaction fails closed when ownerEarnings already exists with malformed data', async () => {
    await database.doc('ownerEarnings/booking-corrupt-data').set({
      bookingId: 'booking-corrupt-data',
      ownerId: 'owner-1',
      amountKobo: 'corrupt-string',
      version: 1,
    });

    await database.runTransaction(async (transaction) => {
      const earningSnapshot = await transaction.get(database.doc('ownerEarnings/booking-corrupt-data'));
      const settlementSnapshot = await transaction.get(database.doc('ownerSettlementState/owner-1'));

      expect(() => {
        repository.recordPendingEarningInTransaction(
          transaction,
          {
            bookingId: 'booking-corrupt-data',
            ownerId: 'owner-1',
            vehicleId: 'vehicle-1',
            amountKobo: 89_250_000,
            startDate,
            endDate,
            vehicleDisplayName: 'Toyota Prado',
            now,
          },
          {
            earningSnapshot,
            settlementSnapshot,
          },
        );
      }).toThrow('Existing owner earning record is invalid or malformed.');
    });
  });

  it('recordPendingEarningInTransaction fails closed when existing pending earning has missing ownerSettlementState', async () => {
    await database.doc('ownerEarnings/booking-valid-earning-1').set({
      bookingId: 'booking-valid-earning-1',
      ownerId: 'owner-1',
      vehicleId: 'vehicle-1',
      amountKobo: 89_250_000,
      currency: 'NGN',
      state: 'pending',
      startDate,
      endDate,
      vehicleSnapshot,
      version: 1,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });
    await database.doc('ownerSettlementState/owner-1').delete();

    await database.runTransaction(async (transaction) => {
      const earningSnapshot = await transaction.get(database.doc('ownerEarnings/booking-valid-earning-1'));
      const settlementSnapshot = await transaction.get(database.doc('ownerSettlementState/owner-1'));

      expect(() => {
        repository.recordPendingEarningInTransaction(
          transaction,
          {
            bookingId: 'booking-valid-earning-1',
            ownerId: 'owner-1',
            vehicleId: 'vehicle-1',
            amountKobo: 89_250_000,
            startDate,
            endDate,
            vehicleDisplayName: 'Toyota Prado',
            now,
          },
          {
            earningSnapshot,
            settlementSnapshot,
          },
        );
      }).toThrow('Owner settlement state document is missing for existing pending earning.');
    });
  });

  it('recordPendingEarningInTransaction fails closed when existing pending earning has malformed ownerSettlementState', async () => {
    await database.doc('ownerEarnings/booking-valid-earning-2').set({
      bookingId: 'booking-valid-earning-2',
      ownerId: 'owner-1',
      vehicleId: 'vehicle-1',
      amountKobo: 89_250_000,
      currency: 'NGN',
      state: 'pending',
      startDate,
      endDate,
      vehicleSnapshot,
      version: 1,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });
    await database.doc('ownerSettlementState/owner-1').set({
      ownerId: 'owner-1',
      pendingKobo: 'corrupt-string-value',
      version: 1,
    });

    await database.runTransaction(async (transaction) => {
      const earningSnapshot = await transaction.get(database.doc('ownerEarnings/booking-valid-earning-2'));
      const settlementSnapshot = await transaction.get(database.doc('ownerSettlementState/owner-1'));

      expect(() => {
        repository.recordPendingEarningInTransaction(
          transaction,
          {
            bookingId: 'booking-valid-earning-2',
            ownerId: 'owner-1',
            vehicleId: 'vehicle-1',
            amountKobo: 89_250_000,
            startDate,
            endDate,
            vehicleDisplayName: 'Toyota Prado',
            now,
          },
          {
            earningSnapshot,
            settlementSnapshot,
          },
        );
      }).toThrow('Existing owner settlement state document is invalid or malformed.');
    });
  });

  it('recordPendingEarningInTransaction fails closed when existing pending earning has pendingKobo below earning amount', async () => {
    await database.doc('ownerEarnings/booking-valid-earning-3').set({
      bookingId: 'booking-valid-earning-3',
      ownerId: 'owner-1',
      vehicleId: 'vehicle-1',
      amountKobo: 89_250_000,
      currency: 'NGN',
      state: 'pending',
      startDate,
      endDate,
      vehicleSnapshot,
      version: 1,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });
    await database.doc('ownerSettlementState/owner-1').set({
      ownerId: 'owner-1',
      pendingKobo: 50_000_000,
      availableKobo: 0,
      reservedKobo: 0,
      activePayoutId: null,
      settlementHold: false,
      version: 1,
      updatedAt: Timestamp.fromDate(now),
    });

    await database.runTransaction(async (transaction) => {
      const earningSnapshot = await transaction.get(database.doc('ownerEarnings/booking-valid-earning-3'));
      const settlementSnapshot = await transaction.get(database.doc('ownerSettlementState/owner-1'));

      expect(() => {
        repository.recordPendingEarningInTransaction(
          transaction,
          {
            bookingId: 'booking-valid-earning-3',
            ownerId: 'owner-1',
            vehicleId: 'vehicle-1',
            amountKobo: 89_250_000,
            startDate,
            endDate,
            vehicleDisplayName: 'Toyota Prado',
            now,
          },
          {
            earningSnapshot,
            settlementSnapshot,
          },
        );
      }).toThrow('Owner settlement pending balance is insufficient for existing pending earning.');
    });
  });
});
