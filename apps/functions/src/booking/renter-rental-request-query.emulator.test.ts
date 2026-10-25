import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestoreRenterRentalRequestQuery } from './renter-rental-request-query.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

const priceSnapshot = {
  currency: 'NGN',
  chargedDays: 2,
  ownerDailyRateKobo: 10_000_000,
  baseRentalKobo: 20_000_000,
  deliveryFeeKobo: 0,
  serviceFeeBps: 800,
  serviceFeeFixedKobo: 0,
  serviceFeeKobo: 1_600_000,
  ownerCommissionBps: 1_500,
  ownerCommissionKobo: 3_000_000,
  ownerEarningsKobo: 17_000_000,
  renterTotalKobo: 21_600_000,
  configVersion: 'pricing-v1',
  termsVersion: 'terms-v1',
  cancellationPolicyVersion: 'cancel-v1',
} as const;

async function clear(database: Firestore) {
  const docs = await database.collection('rentalRequests').listDocuments();
  await Promise.all(docs.map((document) => document.delete()));
}

describeWithEmulator('renter rental request safe projection', () => {
  let database: Firestore;
  let query: FirestoreRenterRentalRequestQuery;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'renter-rental-request-query-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'renter-rental-request-query-emulator');
    database = getFirestore(app);
    query = new FirestoreRenterRentalRequestQuery(database);
  });

  beforeEach(async () => {
    await clear(database);
    const now = Timestamp.fromDate(new Date('2026-09-09T12:00:00.000Z'));
    await database.doc('rentalRequests/request-renter-one').set({
      requestId: 'request-renter-one',
      renterId: 'renter-one',
      ownerId: 'owner-secret',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-20',
      endDate: '2026-09-22',
      serviceAreaLabel: 'Victoria Island',
      state: 'approved',
      version: 2,
      estimatedPriceSnapshot: priceSnapshot,
      vehicleSnapshot: {
        displayName: 'Mercedes-Benz GLE',
        areaLabel: 'Victoria Island',
        categoryLabel: 'Executive SUV',
        imageKey: 'hero-suv',
      },
      createdAt: now,
      updatedAt: now,
      approvedBy: 'owner-secret',
      declineReason: 'must-not-leak',
      internalNotes: 'concierge-only',
      renterEmail: 'private@example.com',
      contactPhone: '+2348012345678',
    });
    await database.doc('rentalRequests/request-renter-two').set({
      requestId: 'request-renter-two',
      renterId: 'renter-two',
      ownerId: 'owner-two',
      vehicleId: 'vehicle-two',
      startDate: '2026-09-23',
      endDate: '2026-09-25',
      serviceAreaLabel: 'Ikoyi',
      state: 'requested',
      version: 1,
      estimatedPriceSnapshot: priceSnapshot,
      vehicleSnapshot: {
        displayName: 'Range Rover',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
        imageKey: 'hero-suv',
      },
      createdAt: now,
      updatedAt: now,
    });
  });

  afterAll(async () => {
    if (database) await clear(database);
  });

  it('returns only the requesting renter records and strips owner/staff/contact/internal fields', async () => {
    const result = await query.list('renter-one');

    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({
      requestId: 'request-renter-one',
      vehicleId: 'vehicle-one',
      state: 'approved',
      version: 2,
    });

    const record = result.requests[0] as unknown as Record<string, unknown>;
    for (const key of [
      'renterId',
      'ownerId',
      'approvedBy',
      'declineReason',
      'internalNotes',
      'renterEmail',
      'contactPhone',
    ]) {
      expect(record).not.toHaveProperty(key);
    }
  });

  it('returns dispatch time only to opt-in renter clients and never another renter', async () => {
    await database.doc('rentalRequests/request-renter-one').update({ confirmedPickupTime: '10:30' });
    expect((await query.list('renter-one')).requests[0]).not.toHaveProperty('confirmedPickupTime');
    expect((await query.list('renter-one', true)).requests[0]).toHaveProperty('confirmedPickupTime', '10:30');
    expect((await query.list('renter-two', true)).requests[0]).not.toHaveProperty('confirmedPickupTime');
  });
});
