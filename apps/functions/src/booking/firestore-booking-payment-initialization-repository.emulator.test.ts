import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { BookingCommandError } from './errors.js';
import { FirestoreBookingPaymentInitializationRepository } from './firestore-booking-payment-initialization-repository.js';
import { initializeBookingPayment, type CheckoutRenter } from './initialize-booking-payment-service.js';
import type { PaymentGateway } from './payment-gateway.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

const actor: CheckoutRenter = {
  uid: 'renter-one',
  email: 'renter@example.com',
};

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

function command(idempotencyKey = 'payment-init-1234567890') {
  return {
    schemaVersion: 1 as const,
    idempotencyKey,
    data: { intentId: 'intent-one' },
  };
}

function gateway(): PaymentGateway {
  return {
    initializePayment: vi.fn(async (input) => ({
      provider: 'paystack',
      reference: input.reference,
      authorizationUrl: 'https://checkout.paystack.com/access-one',
      accessCode: 'access-one',
      environment: 'test',
    })),
    verifyPayment: vi.fn(async () => {
      throw new Error('verification is not part of R2');
    }),
  };
}

async function clearCollections(database: Firestore) {
  for (const name of ['auditEvents', 'bookingBlocks', 'bookingIntents', 'idempotencyKeys', 'payments', 'renterProfiles']) {
    const documents = await database.collection(name).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

describeWithEmulator('Firestore booking-payment initialization transaction', () => {
  let database: Firestore;
  let repository: FirestoreBookingPaymentInitializationRepository;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'booking-payment-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'booking-payment-emulator');
    database = getFirestore(app);
    repository = new FirestoreBookingPaymentInitializationRepository(database);
  });

  beforeEach(async () => {
    await clearCollections(database);
    const expiresAt = Timestamp.fromDate(new Date('2026-09-01T12:15:00.000Z'));
    await database.doc('bookingIntents/intent-one').set({
      intentId: 'intent-one',
      renterId: actor.uid,
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-02',
      endDate: '2026-09-04',
      state: 'intent_created',
      priceSnapshot,
      vehicleSnapshot: {
        displayName: 'Executive SUV',
        areaLabel: 'Victoria Island',
        categoryLabel: 'Executive SUV',
      },
      createdAt: Timestamp.fromDate(new Date('2026-09-01T12:00:00.000Z')),
      updatedAt: Timestamp.fromDate(new Date('2026-09-01T12:00:00.000Z')),
      expiresAt,
    });
    await database.doc('bookingBlocks/intent-one').set({
      intentId: 'intent-one',
      renterId: actor.uid,
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-02',
      endDate: '2026-09-04',
      state: 'held',
      expiresAt,
      createdAt: Timestamp.fromDate(new Date('2026-09-01T12:00:00.000Z')),
      updatedAt: Timestamp.fromDate(new Date('2026-09-01T12:00:00.000Z')),
    });
    await database.doc(`renterProfiles/${actor.uid}`).set({
      renterId: actor.uid,
      fullName: 'Test Renter',
      email: actor.email,
      phone: '+2348012345678',
      defaultDeliveryAddress: {
        streetAddress: '1 Test Street',
        areaLabel: 'Victoria Island',
      },
      accountStatus: 'active',
    });
  });

  afterAll(async () => {
    if (database) await clearCollections(database);
  });

  it('binds the authoritative intent total and one provider-safe reference before returning checkout', async () => {
    const paymentGateway = gateway();
    const result = await initializeBookingPayment(command(), actor, {
      repository,
      paymentGateway,
      now: () => new Date('2026-09-01T12:01:00.000Z'),
      createRequestId: () => 'request-one',
    });

    expect(result.result.amountKobo).toBe(priceSnapshot.renterTotalKobo);
    expect(result.result.currency).toBe('NGN');
    expect(result.result.reference).toMatch(/^mmg-[a-f0-9]{48}$/);
    expect(paymentGateway.initializePayment).toHaveBeenCalledWith(expect.objectContaining({
      email: actor.email,
      amountKobo: priceSnapshot.renterTotalKobo,
      currency: 'NGN',
      reference: result.result.reference,
    }));

    expect((await database.doc('bookingIntents/intent-one').get()).data()).toMatchObject({
      state: 'checkout_pending',
      paymentId: result.result.paymentId,
      paymentReference: result.result.reference,
    });
    expect((await database.doc(`payments/${result.result.paymentId}`).get()).data()).toMatchObject({
      intentId: 'intent-one',
      renterId: actor.uid,
      state: 'pending',
      provider: 'paystack',
      reference: result.result.reference,
      currency: 'NGN',
      amountKobo: priceSnapshot.renterTotalKobo,
      environment: 'test',
    });
  });

  it('replays completed checkout initialization without a second provider call', async () => {
    const paymentGateway = gateway();
    const dependencies = {
      repository,
      paymentGateway,
      now: () => new Date('2026-09-01T12:01:00.000Z'),
      createRequestId: () => 'request-one',
    };
    const first = await initializeBookingPayment(command(), actor, dependencies);
    const second = await initializeBookingPayment(command(), actor, {
      ...dependencies,
      createRequestId: () => 'request-two',
    });

    expect(second).toEqual(first);
    expect(paymentGateway.initializePayment).toHaveBeenCalledTimes(1);
    expect((await database.collection('payments').get()).size).toBe(1);
  });

  it('returns the existing pending checkout for a new idempotency key instead of creating a second payment', async () => {
    const paymentGateway = gateway();
    const first = await initializeBookingPayment(command('payment-init-first-1234'), actor, {
      repository,
      paymentGateway,
      now: () => new Date('2026-09-01T12:01:00.000Z'),
      createRequestId: () => 'request-one',
    });
    const second = await initializeBookingPayment(command('payment-init-second-123'), actor, {
      repository,
      paymentGateway,
      now: () => new Date('2026-09-01T12:02:00.000Z'),
      createRequestId: () => 'request-two',
    });

    expect(second.result.paymentId).toBe(first.result.paymentId);
    expect(second.result.reference).toBe(first.result.reference);
    expect(paymentGateway.initializePayment).toHaveBeenCalledTimes(1);
    expect((await database.collection('payments').get()).size).toBe(1);
  });

  it('fails before Paystack when the hold is expired', async () => {
    const paymentGateway = gateway();

    await expect(initializeBookingPayment(command(), actor, {
      repository,
      paymentGateway,
      now: () => new Date('2026-09-01T12:16:00.000Z'),
      createRequestId: () => 'request-expired',
    })).rejects.toMatchObject<Partial<BookingCommandError>>({
      code: 'FAILED_PRECONDITION',
      safeDetails: { reason: 'expired' },
    });

    expect(paymentGateway.initializePayment).not.toHaveBeenCalled();
    expect((await database.collection('payments').get()).empty).toBe(true);
  });

  it('fails before Paystack when renter profile email does not match the authenticated renter', async () => {
    const paymentGateway = gateway();

    await expect(initializeBookingPayment(command(), { ...actor, email: 'different@example.com' }, {
      repository,
      paymentGateway,
      now: () => new Date('2026-09-01T12:01:00.000Z'),
      createRequestId: () => 'request-email-mismatch',
    })).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'PROFILE_INCOMPLETE' });

    expect(paymentGateway.initializePayment).not.toHaveBeenCalled();
    expect((await database.collection('payments').get()).empty).toBe(true);
  });
});
