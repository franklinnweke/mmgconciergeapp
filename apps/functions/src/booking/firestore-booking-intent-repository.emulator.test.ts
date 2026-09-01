import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createBookingIntent } from './create-booking-intent-service.js';
import { BookingCommandError } from './errors.js';
import { FirestoreBookingIntentRepository } from './firestore-booking-intent-repository.js';
import { FirestorePaidBookingResponseRepository } from './firestore-paid-booking-response-repository.js';
import { confirmBooking, rejectBooking } from './paid-booking-response-service.js';
import {
  getOwnerVehicleCalendar,
  getVehicleCalendar,
  removeVehicleAvailabilityBlock,
  setVehicleAvailabilityBlock,
} from './vehicle-availability-service.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

async function clearCollections(database: Firestore) {
  for (const name of [
    'auditEvents',
    'bookingBlocks',
    'bookingCases',
    'bookingIntents',
    'bookings',
    'idempotencyKeys',
    'notificationOutbox',
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
  let paidBookingRepository: FirestorePaidBookingResponseRepository;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'booking-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'booking-emulator');
    database = getFirestore(app);
    repository = new FirestoreBookingIntentRepository(database);
    paidBookingRepository = new FirestorePaidBookingResponseRepository(database);
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
    expect((await database.doc('vehicleAvailability/vehicle-one').get()).data()?.version).toBe(1);
  });

  it('serializes competing owner blocks and exposes only privacy-safe renter calendar days', async () => {
    const baseCommand = {
      schemaVersion: 1,
      data: {
        vehicleId: 'vehicle-one',
        startDate: '2026-09-01',
        endDate: '2026-09-03',
        reason: 'owner_use',
        notes: 'Private family event',
        expectedAvailabilityVersion: 0,
      },
    } as const;
    const attempts = await Promise.allSettled([
      setVehicleAvailabilityBlock({ ...baseCommand, idempotencyKey: 'owner-block-command-1' }, 'owner-one', {
        repository,
        createId: () => 'owner-block-one',
        createRequestId: () => 'owner-request-one',
        now: () => new Date('2026-08-20T12:00:00.000Z'),
      }),
      setVehicleAvailabilityBlock({
        ...baseCommand,
        idempotencyKey: 'owner-block-command-2',
        data: {
          ...baseCommand.data,
          startDate: '2026-09-04',
          endDate: '2026-09-06',
        },
      }, 'owner-one', {
        repository,
        createId: () => 'owner-block-two',
        createRequestId: () => 'owner-request-two',
        now: () => new Date('2026-08-20T12:00:00.000Z'),
      }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.find((attempt) => attempt.status === 'rejected')).toMatchObject({
      reason: expect.objectContaining<Partial<BookingCommandError>>({
        code: 'FAILED_PRECONDITION',
        safeDetails: { reason: 'stale_version' },
      }),
    });

    const renterCalendar = await getVehicleCalendar({
      schemaVersion: 1,
      data: {
        vehicleId: 'vehicle-one',
        windowStartDate: '2026-09-01',
        windowEndDate: '2026-09-07',
      },
    }, { repository, now: () => new Date('2026-08-20T12:00:00.000Z') });
    expect(JSON.stringify(renterCalendar)).not.toMatch(/owner-block|owner_use|family/i);
    expect(renterCalendar.days.some((day) => !day.available)).toBe(true);
  });

  it('round-trips versioned owner block details and removes the matching block atomically', async () => {
    const created = await setVehicleAvailabilityBlock({
      schemaVersion: 1,
      idempotencyKey: 'owner-block-round-trip',
      data: {
        vehicleId: 'vehicle-one',
        startDate: '2026-09-08',
        endDate: '2026-09-10',
        reason: 'maintenance',
        expectedAvailabilityVersion: 0,
      },
    }, 'owner-one', {
      repository,
      createId: () => 'owner-block-round-trip',
      createRequestId: () => 'owner-request-create',
      now: () => new Date('2026-08-20T12:00:00.000Z'),
    });
    const ownerCalendar = await getOwnerVehicleCalendar({
      schemaVersion: 1,
      data: {
        vehicleId: 'vehicle-one',
        windowStartDate: '2026-09-01',
        windowEndDate: '2026-09-12',
      },
    }, 'owner-one', { repository, now: () => new Date('2026-08-20T12:00:00.000Z') });

    expect(ownerCalendar.ownerBlocks).toEqual([created.result.block]);
    const removed = await removeVehicleAvailabilityBlock({
      schemaVersion: 1,
      idempotencyKey: 'owner-block-remove-round-trip',
      data: {
        vehicleId: 'vehicle-one',
        blockId: created.result.block.blockId,
        expectedBlockVersion: created.result.block.version,
        expectedAvailabilityVersion: ownerCalendar.availabilityVersion,
      },
    }, 'owner-one', {
      repository,
      createRequestId: () => 'owner-request-remove',
      now: () => new Date('2026-08-20T12:05:00.000Z'),
    });

    expect(removed.result.availabilityVersion).toBe(2);
    expect((await database.doc('bookingBlocks/owner-block-round-trip').get()).exists).toBe(false);
    expect((await database.collection('auditEvents').get()).size).toBe(2);
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

  it('confirms a server-seeded paid booking and its block in one transaction', async () => {
    await database.doc('bookings/booking-paid-one').set({
      bookingId: 'booking-paid-one',
      intentId: 'intent-paid-one',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      state: 'paid_pending_owner',
      version: 2,
      blockId: 'paid-block-one',
    });
    await database.doc('bookingBlocks/paid-block-one').set({
      bookingId: 'booking-paid-one',
      intentId: 'intent-paid-one',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      state: 'paid',
    });
    await database.doc('vehicleAvailability/vehicle-one').set({ version: 5 });

    const result = await confirmBooking({
      schemaVersion: 1,
      idempotencyKey: 'confirm-paid-booking-emulator-001',
      data: { bookingId: 'booking-paid-one', expectedVersion: 2 },
    }, { uid: 'owner-one', isSuperAdmin: false }, {
      repository: paidBookingRepository,
      now: () => new Date('2026-08-20T12:00:00.000Z'),
      createId: () => 'outbox-confirm-emulator-one',
      createRequestId: () => 'request-confirm-emulator-one',
    });

    expect(result.result.toState).toBe('confirmed');
    expect((await database.doc('bookings/booking-paid-one').get()).data()).toMatchObject({
      state: 'confirmed',
      version: 3,
      lastOwnerDecisionReason: null,
    });
    expect((await database.doc('bookingBlocks/paid-block-one').get()).data()?.state).toBe('confirmed');
    expect((await database.doc('vehicleAvailability/vehicle-one').get()).data()?.version).toBe(6);
    expect((await database.collection('auditEvents').get()).size).toBe(1);
    expect((await database.doc('notificationOutbox/outbox-confirm-emulator-one').get()).data())
      .toMatchObject({ status: 'unavailable', reason: 'fcm_not_in_sequence_2_3' });
  });

  it('releases rejected paid dates and opens an intervention case before a new hold can win', async () => {
    await database.doc('bookings/booking-paid-one').set({
      bookingId: 'booking-paid-one',
      intentId: 'intent-paid-one',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-01',
      endDate: '2026-09-04',
      state: 'paid_pending_owner',
      version: 1,
      blockId: 'paid-block-one',
    });
    await database.doc('bookingBlocks/paid-block-one').set({
      bookingId: 'booking-paid-one',
      intentId: 'intent-paid-one',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-01',
      endDate: '2026-09-04',
      state: 'paid',
    });
    await database.doc('vehicleAvailability/vehicle-one').set({ version: 4 });
    const generatedIds = ['case-owner-rejection-one', 'outbox-rejection-one'];

    await rejectBooking({
      schemaVersion: 1,
      idempotencyKey: 'reject-paid-booking-emulator-001',
      data: {
        bookingId: 'booking-paid-one',
        expectedVersion: 1,
        reason: 'The assigned chauffeur is no longer available.',
      },
    }, { uid: 'owner-one', isSuperAdmin: false }, {
      repository: paidBookingRepository,
      now: () => new Date('2026-08-20T12:00:00.000Z'),
      createId: () => generatedIds.shift()!,
      createRequestId: () => 'request-reject-emulator-one',
    });

    expect((await database.doc('bookingBlocks/paid-block-one').get()).exists).toBe(false);
    expect((await database.doc('bookings/booking-paid-one').get()).data()).toMatchObject({
      state: 'intervention_required',
      version: 2,
    });
    expect((await database.doc('bookingCases/case-owner-rejection-one').get()).data()).toMatchObject({
      status: 'open',
      type: 'owner_rejection',
    });

    await expect(createBookingIntent(command('booking-after-owner-rejection'), 'renter-two', {
      repository,
      createId: () => 'intent-after-owner-rejection',
      createRequestId: () => 'request-after-owner-rejection',
      now: () => new Date('2026-08-20T12:01:00.000Z'),
    })).resolves.toMatchObject({ result: { state: 'intent_created' } });
  });
});
