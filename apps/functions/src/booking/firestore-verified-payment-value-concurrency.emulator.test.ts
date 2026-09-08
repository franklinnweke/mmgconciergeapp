import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestoreVerifiedPaymentValueRepository } from './firestore-verified-payment-value-repository.js';
import { deliverVerifiedPaymentValue } from './verified-payment-value-service.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

const priceSnapshot = {
  currency: 'NGN',
  chargedDays: 3,
  ownerDailyRateKobo: 10_000_000,
  baseRentalKobo: 30_000_000,
  deliveryFeeKobo: 0,
  serviceFeeBps: 800,
  serviceFeeFixedKobo: 0,
  serviceFeeKobo: 2_400_000,
  ownerCommissionBps: 1_500,
  ownerCommissionKobo: 4_500_000,
  ownerEarningsKobo: 25_500_000,
  renterTotalKobo: 32_400_000,
  configVersion: 'pricing-v1',
  termsVersion: 'terms-v1',
  cancellationPolicyVersion: 'cancel-v1',
} as const;

const vehicleSnapshot = {
  displayName: 'Pearl Executive SUV',
  areaLabel: 'Victoria Island',
  categoryLabel: 'Executive SUV',
  imageKey: 'pearl-suv',
} as const;

async function clearCollections(database: Firestore) {
  for (const name of [
    'auditEvents',
    'bookingBlocks',
    'bookingCases',
    'bookingIntents',
    'bookings',
    'notificationOutbox',
    'paymentEvents',
    'payments',
    'vehicleAvailability',
  ]) {
    const documents = await database.collection(name).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

async function seedVerifiedJourney(
  database: Firestore,
  suffix: string,
  input: {
    startDate?: string;
    endDate?: string;
    holdExpiresAt?: Date;
  } = {},
) {
  const intentId = `intent-${suffix}`;
  const paymentId = `payment-${suffix}`;
  const eventId = `event-${suffix}`;
  const renterId = `renter-${suffix}`;
  const startDate = input.startDate ?? '2026-09-10';
  const endDate = input.endDate ?? '2026-09-13';
  const createdAt = Timestamp.fromDate(new Date('2026-09-01T03:00:00.000Z'));
  const expiresAt = Timestamp.fromDate(input.holdExpiresAt ?? new Date('2026-09-01T03:30:00.000Z'));

  await database.doc(`bookingIntents/${intentId}`).set({
    intentId,
    renterId,
    ownerId: 'owner-123',
    vehicleId: 'vehicle-123',
    state: 'checkout_pending',
    startDate,
    endDate,
    priceSnapshot,
    vehicleSnapshot,
    paymentId,
    paymentReference: `mmg-${paymentId}`,
    createdAt,
    updatedAt: createdAt,
    expiresAt,
  });
  await database.doc(`payments/${paymentId}`).set({
    paymentId,
    intentId,
    renterId,
    vehicleId: 'vehicle-123',
    provider: 'paystack',
    reference: `mmg-${paymentId}`,
    state: 'pending',
    environment: 'test',
    currency: 'NGN',
    amountKobo: priceSnapshot.renterTotalKobo,
    createdAt,
    updatedAt: createdAt,
  });
  await database.doc(`paymentEvents/${eventId}`).set({
    eventId,
    source: 'webhook',
    eventType: 'charge.success',
    reference: `mmg-${paymentId}`,
    status: 'verified_success',
    providerStatus: 'success',
    paymentId,
    intentId,
    createdAt,
    updatedAt: createdAt,
  });
  await database.doc(`bookingBlocks/${intentId}`).set({
    intentId,
    renterId,
    ownerId: 'owner-123',
    vehicleId: 'vehicle-123',
    startDate,
    endDate,
    state: 'held',
    version: 1,
    expiresAt,
    createdAt,
    updatedAt: createdAt,
  });
  return { eventId, intentId, paymentId, renterId };
}

function ids(prefix: string) {
  const generated = [`booking-${prefix}`, `case-${prefix}`, `outbox-${prefix}`];
  return {
    createId: () => generated.shift()!,
    createRequestId: () => `request-${prefix}`,
  };
}

async function expectNoValueDeliveryEffects(database: Firestore, journey: {
  eventId: string;
  intentId: string;
  paymentId: string;
}) {
  expect((await database.doc(`payments/${journey.paymentId}`).get()).data()?.state).toBe('pending');
  expect((await database.doc(`bookingIntents/${journey.intentId}`).get()).data()?.state).toBe('checkout_pending');
  expect((await database.doc(`paymentEvents/${journey.eventId}`).get()).data()?.valueDeliveryOutcome).toBeUndefined();
  expect((await database.collection('bookings').get()).size).toBe(0);
  expect((await database.collection('bookingCases').get()).size).toBe(0);
  expect((await database.collection('notificationOutbox').get()).size).toBe(0);
  expect((await database.collection('auditEvents').get()).size).toBe(0);
}

describeWithEmulator('Firestore R4 late verified payment concurrency', () => {
  let database: Firestore;
  let repository: FirestoreVerifiedPaymentValueRepository;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'payment-r4-concurrency-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'payment-r4-concurrency-emulator');
    database = getFirestore(app);
    repository = new FirestoreVerifiedPaymentValueRepository(database);
  });

  beforeEach(async () => {
    await clearCollections(database);
    await database.doc('vehicleAvailability/vehicle-123').set({
      vehicleId: 'vehicle-123',
      version: 10,
      updatedAt: Timestamp.fromDate(new Date('2026-09-01T03:00:00.000Z')),
    });
  });

  afterAll(async () => {
    if (database) await clearCollections(database);
  });

  it('reacquires an expired hold when the dates are still available', async () => {
    const journey = await seedVerifiedJourney(database, 'late-open');
    const generated = ids('late-open');

    const result = await deliverVerifiedPaymentValue(journey.eventId, {
      repository,
      ...generated,
      now: () => new Date('2026-09-01T04:00:00.000Z'),
    });

    expect(result).toMatchObject({
      outcome: 'paid_pending_owner',
      bookingId: 'booking-late-open',
      paymentState: 'succeeded',
      intentState: 'paid',
    });
    const block = (await database.doc(`bookingBlocks/${journey.intentId}`).get()).data();
    expect(block).toMatchObject({ state: 'paid', bookingId: 'booking-late-open' });
    expect(block?.expiresAt).toBeUndefined();
    expect((await database.doc(`payments/${journey.paymentId}`).get()).data()?.state).toBe('succeeded');
    expect((await database.doc(`bookingIntents/${journey.intentId}`).get()).data()?.state).toBe('paid');
    expect((await database.collection('bookingCases').get()).size).toBe(0);
    expect((await database.collection('bookings').get()).size).toBe(1);
    expect((await database.doc('vehicleAvailability/vehicle-123').get()).data()?.version).toBe(11);
    expect((await database.collection('auditEvents').get()).docs[0]?.data()).toMatchObject({
      eventType: 'booking.payment_value_delivered_after_hold_reacquired',
      details: { holdReacquired: true },
    });
  });

  it('records paid_conflict when a real payment arrives after another block takes the dates', async () => {
    const journey = await seedVerifiedJourney(database, 'late-conflict');
    await database.doc('bookingBlocks/owner-block-winner').set({
      blockId: 'owner-block-winner',
      ownerId: 'owner-123',
      vehicleId: 'vehicle-123',
      startDate: '2026-09-11',
      endDate: '2026-09-12',
      state: 'owner_block',
      version: 1,
      reason: 'owner_use',
      createdAt: Timestamp.fromDate(new Date('2026-09-01T03:45:00.000Z')),
      updatedAt: Timestamp.fromDate(new Date('2026-09-01T03:45:00.000Z')),
    });
    const generated = ids('late-conflict');

    const result = await deliverVerifiedPaymentValue(journey.eventId, {
      repository,
      ...generated,
      now: () => new Date('2026-09-01T04:00:00.000Z'),
    });

    expect(result).toEqual({
      eventId: journey.eventId,
      paymentId: journey.paymentId,
      intentId: journey.intentId,
      outcome: 'paid_conflict',
      paymentState: 'succeeded',
      intentState: 'paid_conflict',
      caseId: 'case-late-conflict',
    });
    expect((await database.doc(`payments/${journey.paymentId}`).get()).data()).toMatchObject({
      state: 'succeeded',
      valueDeliveryOutcome: 'paid_conflict',
      caseId: 'case-late-conflict',
    });
    expect((await database.doc(`bookingIntents/${journey.intentId}`).get()).data()).toMatchObject({
      state: 'paid_conflict',
      caseId: 'case-late-conflict',
    });
    expect((await database.doc(`bookingBlocks/${journey.intentId}`).get()).exists).toBe(false);
    expect((await database.collection('bookings').get()).size).toBe(0);
    expect((await database.doc('bookingCases/case-late-conflict').get()).data()).toMatchObject({
      type: 'paid_conflict',
      status: 'open',
      priority: 'urgent',
      reasonCode: 'late_payment_dates_unavailable',
      paymentId: journey.paymentId,
      intentId: journey.intentId,
    });
    expect((await database.doc(`paymentEvents/${journey.eventId}`).get()).data()).toMatchObject({
      valueDeliveryOutcome: 'paid_conflict',
      valueDeliveryCaseId: 'case-late-conflict',
    });
    expect((await database.doc('vehicleAvailability/vehicle-123').get()).data()?.version).toBe(11);
  });

  it('serializes two overlapping late payments so one wins the dates and one becomes paid_conflict', async () => {
    const first = await seedVerifiedJourney(database, 'race-a');
    const second = await seedVerifiedJourney(database, 'race-b');

    const [firstResult, secondResult] = await Promise.all([
      deliverVerifiedPaymentValue(first.eventId, {
        repository,
        ...ids('race-a'),
        now: () => new Date('2026-09-01T04:00:00.000Z'),
      }),
      deliverVerifiedPaymentValue(second.eventId, {
        repository,
        ...ids('race-b'),
        now: () => new Date('2026-09-01T04:00:00.000Z'),
      }),
    ]);

    const outcomes = [firstResult.outcome, secondResult.outcome].sort();
    expect(outcomes).toEqual(['paid_conflict', 'paid_pending_owner']);
    expect((await database.collection('bookings').get()).size).toBe(1);
    expect((await database.collection('bookingCases').get()).size).toBe(1);
    expect((await database.collection('notificationOutbox').get()).size).toBe(2);

    const payments = await database.collection('payments').get();
    expect(payments.docs.map((document) => document.data().state).sort()).toEqual(['succeeded', 'succeeded']);
    const intentStates = (await database.collection('bookingIntents').get()).docs
      .map((document) => document.data().state)
      .sort();
    expect(intentStates).toEqual(['paid', 'paid_conflict']);
    const livePaidBlocks = (await database.collection('bookingBlocks').get()).docs
      .filter((document) => document.data().state === 'paid');
    expect(livePaidBlocks).toHaveLength(1);
    expect((await database.doc('vehicleAvailability/vehicle-123').get()).data()?.version).toBe(12);
  }, 15_000);

  it('fails closed when the intent block already has a non-held state', async () => {
    const journey = await seedVerifiedJourney(database, 'broken-block');
    await database.doc(`bookingBlocks/${journey.intentId}`).update({
      state: 'paid',
      bookingId: 'unexpected-existing-booking',
    });

    await expect(deliverVerifiedPaymentValue(journey.eventId, {
      repository,
      ...ids('broken-block'),
      now: () => new Date('2026-09-01T04:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });

    await expectNoValueDeliveryEffects(database, journey);
    expect((await database.doc(`bookingBlocks/${journey.intentId}`).get()).data()).toMatchObject({
      state: 'paid',
      bookingId: 'unexpected-existing-booking',
    });
    expect((await database.doc('vehicleAvailability/vehicle-123').get()).data()?.version).toBe(10);
  });

  it('fails closed when the availability sentinel is missing', async () => {
    const journey = await seedVerifiedJourney(database, 'missing-sentinel');
    await database.doc('vehicleAvailability/vehicle-123').delete();

    await expect(deliverVerifiedPaymentValue(journey.eventId, {
      repository,
      ...ids('missing-sentinel'),
      now: () => new Date('2026-09-01T04:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });

    await expectNoValueDeliveryEffects(database, journey);
    expect((await database.doc(`bookingBlocks/${journey.intentId}`).get()).data()?.state).toBe('held');
    expect((await database.doc('vehicleAvailability/vehicle-123').get()).exists).toBe(false);
  });

  it('fails closed when the availability sentinel version is malformed', async () => {
    const journey = await seedVerifiedJourney(database, 'bad-sentinel');
    await database.doc('vehicleAvailability/vehicle-123').update({ version: 'corrupt' });

    await expect(deliverVerifiedPaymentValue(journey.eventId, {
      repository,
      ...ids('bad-sentinel'),
      now: () => new Date('2026-09-01T04:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });

    await expectNoValueDeliveryEffects(database, journey);
    expect((await database.doc(`bookingBlocks/${journey.intentId}`).get()).data()?.state).toBe('held');
    expect((await database.doc('vehicleAvailability/vehicle-123').get()).data()?.version).toBe('corrupt');
  });
});
