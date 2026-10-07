import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { cancelUnpaidBookingIntent } from './cancel-unpaid-booking-intent.js';

const suite = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const now = new Date('2026-10-05T12:00:00Z');
const record = {
  renterId: 'renter-1', ownerId: 'owner-1', vehicleId: 'car-1',
  startDate: '2026-09-01', endDate: '2026-09-03', state: 'intent_created',
  expiresAt: Timestamp.fromDate(new Date('2026-08-31T12:00:00Z')),
};
const command = (id = 'hold-1', key = 'cancel_unpaid_hold_1') => ({ schemaVersion: 1, idempotencyKey: key, data: { intentId: id } });

suite('historical unpaid hold cancellation', () => {
  let app: App;
  let db: Firestore;
  beforeAll(() => { app = initializeApp({ projectId: 'demo-mmg-unpaid-hold' }, 'unpaid-hold-cancellation'); db = getFirestore(app); });
  afterAll(async () => { await db.terminate(); await deleteApp(app); });
  beforeEach(async () => {
    for (const name of ['bookingIntents', 'bookingBlocks', 'vehicleAvailability', 'payments', 'auditEvents', 'idempotencyKeys']) {
      const rows = await db.collection(name).get();
      await Promise.all(rows.docs.map((doc) => doc.ref.delete()));
    }
    await db.doc('bookingIntents/hold-1').set(record);
    await db.doc('bookingBlocks/hold-1').set({ ...record, intentId: 'hold-1', state: 'held', version: 1 });
    await db.doc('vehicleAvailability/car-1').set({ version: 4 });
  });

  async function assertUnchanged() {
    expect((await db.doc('bookingIntents/hold-1').get()).data()?.state).toBe('intent_created');
    expect((await db.doc('bookingBlocks/hold-1').get()).exists).toBe(true);
    expect((await db.collection('auditEvents').get()).size).toBe(0);
    expect((await db.collection('idempotencyKeys').get()).size).toBe(0);
  }

  it('releases past-date unpaid holds atomically without payment or refund', async () => {
    const result = await cancelUnpaidBookingIntent(command(), 'renter-1', db, now);
    expect(result.result).toEqual({ intentId: 'hold-1', state: 'expired', cancelledAt: now.toISOString(), inventoryReleased: true });
    expect((await db.doc('bookingBlocks/hold-1').get()).exists).toBe(false);
    expect((await db.doc('vehicleAvailability/car-1').get()).data()?.version).toBe(5);
    expect((await db.doc('bookingIntents/hold-1').get()).data()?.cancelledByRenterAt.toDate()).toEqual(now);
    expect((await db.collection('payments').get()).size).toBe(0);
    expect((await db.collection('auditEvents').get()).size).toBe(1);
  });

  it('replays concurrent retries with one release and one audit', async () => {
    const results = await Promise.all([1, 2].map(() => cancelUnpaidBookingIntent(command(), 'renter-1', db, now)));
    expect(results[0]).toEqual(results[1]);
    expect((await db.doc('vehicleAvailability/car-1').get()).data()?.version).toBe(5);
    expect((await db.collection('auditEvents').get()).size).toBe(1);
  });

  it('rejects cross-renter cancellation with no effects', async () => {
    await expect(cancelUnpaidBookingIntent(command(), 'other-renter', db, now)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await assertUnchanged();
  });

  it('rejects signed-out callers and client financial input', async () => {
    await expect(cancelUnpaidBookingIntent(command(), '', db, now)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(cancelUnpaidBookingIntent({ ...command(), data: { intentId: 'hold-1', refundKobo: 100 } }, 'renter-1', db, now)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(cancelUnpaidBookingIntent(command('hold-1/nested/document'), 'renter-1', db, now)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await assertUnchanged();
  });

  it.each(['checkout_pending', 'paid', 'paid_conflict', 'failed', 'expired'])('rejects %s without releasing inventory', async (state) => {
    await db.doc('bookingIntents/hold-1').update({ state });
    await expect(cancelUnpaidBookingIntent(command(), 'renter-1', db, now)).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    expect((await db.doc('bookingBlocks/hold-1').get()).exists).toBe(true);
    expect((await db.collection('auditEvents').get()).empty).toBe(true);
  });

  it('rejects request-first intents and bound payments', async () => {
    await db.doc('bookingIntents/hold-1').update({ rentalRequestId: 'request-1' });
    await expect(cancelUnpaidBookingIntent(command(), 'renter-1', db, now)).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    await assertUnchanged();
  });

  it('rejects a payment binding even when the intent still incorrectly says unpaid', async () => {
    await db.doc('bookingIntents/hold-1').update({ paymentId: 'payment-1' });
    await expect(cancelUnpaidBookingIntent(command(), 'renter-1', db, now)).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    await assertUnchanged();
  });

  it('serializes cancellation against payment initialization', async () => {
    const initialize = db.runTransaction(async (transaction) => {
      const ref = db.doc('bookingIntents/hold-1');
      const intent = await transaction.get(ref);
      const block = await transaction.get(db.doc('bookingBlocks/hold-1'));
      if (intent.data()?.state !== 'intent_created' || !block.exists) return false;
      transaction.update(ref, { state: 'checkout_pending', paymentId: 'payment-race' });
      transaction.create(db.doc('payments/payment-race'), { intentId: 'hold-1', state: 'initialized' });
      return true;
    });
    const results = await Promise.allSettled([initialize, cancelUnpaidBookingIntent(command(), 'renter-1', db, now)]);
    const state = (await db.doc('bookingIntents/hold-1').get()).data()?.state;
    if (state === 'checkout_pending') {
      expect(results[0]).toMatchObject({ status: 'fulfilled', value: true });
      expect(results[1].status).toBe('rejected');
      expect((await db.doc('bookingBlocks/hold-1').get()).exists).toBe(true);
      expect((await db.collection('auditEvents').get()).empty).toBe(true);
    } else {
      expect(state).toBe('expired');
      expect(results[0]).toMatchObject({ status: 'fulfilled', value: false });
      expect(results[1].status).toBe('fulfilled');
      expect((await db.doc('bookingBlocks/hold-1').get()).exists).toBe(false);
      expect((await db.collection('payments').get()).empty).toBe(true);
    }
  }, 30_000);

  it('does not release a hold with orphaned payment activity', async () => {
    await db.doc('payments/payment-1').set({ intentId: 'hold-1', state: 'pending' });
    await expect(cancelUnpaidBookingIntent(command(), 'renter-1', db, now)).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });
    await assertUnchanged();
    expect((await db.doc('payments/payment-1').get()).data()?.state).toBe('pending');
  });

  it.each(['renterId', 'ownerId', 'vehicleId', 'startDate', 'endDate', 'intentId', 'state'])('fails closed on mismatched block %s', async (field) => {
    await db.doc('bookingBlocks/hold-1').update({ [field]: 'wrong' });
    await expect(cancelUnpaidBookingIntent(command(), 'renter-1', db, now)).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });
    await assertUnchanged();
  });

  it('fails closed on missing blocks', async () => {
    await db.doc('bookingBlocks/hold-1').delete();
    await expect(cancelUnpaidBookingIntent(command(), 'renter-1', db, now)).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });
    expect((await db.doc('bookingIntents/hold-1').get()).data()?.state).toBe('intent_created');
    expect((await db.collection('auditEvents').get()).empty).toBe(true);
  });

  it.each([undefined, -1, 1.5, '4'])('fails closed on invalid sentinel version %s', async (version) => {
    await db.doc('vehicleAvailability/car-1').set(version === undefined ? {} : { version });
    await expect(cancelUnpaidBookingIntent(command(), 'renter-1', db, now)).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });
    await assertUnchanged();
  });

  it('cannot reuse a cancellation key for another intent', async () => {
    await cancelUnpaidBookingIntent(command(), 'renter-1', db, now);
    await expect(cancelUnpaidBookingIntent(command('hold-2'), 'renter-1', db, now)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
});
