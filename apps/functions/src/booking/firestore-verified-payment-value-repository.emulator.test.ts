import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestorePaidBookingResponseRepository } from './firestore-paid-booking-response-repository.js';
import { FirestoreVerifiedPaymentValueRepository } from './firestore-verified-payment-value-repository.js';
import { confirmBooking, rejectBooking } from './paid-booking-response-service.js';
import { deliverVerifiedPaymentValue } from './verified-payment-value-service.js';

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
    'paymentEvents',
    'payments',
    'vehicleAvailability',
  ]) {
    const documents = await database.collection(name).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

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

describeWithEmulator('Firestore R4 verified payment value delivery', () => {
  let database: Firestore;
  let repository: FirestoreVerifiedPaymentValueRepository;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'payment-r4-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'payment-r4-emulator');
    database = getFirestore(app);
    repository = new FirestoreVerifiedPaymentValueRepository(database);
  });

  beforeEach(async () => {
    await clearCollections(database);
    const createdAt = Timestamp.fromDate(new Date('2026-09-01T03:00:00.000Z'));
    await database.doc('bookingIntents/intent-123').set({
      intentId: 'intent-123',
      renterId: 'renter-123',
      ownerId: 'owner-123',
      vehicleId: 'vehicle-123',
      state: 'checkout_pending',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      priceSnapshot,
      vehicleSnapshot,
      paymentId: 'payment-123',
      paymentReference: 'mmg-payment-123',
      createdAt,
      updatedAt: createdAt,
      expiresAt: Timestamp.fromDate(new Date('2026-09-01T04:15:00.000Z')),
    });
    await database.doc('payments/payment-123').set({
      paymentId: 'payment-123',
      intentId: 'intent-123',
      renterId: 'renter-123',
      vehicleId: 'vehicle-123',
      provider: 'paystack',
      reference: 'mmg-payment-123',
      state: 'pending',
      environment: 'test',
      currency: 'NGN',
      amountKobo: priceSnapshot.renterTotalKobo,
      createdAt,
      updatedAt: createdAt,
    });
    await database.doc('paymentEvents/event-123').set({
      eventId: 'event-123',
      source: 'webhook',
      eventType: 'charge.success',
      reference: 'mmg-payment-123',
      status: 'verified_success',
      providerStatus: 'success',
      paymentId: 'payment-123',
      intentId: 'intent-123',
      createdAt,
      updatedAt: createdAt,
    });
    await database.doc('bookingBlocks/intent-123').set({
      intentId: 'intent-123',
      renterId: 'renter-123',
      ownerId: 'owner-123',
      vehicleId: 'vehicle-123',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      state: 'held',
      version: 1,
      expiresAt: Timestamp.fromDate(new Date('2026-09-01T04:15:00.000Z')),
      createdAt,
      updatedAt: createdAt,
    });
    await database.doc('vehicleAvailability/vehicle-123').set({
      vehicleId: 'vehicle-123',
      version: 4,
      updatedAt: createdAt,
    });
  });

  afterAll(async () => {
    if (database) await clearCollections(database);
  });

  it('atomically converts an active hold into one paid_pending_owner booking', async () => {
    const generated = ['booking-123', 'case-unused', 'outbox-123'];
    const result = await deliverVerifiedPaymentValue('event-123', {
      repository,
      createId: () => generated.shift()!,
      createRequestId: () => 'request-r4-123',
      now: () => new Date('2026-09-01T04:00:00.000Z'),
    });

    expect(result).toEqual({
      eventId: 'event-123',
      paymentId: 'payment-123',
      intentId: 'intent-123',
      outcome: 'paid_pending_owner',
      paymentState: 'succeeded',
      intentState: 'paid',
      bookingId: 'booking-123',
    });
    expect((await database.doc('payments/payment-123').get()).data()).toMatchObject({
      state: 'succeeded',
      succeededByEventId: 'event-123',
      valueDeliveryOutcome: 'paid_pending_owner',
      bookingId: 'booking-123',
    });
    expect((await database.doc('bookingIntents/intent-123').get()).data()).toMatchObject({
      state: 'paid',
      bookingId: 'booking-123',
    });
    const block = (await database.doc('bookingBlocks/intent-123').get()).data();
    expect(block).toMatchObject({ state: 'paid', bookingId: 'booking-123', version: 2 });
    expect(block?.expiresAt).toBeUndefined();
    expect((await database.doc('bookings/booking-123').get()).data()).toMatchObject({
      intentId: 'intent-123',
      renterId: 'renter-123',
      ownerId: 'owner-123',
      vehicleId: 'vehicle-123',
      state: 'paid_pending_owner',
      version: 1,
      blockId: 'intent-123',
      priceSnapshot,
      vehicleSnapshot,
      paymentId: 'payment-123',
      paymentReference: 'mmg-payment-123',
    });
    expect((await database.doc('vehicleAvailability/vehicle-123').get()).data()?.version).toBe(5);
    expect((await database.doc('paymentEvents/event-123').get()).data()).toMatchObject({
      valueDeliveryOutcome: 'paid_pending_owner',
      valueDeliveryBookingId: 'booking-123',
      valueDeliveryRequestId: 'request-r4-123',
    });
    expect((await database.doc('notificationOutbox/outbox-123').get()).data()).toMatchObject({
      eventType: 'booking.paid_pending_owner',
      bookingId: 'booking-123',
      ownerId: 'owner-123',
      status: 'unavailable',
    });
    expect((await database.collection('bookings').get()).size).toBe(1);
    expect((await database.collection('notificationOutbox').get()).size).toBe(1);
    expect((await database.collection('auditEvents').get()).size).toBe(1);
  });

  it('replays the delivered event without duplicating booking, paid block, outbox, or audit effects', async () => {
    const firstIds = ['booking-first', 'case-unused', 'outbox-first'];
    const first = await deliverVerifiedPaymentValue('event-123', {
      repository,
      createId: () => firstIds.shift()!,
      createRequestId: () => 'request-first',
      now: () => new Date('2026-09-01T04:00:00.000Z'),
    });
    const replayIds = ['booking-must-not-win', 'case-must-not-win', 'outbox-must-not-win'];
    const replay = await deliverVerifiedPaymentValue('event-123', {
      repository,
      createId: () => replayIds.shift()!,
      createRequestId: () => 'request-replay',
      now: () => new Date('2026-09-01T04:01:00.000Z'),
    });

    expect(replay).toEqual(first);
    expect((await database.collection('bookings').get()).size).toBe(1);
    expect((await database.collection('bookingBlocks').get()).docs.filter((document) => document.data().state === 'paid')).toHaveLength(1);
    expect((await database.collection('notificationOutbox').get()).size).toBe(1);
    expect((await database.collection('auditEvents').get()).size).toBe(1);
  });

  it('reuses the original value effect for a second verified-success event on the same payment', async () => {
    const firstIds = ['booking-original', 'case-unused', 'outbox-original'];
    const first = await deliverVerifiedPaymentValue('event-123', {
      repository,
      createId: () => firstIds.shift()!,
      createRequestId: () => 'request-original',
      now: () => new Date('2026-09-01T04:00:00.000Z'),
    });
    await database.doc('paymentEvents/event-reconcile-456').set({
      eventId: 'event-reconcile-456',
      source: 'reconcile',
      eventType: 'reconcile',
      reference: 'mmg-payment-123',
      status: 'verified_success',
      providerStatus: 'success',
      paymentId: 'payment-123',
      intentId: 'intent-123',
      createdAt: Timestamp.fromDate(new Date('2026-09-01T04:02:00.000Z')),
      updatedAt: Timestamp.fromDate(new Date('2026-09-01T04:02:00.000Z')),
    });

    const replayIds = ['booking-must-not-win', 'case-must-not-win', 'outbox-must-not-win'];
    const replay = await deliverVerifiedPaymentValue('event-reconcile-456', {
      repository,
      createId: () => replayIds.shift()!,
      createRequestId: () => 'request-reconcile-replay',
      now: () => new Date('2026-09-01T04:03:00.000Z'),
    });

    expect(replay).toEqual({ ...first, eventId: 'event-reconcile-456' });
    expect((await database.collection('bookings').get()).size).toBe(1);
    expect((await database.collection('bookingBlocks').get()).docs.filter((document) => document.data().state === 'paid')).toHaveLength(1);
    expect((await database.collection('notificationOutbox').get()).size).toBe(1);
    expect((await database.collection('auditEvents').get()).size).toBe(1);
    expect((await database.doc('paymentEvents/event-reconcile-456').get()).data()).toMatchObject({
      valueDeliveryOutcome: 'paid_pending_owner',
      valueDeliveryBookingId: 'booking-original',
    });
  });

  it('produces a booking the existing owner-confirmation transaction can consume unchanged', async () => {
    const ids = ['booking-owner-compatible', 'case-unused', 'outbox-paid'];
    await deliverVerifiedPaymentValue('event-123', {
      repository,
      createId: () => ids.shift()!,
      createRequestId: () => 'request-paid',
      now: () => new Date('2026-09-01T04:00:00.000Z'),
    });

    const ownerRepository = new FirestorePaidBookingResponseRepository(database);
    await confirmBooking({
      schemaVersion: 1,
      idempotencyKey: 'owner-confirm-r4-booking-0001',
      data: { bookingId: 'booking-owner-compatible', expectedVersion: 1 },
    }, { uid: 'owner-123', isSuperAdmin: false }, {
      repository: ownerRepository,
      createId: () => 'outbox-owner-confirm',
      createRequestId: () => 'request-owner-confirm',
      now: () => new Date('2026-09-01T04:02:00.000Z'),
    });

    expect((await database.doc('bookings/booking-owner-compatible').get()).data()).toMatchObject({
      state: 'confirmed',
      version: 2,
      blockId: 'intent-123',
    });
    expect((await database.doc('bookingBlocks/intent-123').get()).data()?.state).toBe('confirmed');
  });

  it('produces a booking the existing owner-rejection transaction can consume unchanged', async () => {
    const ids = ['booking-owner-reject-compatible', 'case-unused', 'outbox-paid'];
    await deliverVerifiedPaymentValue('event-123', {
      repository,
      createId: () => ids.shift()!,
      createRequestId: () => 'request-paid-reject',
      now: () => new Date('2026-09-01T04:00:00.000Z'),
    });

    const ownerRepository = new FirestorePaidBookingResponseRepository(database);
    const ownerIds = ['case-owner-rejection-r4', 'outbox-owner-reject'];
    await rejectBooking({
      schemaVersion: 1,
      idempotencyKey: 'owner-reject-r4-booking-0001',
      data: {
        bookingId: 'booking-owner-reject-compatible',
        expectedVersion: 1,
        reason: 'The assigned chauffeur is no longer available.',
      },
    }, { uid: 'owner-123', isSuperAdmin: false }, {
      repository: ownerRepository,
      createId: () => ownerIds.shift()!,
      createRequestId: () => 'request-owner-reject',
      now: () => new Date('2026-09-01T04:02:00.000Z'),
    });

    expect((await database.doc('bookings/booking-owner-reject-compatible').get()).data()).toMatchObject({
      state: 'intervention_required',
      version: 2,
      blockId: 'intent-123',
    });
    expect((await database.doc('bookingBlocks/intent-123').get()).exists).toBe(false);
    expect((await database.doc('bookingCases/case-owner-rejection-r4').get()).data()).toMatchObject({
      type: 'owner_rejection',
      status: 'open',
      bookingId: 'booking-owner-reject-compatible',
    });
  });
});
