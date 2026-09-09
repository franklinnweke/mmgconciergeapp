import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestoreOwnerRentalRequestQuery } from './owner-rental-request-query.js';

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

describeWithEmulator('owner rental request safe projection', () => {
  let database: Firestore;
  let query: FirestoreOwnerRentalRequestQuery;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'owner-rental-request-query-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'owner-rental-request-query-emulator');
    database = getFirestore(app);
    query = new FirestoreOwnerRentalRequestQuery(database);
  });

  beforeEach(async () => {
    await clear(database);
    const now = Timestamp.fromDate(new Date('2026-09-09T12:00:00.000Z'));
    await database.doc('rentalRequests/request-owner-one').set({
      requestId: 'request-owner-one',
      renterId: 'renter-secret',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-20',
      endDate: '2026-09-22',
      serviceAreaLabel: 'Victoria Island',
      state: 'requested',
      version: 1,
      estimatedPriceSnapshot: priceSnapshot,
      vehicleSnapshot: {
        displayName: 'Mercedes-Benz GLE',
        areaLabel: 'Victoria Island',
        categoryLabel: 'Executive SUV',
        imageKey: 'hero-suv',
      },
      createdAt: now,
      updatedAt: now,
      // Deliberate polluted/private-looking fields must never cross projection.
      contactPhone: '+2348012345678',
      renterEmail: 'private@example.com',
      internalNotes: 'VIP customer',
    });
    await database.doc('rentalRequests/request-owner-two').set({
      requestId: 'request-owner-two',
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

  it('returns only the requesting owner records and omits renter identity/contact data', async () => {
    const result = await query.list('owner-one');

    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({
      requestId: 'request-owner-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      state: 'requested',
    });

    const record = result.requests[0] as unknown as Record<string, unknown>;
    expect(record).not.toHaveProperty('renterId');
    expect(record).not.toHaveProperty('contactPhone');
    expect(record).not.toHaveProperty('renterEmail');
    expect(record).not.toHaveProperty('internalNotes');
  });
});
