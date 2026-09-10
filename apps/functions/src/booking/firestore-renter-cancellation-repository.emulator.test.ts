import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestoreRenterCancellationRepository } from './firestore-renter-cancellation-repository.js';
import {
  cancelPaidBooking,
  cancelRentalRequest,
} from './renter-cancellation-service.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

const now = new Date('2026-09-10T12:00:00.000Z');
const startDate = '2026-10-20';
const endDate = '2026-10-22';

const priceSnapshot = {
  currency: 'NGN' as const,
  chargedDays: 2,
  ownerDailyRateKobo: 10_000_000,
  baseRentalKobo: 20_000_000,
  deliveryFeeKobo: 0,
  serviceFeeBps: 800,
  serviceFeeFixedKobo: 0,
  serviceFeeKobo: 1_600_000,
  ownerCommissionBps: 1500,
  ownerCommissionKobo: 3_000_000,
  ownerEarningsKobo: 17_000_000,
  renterTotalKobo: 21_600_000,
  configVersion: 'pricing-v1',
  termsVersion: 'terms-v1',
  cancellationPolicyVersion: 'cancel-v1',
};

const vehicleSnapshot = {
  displayName: 'Mercedes-Benz GLE',
  areaLabel: 'Victoria Island',
  categoryLabel: 'Executive SUV',
  imageKey: 'hero-suv',
};

async function clearCollection(database: Firestore, name: string) {
  const documents = await database.collection(name).listDocuments();
  await Promise.all(documents.map((document) => document.delete()));
}

async function clearDatabase(database: Firestore) {
  for (const name of [
    'auditEvents',
    'bookingBlocks',
    'bookingCases',
    'bookingIntents',
    'bookings',
    'idempotencyKeys',
    'payments',
    'rentalRequests',
    'renterCancellations',
    'vehicleAvailability',
  ]) {
    await clearCollection(database, name);
  }
}

function cancelRequestCommand(requestId: string, expectedVersion: number, key: string) {
  return {
    schemaVersion: 1 as const,
    idempotencyKey: key,
    data: { requestId, expectedVersion },
  };
}

function cancelBookingCommand(bookingId: string, expectedVersion: number, key: string) {
  return {
    schemaVersion: 1 as const,
    idempotencyKey: key,
    data: { bookingId, expectedVersion },
  };
}

function requestRecord(state: 'requested' | 'approved' | 'ready_for_payment', version: number, intentId?: string) {
  return {
    requestId: 'request-one',
    renterId: 'renter-one',
    ownerId: 'owner-one',
    vehicleId: 'vehicle-one',
    startDate,
    endDate,
    state,
    version,
    ...(intentId ? { intentId } : {}),
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  };
}

describeWithEmulator('renter cancellation Firestore transactions', () => {
  let database: Firestore;
  let repository: FirestoreRenterCancellationRepository;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'renter-cancellation-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'renter-cancellation-emulator');
    database = getFirestore(app);
    repository = new FirestoreRenterCancellationRepository(database);
  });

  beforeEach(async () => {
    await clearDatabase(database);
  });

  afterAll(async () => {
    if (database) await clearDatabase(database);
  });

  it('cancels a soft request without creating or touching inventory', async () => {
    await database.doc('rentalRequests/request-one').set(requestRecord('requested', 1));

    const result = await cancelRentalRequest(
      cancelRequestCommand('request-one', 1, 'cancel-soft-request-0001'),
      'renter-one',
      {
        repository,
        now: () => now,
        createRequestId: () => 'command-soft-cancel',
      },
    );

    expect(result).toMatchObject({
      requestId: 'request-one',
      state: 'cancelled_by_renter',
      version: 2,
      inventoryReleased: false,
    });
    expect((await database.doc('rentalRequests/request-one').get()).data()?.state).toBe('cancelled_by_renter');
    expect((await database.collection('bookingBlocks').get()).empty).toBe(true);
    expect((await database.collection('vehicleAvailability').get()).empty).toBe(true);
  });

  it('releases the exact unopened payment-window hold and increments the sentinel once', async () => {
    await database.doc('rentalRequests/request-one').set({
      ...requestRecord('ready_for_payment', 3, 'intent-one'),
      holdExpiresAt: Timestamp.fromDate(new Date('2026-09-10T12:30:00.000Z')),
    });
    await database.doc('bookingIntents/intent-one').set({
      renterId: 'renter-one', ownerId: 'owner-one', vehicleId: 'vehicle-one', rentalRequestId: 'request-one',
      state: 'intent_created', startDate, endDate,
    });
    await database.doc('bookingBlocks/intent-one').set({
      intentId: 'intent-one', renterId: 'renter-one', ownerId: 'owner-one', vehicleId: 'vehicle-one',
      startDate, endDate, state: 'held',
    });
    await database.doc('vehicleAvailability/vehicle-one').set({ vehicleId: 'vehicle-one', version: 4, updatedAt: Timestamp.fromDate(now) });

    const result = await cancelRentalRequest(
      cancelRequestCommand('request-one', 3, 'cancel-held-request-0001'),
      'renter-one',
      { repository, now: () => now, createRequestId: () => 'command-held-cancel' },
    );

    expect(result).toMatchObject({ state: 'cancelled_by_renter', inventoryReleased: true, version: 4 });
    expect((await database.doc('bookingBlocks/intent-one').get()).exists).toBe(false);
    expect((await database.doc('vehicleAvailability/vehicle-one').get()).data()?.version).toBe(5);
    expect((await database.doc('bookingIntents/intent-one').get()).data()?.state).toBe('expired');
  });

  it('records checkout-in-flight cancellation without releasing the hold or changing the sentinel', async () => {
    await database.doc('rentalRequests/request-one').set({
      ...requestRecord('ready_for_payment', 3, 'intent-one'),
      holdExpiresAt: Timestamp.fromDate(new Date('2026-09-10T12:30:00.000Z')),
    });
    await database.doc('bookingIntents/intent-one').set({
      renterId: 'renter-one', ownerId: 'owner-one', vehicleId: 'vehicle-one', rentalRequestId: 'request-one',
      state: 'checkout_pending', startDate, endDate,
    });
    await database.doc('bookingBlocks/intent-one').set({
      intentId: 'intent-one', renterId: 'renter-one', ownerId: 'owner-one', vehicleId: 'vehicle-one',
      startDate, endDate, state: 'held',
    });
    await database.doc('vehicleAvailability/vehicle-one').set({ vehicleId: 'vehicle-one', version: 9, updatedAt: Timestamp.fromDate(now) });

    const result = await cancelRentalRequest(
      cancelRequestCommand('request-one', 3, 'cancel-inflight-request-0001'),
      'renter-one',
      { repository, now: () => now, createRequestId: () => 'command-inflight-cancel' },
    );

    expect(result).toMatchObject({
      state: 'cancellation_requested',
      inventoryReleased: false,
      version: 4,
    });
    expect((await database.doc('bookingBlocks/intent-one').get()).exists).toBe(true);
    expect((await database.doc('vehicleAvailability/vehicle-one').get()).data()?.version).toBe(9);
    expect((await database.doc('bookingIntents/intent-one').get()).data()?.state).toBe('checkout_pending');
    expect((await database.doc('renterCancellations/request-one').get()).data()?.status).toBe('pending_payment_resolution');
  });

  it('moves a future paid booking to refund_pending while releasing only its exact confirmed block', async () => {
    await database.doc('bookings/booking-one').set({
      bookingId: 'booking-one', intentId: 'intent-one', renterId: 'renter-one', ownerId: 'owner-one',
      vehicleId: 'vehicle-one', startDate, endDate, state: 'confirmed', version: 3,
      blockId: 'intent-one', paymentId: 'payment-one', priceSnapshot, vehicleSnapshot,
      createdAt: Timestamp.fromDate(now), updatedAt: Timestamp.fromDate(now),
    });
    await database.doc('bookingBlocks/intent-one').set({
      bookingId: 'booking-one', intentId: 'intent-one', renterId: 'renter-one', ownerId: 'owner-one',
      vehicleId: 'vehicle-one', startDate, endDate, state: 'confirmed',
    });
    await database.doc('vehicleAvailability/vehicle-one').set({ vehicleId: 'vehicle-one', version: 7, updatedAt: Timestamp.fromDate(now) });
    await database.doc('payments/payment-one').set({ paymentId: 'payment-one', state: 'succeeded' });

    const result = await cancelPaidBooking(
      cancelBookingCommand('booking-one', 3, 'cancel-paid-booking-0001'),
      'renter-one',
      {
        repository,
        now: () => now,
        createCaseId: () => 'case-one',
        createRequestId: () => 'command-paid-cancel',
      },
    );

    expect(result.result).toMatchObject({
      bookingId: 'booking-one', state: 'refund_pending', version: 4,
      caseId: 'case-one', inventoryReleased: true,
      cancellationPolicyVersion: 'cancel-v1', financialOutcome: 'manual_review_required',
    });
    expect((await database.doc('bookingBlocks/intent-one').get()).exists).toBe(false);
    expect((await database.doc('vehicleAvailability/vehicle-one').get()).data()?.version).toBe(8);
    expect((await database.doc('bookings/booking-one').get()).data()?.state).toBe('refund_pending');
    expect((await database.doc('payments/payment-one').get()).data()?.state).toBe('refund_pending');
    expect((await database.doc('bookingCases/case-one').get()).data()).toMatchObject({
      type: 'renter_cancellation', status: 'refund_pending', bookingId: 'booking-one', paymentId: 'payment-one',
    });
  });
});
