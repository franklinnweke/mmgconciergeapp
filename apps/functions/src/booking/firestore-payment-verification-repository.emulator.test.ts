import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestorePaymentVerificationRepository } from './firestore-payment-verification-repository.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

async function clearCollections(database: Firestore) {
  for (const name of ['paymentEvents', 'payments']) {
    const documents = await database.collection(name).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

describeWithEmulator('Firestore R3 payment verification', () => {
  let database: Firestore;
  let repository: FirestorePaymentVerificationRepository;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'payment-r3-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'payment-r3-emulator');
    database = getFirestore(app);
    repository = new FirestorePaymentVerificationRepository(database);
  });

  beforeEach(async () => {
    await clearCollections(database);
    await database.doc('payments/payment-123').set({
      paymentId: 'payment-123',
      intentId: 'intent-123',
      renterId: 'renter-123',
      provider: 'paystack',
      reference: 'mmg-abc123',
      state: 'pending',
      environment: 'test',
      currency: 'NGN',
      amountKobo: 12_500_000,
    });
  });

  afterAll(async () => {
    if (database) await clearCollections(database);
  });

  function webhookEvent(eventId = 'paystack-event-123') {
    return {
      eventId,
      source: 'webhook' as const,
      eventType: 'charge.success' as const,
      reference: 'mmg-abc123',
      providerStatus: 'success' as const,
      environment: 'test' as const,
      amountKobo: 12_500_000,
      currency: 'NGN',
      paidAtIso: '2026-09-01T02:00:00.000Z',
      bodySha256: 'a'.repeat(64),
      receivedAt: new Date('2026-09-01T02:00:01.000Z'),
    };
  }

  it('deduplicates a repeated signed webhook event into one paymentEvents document', async () => {
    await expect(repository.createWebhookEvent(webhookEvent())).resolves.toBe('created');
    await expect(repository.createWebhookEvent(webhookEvent())).resolves.toBe('duplicate');
    expect((await database.collection('paymentEvents').get()).size).toBe(1);
  });

  it('records exact verified success while leaving payment state pending for R4', async () => {
    await repository.createWebhookEvent(webhookEvent());
    const payment = await repository.getPaymentByReference('mmg-abc123');
    expect(payment).not.toBeNull();

    const result = await repository.completeVerification(
      'paystack-event-123',
      payment!,
      {
        provider: 'paystack',
        reference: 'mmg-abc123',
        providerStatus: 'success',
        environment: 'test',
        amountKobo: 12_500_000,
        currency: 'NGN',
        paidAtIso: '2026-09-01T02:00:00.000Z',
      },
      new Date('2026-09-01T02:00:02.000Z'),
    );

    expect(result.verification).toBe('verified_success');
    expect((await database.doc('paymentEvents/paystack-event-123').get()).data()?.status).toBe('verified_success');
    const storedPayment = (await database.doc('payments/payment-123').get()).data();
    expect(storedPayment?.state).toBe('pending');
    expect(storedPayment?.lastVerificationOutcome).toBe('verified_success');
  });

  it('rejects wrong amount without advancing payment state', async () => {
    await repository.createWebhookEvent(webhookEvent('paystack-event-wrong-amount'));
    const payment = await repository.getPaymentByReference('mmg-abc123');
    const result = await repository.completeVerification(
      'paystack-event-wrong-amount',
      payment!,
      {
        provider: 'paystack',
        reference: 'mmg-abc123',
        providerStatus: 'success',
        environment: 'test',
        amountKobo: 1,
        currency: 'NGN',
      },
      new Date('2026-09-01T02:01:00.000Z'),
    );

    expect(result.verification).toBe('rejected');
    const event = (await database.doc('paymentEvents/paystack-event-wrong-amount').get()).data();
    expect(event?.rejectionReason).toBe('amount_mismatch');
    expect((await database.doc('payments/payment-123').get()).data()?.state).toBe('pending');
  });

  it('rejects wrong currency, environment, or reference without delivering value', async () => {
    const cases = [
      {
        eventId: 'paystack-event-currency',
        result: { reference: 'mmg-abc123', environment: 'test' as const, currency: 'USD', amountKobo: 12_500_000 },
        reason: 'currency_mismatch',
      },
      {
        eventId: 'paystack-event-environment',
        result: { reference: 'mmg-abc123', environment: 'live' as const, currency: 'NGN', amountKobo: 12_500_000 },
        reason: 'environment_mismatch',
      },
      {
        eventId: 'paystack-event-reference',
        result: { reference: 'different-reference', environment: 'test' as const, currency: 'NGN', amountKobo: 12_500_000 },
        reason: 'reference_mismatch',
      },
    ];

    for (const testCase of cases) {
      await repository.createWebhookEvent(webhookEvent(testCase.eventId));
      const payment = await repository.getPaymentByReference('mmg-abc123');
      const completion = await repository.completeVerification(
        testCase.eventId,
        payment!,
        {
          provider: 'paystack',
          providerStatus: 'success',
          ...testCase.result,
        },
        new Date('2026-09-01T02:02:00.000Z'),
      );
      expect(completion.verification).toBe('rejected');
      expect((await database.doc(`paymentEvents/${testCase.eventId}`).get()).data()?.rejectionReason).toBe(testCase.reason);
      expect((await database.doc('payments/payment-123').get()).data()?.state).toBe('pending');
    }
  });

  it('records non-success provider status without treating it as paid', async () => {
    await repository.createReconcileEvent({
      eventId: 'paystack-reconcile-pending',
      reference: 'mmg-abc123',
      providerStatus: 'pending',
      environment: 'test',
      amountKobo: 12_500_000,
      currency: 'NGN',
      receivedAt: new Date('2026-09-01T02:03:00.000Z'),
    });
    const payment = await repository.getPaymentById('payment-123');
    const completion = await repository.completeVerification(
      'paystack-reconcile-pending',
      payment!,
      {
        provider: 'paystack',
        reference: 'mmg-abc123',
        providerStatus: 'pending',
        environment: 'test',
        amountKobo: 12_500_000,
        currency: 'NGN',
      },
      new Date('2026-09-01T02:03:01.000Z'),
    );
    expect(completion.verification).toBe('not_succeeded');
    expect((await database.doc('payments/payment-123').get()).data()?.state).toBe('pending');
  });
});
