import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestoreVerifiedPaymentValueRepository } from './firestore-verified-payment-value-repository.js';
import { deliverVerifiedPaymentValue } from './verified-payment-value-service.js';

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

const vehicleSnapshot = {
  displayName: 'Mercedes-Benz GLE',
  areaLabel: 'Victoria Island',
  categoryLabel: 'Executive SUV',
  imageKey: 'hero-suv',
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
    'rentalRequests',
    'vehicleAvailability',
  ]) {
    const documents = await database.collection(name).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

describeWithEmulator('request-first verified payment value delivery', () => {
  let database: Firestore;
  let repository: FirestoreVerifiedPaymentValueRepository;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'request-first-payment-value-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'request-first-payment-value-emulator');
    database = getFirestore(app);
    repository = new FirestoreVerifiedPaymentValueRepository(database);
  });

  beforeEach(async () => {
    await clearCollections(database);
    const createdAt = Timestamp.fromDate(new Date('2026-09-09T12:00:00.000Z'));
    const protectedUntil = Timestamp.fromDate(new Date('2026-09-09T14:30:00.000Z'));

    await database.doc('rentalRequests/request-one').set({
      requestId: 'request-one',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-20',
      endDate: '2026-09-22',
      state: 'ready_for_payment',
      version: 3,
      intentId: 'intent-one',
      holdExpiresAt: Timestamp.fromDate(new Date('2026-09-09T12:40:00.000Z')),
      createdAt,
      updatedAt: createdAt,
    });
    await database.doc('bookingIntents/intent-one').set({
      intentId: 'intent-one',
      rentalRequestId: 'request-one',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      state: 'checkout_pending',
      startDate: '2026-09-20',
      endDate: '2026-09-22',
      priceSnapshot,
      vehicleSnapshot,
      paymentId: 'payment-one',
      paymentReference: 'mmg-request-first-one',
      expiresAt: protectedUntil,
      createdAt,
      updatedAt: createdAt,
    });
    await database.doc('bookingBlocks/intent-one').set({
      intentId: 'intent-one',
      rentalRequestId: 'request-one',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-20',
      endDate: '2026-09-22',
      state: 'held',
      version: 2,
      expiresAt: protectedUntil,
      createdAt,
      updatedAt: createdAt,
    });
    await database.doc('payments/payment-one').set({
      paymentId: 'payment-one',
      intentId: 'intent-one',
      rentalRequestId: 'request-one',
      renterId: 'renter-one',
      vehicleId: 'vehicle-one',
      provider: 'paystack',
      reference: 'mmg-request-first-one',
      state: 'pending',
      environment: 'test',
      currency: 'NGN',
      amountKobo: priceSnapshot.renterTotalKobo,
      createdAt,
      updatedAt: createdAt,
    });
    await database.doc('paymentEvents/event-one').set({
      eventId: 'event-one',
      source: 'webhook',
      eventType: 'charge.success',
      reference: 'mmg-request-first-one',
      status: 'verified_success',
      providerStatus: 'success',
      paymentId: 'payment-one',
      intentId: 'intent-one',
      createdAt,
      updatedAt: createdAt,
    });
    await database.doc('vehicleAvailability/vehicle-one').set({
      vehicleId: 'vehicle-one',
      version: 1,
      updatedAt: createdAt,
    });
  });

  afterAll(async () => {
    if (database) await clearCollections(database);
  });

  it('atomically confirms an approved request after trusted Paystack success', async () => {
    const ids = ['booking-one', 'case-unused', 'outbox-one'];
    const result = await deliverVerifiedPaymentValue('event-one', {
      repository,
      createId: () => ids.shift()!,
      createRequestId: () => 'delivery-request-one',
      now: () => new Date('2026-09-09T12:25:00.000Z'),
    });

    expect(result).toEqual({
      eventId: 'event-one',
      paymentId: 'payment-one',
      intentId: 'intent-one',
      outcome: 'confirmed',
      paymentState: 'succeeded',
      intentState: 'paid',
      bookingId: 'booking-one',
    });
    expect((await database.doc('bookings/booking-one').get()).data()).toMatchObject({
      rentalRequestId: 'request-one',
      state: 'confirmed',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      paymentId: 'payment-one',
    });
    expect((await database.doc('bookingBlocks/intent-one').get()).data()).toMatchObject({
      state: 'confirmed',
      bookingId: 'booking-one',
    });
    expect((await database.doc('rentalRequests/request-one').get()).data()).toMatchObject({
      state: 'confirmed',
      version: 4,
      bookingId: 'booking-one',
    });
    expect((await database.doc('payments/payment-one').get()).data()).toMatchObject({
      state: 'succeeded',
      valueDeliveryOutcome: 'confirmed',
      bookingId: 'booking-one',
    });
    expect((await database.doc('notificationOutbox/outbox-one').get()).data()).toMatchObject({
      eventType: 'booking.confirmed',
      bookingId: 'booking-one',
    });
  });

  it('routes a verified payment to paid_conflict when the dates are no longer safely available', async () => {
    await database.doc('bookingBlocks/competing-confirmed').set({
      intentId: 'competing-intent',
      renterId: 'other-renter',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-21',
      endDate: '2026-09-23',
      state: 'confirmed',
      version: 1,
      bookingId: 'competing-booking',
      createdAt: Timestamp.fromDate(new Date('2026-09-09T12:10:00.000Z')),
      updatedAt: Timestamp.fromDate(new Date('2026-09-09T12:10:00.000Z')),
    });

    const ids = ['booking-unused', 'case-one', 'outbox-conflict'];
    const result = await deliverVerifiedPaymentValue('event-one', {
      repository,
      createId: () => ids.shift()!,
      createRequestId: () => 'delivery-request-conflict',
      now: () => new Date('2026-09-09T12:25:00.000Z'),
    });

    expect(result).toEqual({
      eventId: 'event-one',
      paymentId: 'payment-one',
      intentId: 'intent-one',
      outcome: 'paid_conflict',
      paymentState: 'succeeded',
      intentState: 'paid_conflict',
      caseId: 'case-one',
    });
    expect((await database.doc('bookings/booking-unused').get()).exists).toBe(false);
    expect((await database.doc('bookingBlocks/intent-one').get()).exists).toBe(false);
    expect((await database.doc('rentalRequests/request-one').get()).data()).toMatchObject({
      state: 'needs_attention',
      version: 4,
      caseId: 'case-one',
    });
    expect((await database.doc('bookingCases/case-one').get()).data()).toMatchObject({
      rentalRequestId: 'request-one',
      type: 'paid_conflict',
      status: 'open',
      priority: 'urgent',
    });
  });
});
