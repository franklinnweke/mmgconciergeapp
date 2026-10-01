import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestorePaidBookingResponseRepository } from './firestore-paid-booking-response-repository.js';
import { confirmBooking, rejectBooking } from './paid-booking-response-service.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const now = new Date('2026-09-01T12:00:00.000Z');

async function clearCollections(database: Firestore) {
  for (const name of [
    'auditEvents',
    'bookingBlocks',
    'bookingCases',
    'bookings',
    'idempotencyKeys',
    'notificationOutbox',
    'vehicleAvailability',
    'ownerEarnings',
    'ownerSettlementState',
  ]) {
    const documents = await database.collection(name).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

async function seedR4PaidPendingOwner(database: Firestore) {
  const createdAt = Timestamp.fromDate(new Date('2026-09-01T11:30:00.000Z'));
  await database.doc('bookings/booking-r5-001').set({
    bookingId: 'booking-r5-001',
    intentId: 'intent-r5-001',
    renterId: 'renter-r5-001',
    ownerId: 'owner-r5-001',
    vehicleId: 'vehicle-r5-001',
    startDate: '2026-09-10',
    endDate: '2026-09-13',
    state: 'paid_pending_owner',
    version: 1,
    blockId: 'intent-r5-001',
    paymentId: 'payment-r5-001',
    paymentReference: 'mmg-payment-r5-001',
    createdAt,
    updatedAt: createdAt,
  });
  await database.doc('bookingBlocks/intent-r5-001').set({
    intentId: 'intent-r5-001',
    bookingId: 'booking-r5-001',
    renterId: 'renter-r5-001',
    ownerId: 'owner-r5-001',
    vehicleId: 'vehicle-r5-001',
    startDate: '2026-09-10',
    endDate: '2026-09-13',
    state: 'paid',
    version: 2,
    createdAt,
    updatedAt: createdAt,
  });
  await database.doc('vehicleAvailability/vehicle-r5-001').set({
    vehicleId: 'vehicle-r5-001',
    version: 5,
    updatedAt: createdAt,
  });
}

function confirmCommand() {
  return {
    schemaVersion: 1 as const,
    idempotencyKey: 'r5-confirm-booking-0001',
    data: { bookingId: 'booking-r5-001', expectedVersion: 1 },
  };
}

function rejectCommand() {
  return {
    schemaVersion: 1 as const,
    idempotencyKey: 'r5-reject-booking-0001',
    data: {
      bookingId: 'booking-r5-001',
      expectedVersion: 1,
      reason: 'The chauffeur assigned to this vehicle is unavailable.',
    },
  };
}

const owner = { uid: 'owner-r5-001', isSuperAdmin: false };

describeWithEmulator('Firestore R5 paid booking owner-response integrity', () => {
  let database: Firestore;
  let repository: FirestorePaidBookingResponseRepository;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'payment-r5-owner-response-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'payment-r5-owner-response-emulator');
    database = getFirestore(app);
    repository = new FirestorePaidBookingResponseRepository(database);
  });

  beforeEach(async () => {
    await clearCollections(database);
    await seedR4PaidPendingOwner(database);
  });

  afterAll(async () => {
    if (database) await clearCollections(database);
  });

  it('confirms an exact R4 paid booking and block atomically', async () => {
    await confirmBooking(confirmCommand(), owner, {
      repository,
      now: () => now,
      createId: () => 'outbox-r5-confirm',
      createRequestId: () => 'request-r5-confirm',
    });

    expect((await database.doc('bookings/booking-r5-001').get()).data()).toMatchObject({
      state: 'confirmed',
      version: 2,
    });
    expect((await database.doc('bookingBlocks/intent-r5-001').get()).data()?.state).toBe('confirmed');
    expect((await database.doc('vehicleAvailability/vehicle-r5-001').get()).data()?.version).toBe(6);
    expect((await database.collection('auditEvents').get()).size).toBe(1);
    expect((await database.collection('notificationOutbox').get()).size).toBe(1);
  });

  it('rejects an exact R4 paid booking into intervention and releases dates without refund state', async () => {
    const ids = ['case-r5-reject', 'outbox-r5-reject'];
    await rejectBooking(rejectCommand(), owner, {
      repository,
      now: () => now,
      createId: () => ids.shift()!,
      createRequestId: () => 'request-r5-reject',
    });

    const booking = (await database.doc('bookings/booking-r5-001').get()).data();
    expect(booking).toMatchObject({ state: 'intervention_required', version: 2 });
    expect(JSON.stringify(booking)).not.toContain('refund');
    expect((await database.doc('bookingBlocks/intent-r5-001').get()).exists).toBe(false);
    expect((await database.doc('vehicleAvailability/vehicle-r5-001').get()).data()?.version).toBe(6);
    expect((await database.doc('bookingCases/case-r5-reject').get()).data()).toMatchObject({
      type: 'owner_rejection',
      status: 'open',
      bookingId: 'booking-r5-001',
    });
    expect((await database.collection('auditEvents').get()).size).toBe(2);
    expect((await database.collection('notificationOutbox').get()).size).toBe(1);
  });

  it('fails closed with zero partial effects when the paid block is missing', async () => {
    await database.doc('bookingBlocks/intent-r5-001').delete();
    const sentinelBefore = (await database.doc('vehicleAvailability/vehicle-r5-001').get()).data()?.version;

    await expect(confirmBooking(confirmCommand(), owner, {
      repository,
      now: () => now,
    })).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      safeDetails: { reason: 'paid_block_missing' },
    });

    expect((await database.doc('bookings/booking-r5-001').get()).data()).toMatchObject({
      state: 'paid_pending_owner',
      version: 1,
    });
    expect((await database.doc('vehicleAvailability/vehicle-r5-001').get()).data()?.version).toBe(sentinelBefore);
    expect((await database.collection('bookingCases').get()).size).toBe(0);
    expect((await database.collection('auditEvents').get()).size).toBe(0);
    expect((await database.collection('notificationOutbox').get()).size).toBe(0);
  });

  it.each([
    ['missing', async (db: Firestore) => db.doc('vehicleAvailability/vehicle-r5-001').delete()],
    ['malformed', async (db: Firestore) => db.doc('vehicleAvailability/vehicle-r5-001').set({
      vehicleId: 'vehicle-r5-001',
      version: 'bad-version',
    })],
  ])('fails closed with zero partial effects when the availability sentinel is %s', async (_label, breakSentinel) => {
    await breakSentinel(database);

    await expect(rejectBooking(rejectCommand(), owner, {
      repository,
      now: () => now,
      createId: () => 'must-not-persist',
    })).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });

    expect((await database.doc('bookings/booking-r5-001').get()).data()).toMatchObject({
      state: 'paid_pending_owner',
      version: 1,
    });
    expect((await database.doc('bookingBlocks/intent-r5-001').get()).data()?.state).toBe('paid');
    expect((await database.collection('bookingCases').get()).size).toBe(0);
    expect((await database.collection('auditEvents').get()).size).toBe(0);
    expect((await database.collection('notificationOutbox').get()).size).toBe(0);
  });

  it('confirms pay-first booking idempotently when compatible pending earning and valid settlement already exist', async () => {
    // Seed booking with priceSnapshot containing ownerEarningsKobo
    await database.doc('bookings/booking-r5-001').set({
      bookingId: 'booking-r5-001',
      intentId: 'intent-r5-001',
      renterId: 'renter-r5-001',
      ownerId: 'owner-r5-001',
      vehicleId: 'vehicle-r5-001',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      state: 'paid_pending_owner',
      version: 1,
      blockId: 'intent-r5-001',
      paymentId: 'payment-r5-001',
      paymentReference: 'mmg-payment-r5-001',
      priceSnapshot: {
        totalPriceKobo: 105_000_000,
        ownerEarningsKobo: 89_250_000,
      },
      vehicleSnapshot: { displayName: 'Toyota Prado' },
      createdAt: Timestamp.fromDate(new Date('2026-09-01T11:30:00.000Z')),
      updatedAt: Timestamp.fromDate(new Date('2026-09-01T11:30:00.000Z')),
    });

    // Seed existing compatible pending earning
    await database.doc('ownerEarnings/booking-r5-001').set({
      bookingId: 'booking-r5-001',
      ownerId: 'owner-r5-001',
      vehicleId: 'vehicle-r5-001',
      amountKobo: 89_250_000,
      currency: 'NGN',
      state: 'pending',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      vehicleSnapshot: { displayName: 'Toyota Prado' },
      createdAt: Timestamp.fromDate(new Date('2026-09-01T11:30:00.000Z')),
      updatedAt: Timestamp.fromDate(new Date('2026-09-01T11:30:00.000Z')),
      version: 1,
    });

    // Seed existing valid settlement state
    await database.doc('ownerSettlementState/owner-r5-001').set({
      ownerId: 'owner-r5-001',
      pendingKobo: 89_250_000,
      availableKobo: 0,
      reservedKobo: 0,
      activePayoutId: null,
      settlementHold: false,
      version: 1,
      updatedAt: Timestamp.fromDate(new Date('2026-09-01T11:30:00.000Z')),
    });

    await confirmBooking(confirmCommand(), owner, {
      repository,
      now: () => now,
      createId: () => 'outbox-r5-confirm',
      createRequestId: () => 'request-r5-confirm',
    });

    // Booking confirmed
    const updatedBooking = await database.doc('bookings/booking-r5-001').get();
    expect(updatedBooking.data()?.state).toBe('confirmed');
    expect(updatedBooking.data()?.version).toBe(2);

    // Earning remains pending and version unchanged
    const earningDoc = await database.doc('ownerEarnings/booking-r5-001').get();
    expect(earningDoc.data()?.state).toBe('pending');
    expect(earningDoc.data()?.amountKobo).toBe(89_250_000);
    expect(earningDoc.data()?.version).toBe(1);

    // Settlement pendingKobo unchanged (did not double count)
    const settlementDoc = await database.doc('ownerSettlementState/owner-r5-001').get();
    expect(settlementDoc.data()?.pendingKobo).toBe(89_250_000);
    expect(settlementDoc.data()?.version).toBe(1);
  });

  it('fails pay-first confirmation closed and leaves booking unchanged when earning conflicts', async () => {
    // Seed booking with priceSnapshot containing ownerEarningsKobo
    await database.doc('bookings/booking-r5-001').set({
      bookingId: 'booking-r5-001',
      intentId: 'intent-r5-001',
      renterId: 'renter-r5-001',
      ownerId: 'owner-r5-001',
      vehicleId: 'vehicle-r5-001',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      state: 'paid_pending_owner',
      version: 1,
      blockId: 'intent-r5-001',
      paymentId: 'payment-r5-001',
      paymentReference: 'mmg-payment-r5-001',
      priceSnapshot: {
        totalPriceKobo: 105_000_000,
        ownerEarningsKobo: 89_250_000,
      },
      vehicleSnapshot: { displayName: 'Toyota Prado' },
      createdAt: Timestamp.fromDate(new Date('2026-09-01T11:30:00.000Z')),
      updatedAt: Timestamp.fromDate(new Date('2026-09-01T11:30:00.000Z')),
    });

    // Seed existing CONFLICTING earning (wrong amount: 50_000_000 instead of 89_250_000)
    await database.doc('ownerEarnings/booking-r5-001').set({
      bookingId: 'booking-r5-001',
      ownerId: 'owner-r5-001',
      vehicleId: 'vehicle-r5-001',
      amountKobo: 50_000_000,
      currency: 'NGN',
      state: 'pending',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      vehicleSnapshot: { displayName: 'Toyota Prado' },
      createdAt: Timestamp.fromDate(new Date('2026-09-01T11:30:00.000Z')),
      updatedAt: Timestamp.fromDate(new Date('2026-09-01T11:30:00.000Z')),
      version: 1,
    });

    await database.doc('ownerSettlementState/owner-r5-001').set({
      ownerId: 'owner-r5-001',
      pendingKobo: 50_000_000,
      availableKobo: 0,
      reservedKobo: 0,
      activePayoutId: null,
      settlementHold: false,
      version: 1,
      updatedAt: Timestamp.fromDate(new Date('2026-09-01T11:30:00.000Z')),
    });

    await expect(confirmBooking(confirmCommand(), owner, {
      repository,
      now: () => now,
      createId: () => 'outbox-r5-confirm',
      createRequestId: () => 'request-r5-confirm',
    })).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
    });

    // Invariant: booking remains unchanged in paid_pending_owner at version 1
    const unchangedBooking = await database.doc('bookings/booking-r5-001').get();
    expect(unchangedBooking.data()?.state).toBe('paid_pending_owner');
    expect(unchangedBooking.data()?.version).toBe(1);

    // Availability block remains paid
    const unchangedBlock = await database.doc('bookingBlocks/intent-r5-001').get();
    expect(unchangedBlock.data()?.state).toBe('paid');

    // Availability sentinel remains at 5
    const unchangedSentinel = await database.doc('vehicleAvailability/vehicle-r5-001').get();
    expect(unchangedSentinel.data()?.version).toBe(5);
  });
});
