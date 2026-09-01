import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestorePaymentVerificationRepository } from './firestore-payment-verification-repository.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

describeWithEmulator('Firestore R3 terminal verification handling', () => {
  let database: Firestore;
  let repository: FirestorePaymentVerificationRepository;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'payment-r3-terminal-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'payment-r3-terminal-emulator');
    database = getFirestore(app);
    repository = new FirestorePaymentVerificationRepository(database);
  });

  beforeEach(async () => {
    for (const name of ['paymentEvents', 'payments']) {
      const documents = await database.collection(name).listDocuments();
      await Promise.all(documents.map((document) => document.delete()));
    }
    await database.doc('payments/payment-terminal').set({
      paymentId: 'payment-terminal',
      intentId: 'intent-terminal',
      renterId: 'renter-terminal',
      provider: 'paystack',
      reference: 'mmg-terminal123',
      state: 'pending',
      environment: 'test',
      currency: 'NGN',
      amountKobo: 500_000,
    });
    await repository.createWebhookEvent({
      eventId: 'paystack-event-terminal',
      source: 'webhook',
      eventType: 'charge.success',
      reference: 'mmg-terminal123',
      providerStatus: 'success',
      environment: 'test',
      amountKobo: 500_000,
      currency: 'NGN',
      bodySha256: 'b'.repeat(64),
      receivedAt: new Date('2026-09-01T02:10:00.000Z'),
    });
  });

  afterAll(async () => {
    for (const name of ['paymentEvents', 'payments']) {
      const documents = await database.collection(name).listDocuments();
      await Promise.all(documents.map((document) => document.delete()));
    }
  });

  it('commits a terminal rejection instead of throwing/retrying forever when payment is no longer pending', async () => {
    const payment = await repository.getPaymentById('payment-terminal');
    expect(payment).not.toBeNull();
    await database.doc('payments/payment-terminal').update({ state: 'succeeded' });

    const result = await repository.completeVerification(
      'paystack-event-terminal',
      payment!,
      {
        provider: 'paystack',
        reference: 'mmg-terminal123',
        providerStatus: 'success',
        environment: 'test',
        amountKobo: 500_000,
        currency: 'NGN',
      },
      new Date('2026-09-01T02:10:01.000Z'),
    );

    expect(result.verification).toBe('rejected');
    const event = (await database.doc('paymentEvents/paystack-event-terminal').get()).data();
    expect(event?.status).toBe('rejected');
    expect(event?.rejectionReason).toBe('payment_not_pending');
  });
});
