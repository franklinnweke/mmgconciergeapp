import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

async function clearCollection(database: Firestore, name: string) {
  const documents = await database.collection(name).listDocuments();
  await Promise.all(documents.map((document) => document.delete()));
}

async function clearDatabase(database: Firestore) {
  for (const name of [
    'adminAuditLogs',
    'auditEvents',
    'bookings',
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
          earningExists: earningSnapshot.exists,
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
          earningExists: earningSnapshot.exists,
          settlementSnapshot,
        },
      );
    });

    const settlementDoc2 = await database.doc('ownerSettlementState/owner-1').get();
    expect(settlementDoc2.data()?.pendingKobo).toBe(89_250_000);
  });

  it('allows owner to report trip ended early and transitions to completion_pending', async () => {
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

    const result = await repository.reportTripEnded(
      'booking-report-1',
      { uid: 'owner-1' },
      now, // 2026-10-06 is >= 2026-10-05
    );

    expect(result.state).toBe('completion_pending');
    expect(result.version).toBe(3);

    const updatedBooking = await database.doc('bookings/booking-report-1').get();
    expect(updatedBooking.data()?.state).toBe('completion_pending');
    // Invariant: original dates and pricing must be preserved untouched
    expect(updatedBooking.data()?.startDate).toBe('2026-10-05');
    expect(updatedBooking.data()?.endDate).toBe('2026-10-10');
    expect(updatedBooking.data()?.priceSnapshot?.ownerEarningsKobo).toBe(89_250_000);
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

    // Non-owner rejected
    await expect(
      repository.reportTripEnded('booking-future', { uid: 'stranger-99' }, now),
    ).rejects.toThrow('Only the vehicle owner can report the trip ended.');

    // Before start date rejected (now is 2026-10-06, startDate is 2026-10-20)
    await expect(
      repository.reportTripEnded('booking-future', { uid: 'owner-1' }, now),
    ).rejects.toThrow('Cannot report trip ended before the trip start date.');
  });

  it('atomically completes booking and releases pending earning to available', async () => {
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

    // Renter confirms completion
    const result = await repository.confirmBookingCompletion(
      'booking-comp-1',
      { uid: 'renter-1', isStaff: false },
      now,
    );

    expect(result.bookingState).toBe('completed');
    expect(result.earningState).toBe('available');
    expect(result.amountKobo).toBe(89_250_000);

    const bookingDoc = await database.doc('bookings/booking-comp-1').get();
    expect(bookingDoc.data()?.state).toBe('completed');
    expect(bookingDoc.data()?.completedByType).toBe('renter');

    const earningDoc = await database.doc('ownerEarnings/booking-comp-1').get();
    expect(earningDoc.data()?.state).toBe('available');
    expect(earningDoc.data()?.availableAt).toBeDefined();

    const settlementDoc = await database.doc('ownerSettlementState/owner-1').get();
    expect(settlementDoc.data()?.pendingKobo).toBe(0);
    expect(settlementDoc.data()?.availableKobo).toBe(89_250_000);
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

    await expect(
      repository.confirmBookingCompletion(
        'booking-owner-comp',
        { uid: 'owner-1', isStaff: false },
        now,
      ),
    ).rejects.toThrow('Vehicle owners cannot confirm final booking completion.');
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

    // Settlement hold applied
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

    const result = await repository.confirmBookingCompletion(
      'booking-hold-1',
      { uid: 'renter-1', isStaff: false },
      now,
    );

    expect(result.bookingState).toBe('completed');
    expect(result.earningState).toBe('review_required');

    const earningDoc = await database.doc('ownerEarnings/booking-hold-1').get();
    expect(earningDoc.data()?.state).toBe('review_required');
    expect(earningDoc.data()?.reviewReason).toBe('Investigation into reported vehicle breakdown');

    // Invariant: Available kobo remains 0 when restricted
    const settlementDoc = await database.doc('ownerSettlementState/owner-hold').get();
    expect(settlementDoc.data()?.availableKobo).toBe(0);
    expect(settlementDoc.data()?.pendingKobo).toBe(0);
  });

  it('progressBookingLifecycle advances confirmed to in_progress and in_progress to completion_pending', async () => {
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

    // 3. Trip in the future (now: 2026-10-06, start: 2026-10-15, end: 2026-10-18) -> stays confirmed
    await database.doc('bookings/prog-future').set({
      bookingId: 'prog-future',
      ownerId: 'owner-1',
      renterId: 'renter-1',
      vehicleId: 'vehicle-1',
      startDate: '2026-10-15',
      endDate: '2026-10-18',
      state: 'confirmed',
      version: 1,
      priceSnapshot,
      vehicleSnapshot,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    const progressResult = await repository.progressBookingLifecycle(now);
    expect(progressResult.transitioned).toBe(2);

    const doc1 = await database.doc('bookings/prog-start-today').get();
    expect(doc1.data()?.state).toBe('in_progress');

    const doc2 = await database.doc('bookings/prog-end-today').get();
    expect(doc2.data()?.state).toBe('completion_pending');

    const doc3 = await database.doc('bookings/prog-future').get();
    expect(doc3.data()?.state).toBe('confirmed');
  });
});
