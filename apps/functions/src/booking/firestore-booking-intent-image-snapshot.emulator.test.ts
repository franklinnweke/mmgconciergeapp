import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createBookingIntent } from './create-booking-intent-service.js';
import { FirestoreBookingIntentRepository } from './firestore-booking-intent-repository.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

async function deleteCollection(database: Firestore, path: string) {
  const snapshot = await database.collection(path).get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
}

async function clearFixture(database: Firestore) {
  await deleteCollection(database, 'vehicles/vehicle-image-snapshot/images');
  for (const path of [
    'auditEvents',
    'bookingBlocks',
    'bookingIntents',
    'idempotencyKeys',
    'vehicleAvailability',
  ]) {
    await deleteCollection(database, path);
  }
  await database.doc('systemConfig/booking').delete();
  await database.doc('vehicles/vehicle-image-snapshot').delete();
}

describeWithEmulator('booking vehicle image snapshot', () => {
  let database: Firestore;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'booking-image-snapshot-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'booking-image-snapshot-emulator');
    database = getFirestore(app);
  });

  beforeEach(async () => {
    await clearFixture(database);
    await database.doc('vehicles/vehicle-image-snapshot').set({
      ownerId: 'owner-one',
      ownerDailyRateKobo: 45_000_000,
      displayName: 'Mercedes-AMG GLE 53',
      areaLabel: 'Ikoyi',
      category: 'executive_suv',
      moderationStatus: 'approved',
      visibility: 'active',
      discoverable: true,
      // Deliberately wrong legacy key. Canonical published bytes must win.
      imageKey: 'hero-suv',
    });
    await database.doc('vehicles/vehicle-image-snapshot/images/rear').set({
      imageId: 'rear',
      order: 2,
      status: 'approved',
      publicVariantPaths: {
        card: 'public/vehicles/vehicle-image-snapshot/approved/rear/card',
      },
    });
    await database.doc('vehicles/vehicle-image-snapshot/images/front').set({
      imageId: 'front',
      order: 1,
      status: 'approved',
      publicVariantPaths: {
        card: 'public/vehicles/vehicle-image-snapshot/approved/front/card',
      },
    });
    await database.doc('systemConfig/booking').set({
      deliveryFeeKobo: 0,
      serviceFeeBps: 800,
      serviceFeeFixedKobo: 0,
      ownerCommissionBps: 1_500,
      configVersion: 'pricing-v1',
      termsVersion: 'terms-v1',
      cancellationPolicyVersion: 'cancel-v1',
    });
  });

  afterAll(async () => {
    if (database) await clearFixture(database);
  });

  it('stores the first approved published card image on the immutable booking intent', async () => {
    const repository = new FirestoreBookingIntentRepository(
      database,
      (path) => `https://media.example/${path}`,
    );

    const result = await createBookingIntent({
      schemaVersion: 1,
      idempotencyKey: 'booking_image_snapshot_001',
      data: {
        vehicleId: 'vehicle-image-snapshot',
        startDate: '2026-09-20',
        endDate: '2026-09-23',
      },
    }, 'renter-one', {
      repository,
      createId: () => 'intent-image-snapshot',
      createRequestId: () => 'request-image-snapshot',
      now: () => new Date('2026-09-08T12:00:00.000Z'),
    });

    expect(result.result.vehicleSnapshot).toEqual({
      displayName: 'Mercedes-AMG GLE 53',
      areaLabel: 'Ikoyi',
      categoryLabel: 'Executive SUV',
      imageUrl: 'https://media.example/public/vehicles/vehicle-image-snapshot/approved/front/card',
    });
    expect((await database.doc('bookingIntents/intent-image-snapshot').get()).data()?.vehicleSnapshot)
      .toEqual(result.result.vehicleSnapshot);
  });
});
