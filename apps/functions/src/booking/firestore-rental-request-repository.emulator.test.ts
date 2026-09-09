import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { BookingCommandError } from './errors.js';
import { FirestoreRentalRequestRepository } from './firestore-rental-request-repository.js';
import {
  approveRentalRequest,
  createRentalRequest,
  openRentalRequestPaymentWindow,
} from './rental-request-service.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

const config = {
  deliveryFeeKobo: 0,
  serviceFeeBps: 800,
  serviceFeeFixedKobo: 0,
  ownerCommissionBps: 1500,
  configVersion: 'pricing-v1',
  termsVersion: 'terms-v1',
  cancellationPolicyVersion: 'cancel-v1',
};

async function clearCollection(database: Firestore, name: string) {
  const documents = await database.collection(name).listDocuments();
  await Promise.all(documents.map((document) => document.delete()));
}

async function clearDatabase(database: Firestore) {
  for (const name of [
    'adminAuditLogs',
    'auditEvents',
    'bookingBlocks',
    'bookingIntents',
    'idempotencyKeys',
    'rentalRequestContacts',
    'rentalRequests',
    'systemConfig',
    'vehicleAvailability',
    'vehicles',
  ]) {
    await clearCollection(database, name);
  }
}

function requestCommand(key: string, startDate = '2026-09-20', endDate = '2026-09-22') {
  return {
    schemaVersion: 1 as const,
    idempotencyKey: key,
    data: {
      vehicleId: 'vehicle-one',
      startDate,
      endDate,
      contactPhone: '+2348012345678',
      serviceAreaLabel: 'Victoria Island' as const,
    },
  };
}

function approveCommand(key: string, requestId: string, expectedVersion = 1) {
  return {
    schemaVersion: 1 as const,
    idempotencyKey: key,
    data: { requestId, expectedVersion },
  };
}

function openCommand(key: string, requestId: string, expectedVersion = 2) {
  return {
    schemaVersion: 1 as const,
    idempotencyKey: key,
    data: { requestId, expectedVersion },
  };
}

describeWithEmulator('request-first rental request Firestore transactions', () => {
  let database: Firestore;
  let repository: FirestoreRentalRequestRepository;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'rental-request-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'rental-request-emulator');
    database = getFirestore(app);
    repository = new FirestoreRentalRequestRepository(database, (path) => `https://storage.test/${path}`);
  });

  beforeEach(async () => {
    await clearDatabase(database);
    await database.doc('systemConfig/booking').set(config);
    await database.doc('vehicles/vehicle-one').set({
      ownerId: 'owner-one',
      ownerDailyRateKobo: 10_000_000,
      displayName: 'Mercedes-Benz GLE',
      areaLabel: 'Victoria Island',
      categoryLabel: 'Executive SUV',
      imageKey: 'hero-suv',
      active: true,
    });
    await database.doc('vehicleAvailability/vehicle-one').set({
      vehicleId: 'vehicle-one',
      version: 0,
      updatedAt: Timestamp.fromDate(new Date('2026-09-09T12:00:00.000Z')),
    });
  });

  afterAll(async () => {
    if (database) await clearDatabase(database);
  });

  it('keeps request and approval soft, then acquires exactly one authoritative 30-minute block', async () => {
    const created = await createRentalRequest(requestCommand('create-request-one-0001'), 'renter-one', {
      repository,
      createId: () => 'request-one',
      createRequestId: () => 'command-create-one',
      now: () => new Date('2026-09-09T12:00:00.000Z'),
    });

    expect(created.result.state).toBe('requested');
    expect((await database.collection('bookingBlocks').get()).empty).toBe(true);
    expect((await database.collection('bookingIntents').get()).empty).toBe(true);
    expect((await database.doc('vehicleAvailability/vehicle-one').get()).data()?.version).toBe(0);
    expect((await database.doc('rentalRequestContacts/request-one').get()).data()).toMatchObject({
      renterId: 'renter-one',
      contactPhone: '+2348012345678',
    });

    const approved = await approveRentalRequest(
      approveCommand('approve-request-one-0001', 'request-one'),
      { uid: 'owner-one', isStaff: false },
      {
        repository,
        createRequestId: () => 'command-approve-one',
        now: () => new Date('2026-09-09T12:05:00.000Z'),
      },
    );

    expect(approved.result.state).toBe('approved');
    expect((await database.collection('bookingBlocks').get()).empty).toBe(true);
    expect((await database.collection('bookingIntents').get()).empty).toBe(true);
    expect((await database.doc('vehicleAvailability/vehicle-one').get()).data()?.version).toBe(0);

    const opened = await openRentalRequestPaymentWindow(
      openCommand('open-request-one-0001', 'request-one'),
      { uid: 'support-one', role: 'support' },
      {
        repository,
        createId: () => 'intent-one',
        createRequestId: () => 'command-open-one',
        now: () => new Date('2026-09-09T12:10:00.000Z'),
      },
    );

    expect(opened.result).toMatchObject({
      state: 'ready_for_payment',
      intentId: 'intent-one',
      holdExpiresAt: '2026-09-09T12:40:00.000Z',
    });
    expect((await database.doc('bookingBlocks/intent-one').get()).data()).toMatchObject({
      rentalRequestId: 'request-one',
      state: 'held',
      vehicleId: 'vehicle-one',
    });
    expect((await database.doc('bookingIntents/intent-one').get()).data()).toMatchObject({
      rentalRequestId: 'request-one',
      state: 'intent_created',
      renterId: 'renter-one',
    });
    expect((await database.doc('vehicleAvailability/vehicle-one').get()).data()?.version).toBe(1);
  });

  it('allows overlapping soft requests but serializes payment-window activation through availability', async () => {
    await createRentalRequest(requestCommand('create-first-overlap-0001'), 'renter-one', {
      repository,
      createId: () => 'request-first',
      createRequestId: () => 'command-create-first',
      now: () => new Date('2026-09-09T12:00:00.000Z'),
    });
    await approveRentalRequest(approveCommand('approve-first-overlap-0001', 'request-first'),
      { uid: 'owner-one', isStaff: false }, {
        repository,
        createRequestId: () => 'command-approve-first',
        now: () => new Date('2026-09-09T12:01:00.000Z'),
      });

    await createRentalRequest({
      ...requestCommand('create-second-overlap-0001'),
      data: { ...requestCommand('unused').data, contactPhone: '+2348098765432' },
    }, 'renter-two', {
      repository,
      createId: () => 'request-second',
      createRequestId: () => 'command-create-second',
      now: () => new Date('2026-09-09T12:02:00.000Z'),
    });
    await approveRentalRequest(approveCommand('approve-second-overlap-0001', 'request-second'),
      { uid: 'owner-one', isStaff: false }, {
        repository,
        createRequestId: () => 'command-approve-second',
        now: () => new Date('2026-09-09T12:03:00.000Z'),
      });

    expect((await database.collection('bookingBlocks').get()).empty).toBe(true);

    await openRentalRequestPaymentWindow(openCommand('open-first-overlap-0001', 'request-first'),
      { uid: 'support-one', role: 'support' }, {
        repository,
        createId: () => 'intent-first',
        createRequestId: () => 'command-open-first',
        now: () => new Date('2026-09-09T12:04:00.000Z'),
      });

    await expect(openRentalRequestPaymentWindow(openCommand('open-second-overlap-0001', 'request-second'),
      { uid: 'support-one', role: 'support' }, {
        repository,
        createId: () => 'intent-second',
        createRequestId: () => 'command-open-second',
        now: () => new Date('2026-09-09T12:05:00.000Z'),
      })).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'VEHICLE_UNAVAILABLE' });

    expect((await database.collection('bookingBlocks').get()).size).toBe(1);
    expect((await database.doc('rentalRequests/request-second').get()).data()?.state).toBe('approved');
  });

  it('releases untouched expired windows but protects payment-in-flight checkout_pending intents', async () => {
    await createRentalRequest(requestCommand('create-expiry-request-0001'), 'renter-one', {
      repository,
      createId: () => 'request-expiry',
      createRequestId: () => 'command-create-expiry',
      now: () => new Date('2026-09-09T12:00:00.000Z'),
    });
    await approveRentalRequest(approveCommand('approve-expiry-request-0001', 'request-expiry'),
      { uid: 'owner-one', isStaff: false }, {
        repository,
        createRequestId: () => 'command-approve-expiry',
        now: () => new Date('2026-09-09T12:01:00.000Z'),
      });
    await openRentalRequestPaymentWindow(openCommand('open-expiry-request-0001', 'request-expiry'),
      { uid: 'support-one', role: 'support' }, {
        repository,
        createId: () => 'intent-expiry',
        createRequestId: () => 'command-open-expiry',
        now: () => new Date('2026-09-09T12:02:00.000Z'),
      });

    const expired = await repository.expirePaymentWindows(new Date('2026-09-09T12:33:00.000Z'));
    expect(expired).toMatchObject({ expired: 1, protected: 0, invalid: 0 });
    expect((await database.doc('bookingBlocks/intent-expiry').get()).exists).toBe(false);
    expect((await database.doc('bookingIntents/intent-expiry').get()).data()?.state).toBe('expired');
    expect((await database.doc('rentalRequests/request-expiry').get()).data()?.state).toBe('payment_window_expired');

    await createRentalRequest(requestCommand('create-protected-request-0001', '2026-09-24', '2026-09-26'), 'renter-two', {
      repository,
      createId: () => 'request-protected',
      createRequestId: () => 'command-create-protected',
      now: () => new Date('2026-09-09T13:00:00.000Z'),
    });
    await approveRentalRequest(approveCommand('approve-protected-request-0001', 'request-protected'),
      { uid: 'owner-one', isStaff: false }, {
        repository,
        createRequestId: () => 'command-approve-protected',
        now: () => new Date('2026-09-09T13:01:00.000Z'),
      });
    await openRentalRequestPaymentWindow(openCommand('open-protected-request-0001', 'request-protected'),
      { uid: 'support-one', role: 'support' }, {
        repository,
        createId: () => 'intent-protected',
        createRequestId: () => 'command-open-protected',
        now: () => new Date('2026-09-09T13:02:00.000Z'),
      });
    await database.doc('bookingIntents/intent-protected').update({
      state: 'checkout_pending',
      paymentId: 'payment-protected',
      paymentReference: 'mmg-protected',
      updatedAt: Timestamp.fromDate(new Date('2026-09-09T13:10:00.000Z')),
    });

    const protectedResult = await repository.expirePaymentWindows(new Date('2026-09-09T13:33:00.000Z'));
    expect(protectedResult.protected).toBe(1);
    expect((await database.doc('bookingBlocks/intent-protected').get()).exists).toBe(true);
    expect((await database.doc('rentalRequests/request-protected').get()).data()?.state).toBe('ready_for_payment');
  });

  it('fails closed when the availability sentinel is missing', async () => {
    await database.doc('vehicleAvailability/vehicle-one').delete();
    await createRentalRequest(requestCommand('create-missing-sentinel-0001'), 'renter-one', {
      repository,
      createId: () => 'request-no-sentinel',
      createRequestId: () => 'command-create-no-sentinel',
      now: () => new Date('2026-09-09T12:00:00.000Z'),
    });
    await approveRentalRequest(approveCommand('approve-missing-sentinel-0001', 'request-no-sentinel'),
      { uid: 'owner-one', isStaff: false }, {
        repository,
        createRequestId: () => 'command-approve-no-sentinel',
        now: () => new Date('2026-09-09T12:01:00.000Z'),
      });

    await expect(openRentalRequestPaymentWindow(openCommand('open-missing-sentinel-0001', 'request-no-sentinel'),
      { uid: 'support-one', role: 'support' }, {
        repository,
        createId: () => 'intent-no-sentinel',
        createRequestId: () => 'command-open-no-sentinel',
        now: () => new Date('2026-09-09T12:02:00.000Z'),
      })).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'FAILED_PRECONDITION' });

    expect((await database.collection('bookingBlocks').get()).empty).toBe(true);
    expect((await database.doc('rentalRequests/request-no-sentinel').get()).data()?.state).toBe('approved');
  });
});
