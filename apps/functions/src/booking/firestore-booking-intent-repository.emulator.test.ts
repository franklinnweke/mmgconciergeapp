import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createBookingIntent } from './create-booking-intent-service.js';
import { BookingCommandError } from './errors.js';
import { FirestoreBookingIntentRepository } from './firestore-booking-intent-repository.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

async function clearCollections(database: Firestore) {
  for (const name of [
    'auditEvents',
    'bookingBlocks',
    'bookingIntents',
    'idempotencyKeys',
    'systemConfig',
    'vehicleAvailability',
    'vehicles',
  ]) {
    const documents = await database.collection(name).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

describeWithEmulator('Firestore booking-intent transaction', () => {
  let database: Firestore;
  let repository: FirestoreBookingIntentRepository;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'booking-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'booking-emulator');
    database = getFirestore(app);
    repository = new FirestoreBookingIntentRepository(database);
  });

  beforeEach(async () => {
    await clearCollections(database);
    await database.doc('vehicles/vehicle-one').set({
      active: true,
      ownerId: 'owner-one',
      ownerDailyRateKobo: 38_500_000,
      displayName: 'Pearl Executive SUV',
      areaLabel: 'Victoria Island',
      categoryLabel: 'Executive SUV',
      imageKey: 'pearl-suv',
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
    if (database) await clearCollections(database);
  });

  function command(idempotencyKey: string) {
    return {
      schemaVersion: 1,
      idempotencyKey,
      data: {
        vehicleId: 'vehicle-one',
        startDate: '2026-09-01',
        endDate: '2026-09-04',
      },
    };
  }

  it('serializes overlapping attempts through the vehicle sentinel', async () => {
    const attempts = await Promise.allSettled([
      createBookingIntent(command('booking_01JABCDEFGHIJK_A'), 'renter-one', {
        repository,
        createId: () => 'intent-one',
        createRequestId: () => 'request-one',
        now: () => new Date('2026-08-13T12:00:00.000Z'),
      }),
      createBookingIntent(command('booking_01JABCDEFGHIJK_B'), 'renter-two', {
        repository,
        createId: () => 'intent-two',
        createRequestId: () => 'request-two',
        now: () => new Date('2026-08-13T12:00:00.000Z'),
      }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    const rejection = attempts.find((attempt) => attempt.status === 'rejected');
    expect(rejection).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining<Partial<BookingCommandError>>({ code: 'VEHICLE_UNAVAILABLE' }),
    });
    expect((await database.collection('bookingIntents').get()).size).toBe(1);
    expect((await database.collection('bookingBlocks').get()).size).toBe(1);
  });

  it('replays an identical idempotent command from stored transaction output', async () => {
    const input = command('booking_01JABCDEFGHIJK_C');
    const first = await createBookingIntent(input, 'renter-one', {
      repository,
      createId: () => 'intent-one',
      createRequestId: () => 'request-one',
      now: () => new Date('2026-08-13T12:00:00.000Z'),
    });
    const replay = await createBookingIntent(input, 'renter-one', {
      repository,
      createId: () => 'must-not-be-used',
      createRequestId: () => 'must-not-be-used',
      now: () => new Date('2026-08-13T12:01:00.000Z'),
    });

    expect(replay).toEqual(first);
    expect((await database.collection('bookingIntents').get()).size).toBe(1);
  });

  it('fails closed when a candidate availability block is malformed', async () => {
    await database.doc('bookingBlocks/corrupt-block').set({
      vehicleId: 'vehicle-one',
      startDate: '2026-09-02',
      endDate: '2026-09-03',
      state: 'held',
    });

    await expect(createBookingIntent(command('booking_01JABCDEFGHIJK_CORRUPT'), 'renter-one', {
      repository,
      createId: () => 'intent-corrupt',
      createRequestId: () => 'request-corrupt',
      now: () => new Date('2026-08-13T12:00:00.000Z'),
    })).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'FAILED_PRECONDITION' });
    expect((await database.collection('bookingIntents').get()).size).toBe(0);
  });
});
