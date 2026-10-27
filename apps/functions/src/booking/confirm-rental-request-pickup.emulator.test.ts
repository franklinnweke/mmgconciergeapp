import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { confirmRentalRequestPickup } from './confirm-rental-request-pickup.js';

const suite = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const actor = { uid: 'staff-one', role: 'support' };
const now = new Date('2026-10-25T10:00:00Z');
const pickupLocation = { displayName: 'Gate', formattedAddress: 'Customer gate, Ikoyi', latitude: 6.45, longitude: 3.43, serviceAreaLabel: 'Ikoyi', note: 'Side gate' };
const record = { requestId: 'request-one', state: 'approved', version: 2, startDate: '2026-10-26', endDate: '2026-10-28', serviceAreaLabel: 'Ikoyi', pickupLocation };
const command = (time = '09:30') => ({ schemaVersion: 1, idempotencyKey: 'confirm-pickup-time-one', data: { requestId: 'request-one', expectedVersion: 2, confirmedPickupTime: time } });

suite('pickup dispatch confirmation integrity', () => {
  let app: App; let db: Firestore;
  beforeAll(() => { app = initializeApp({ projectId: 'demo-mmg-pickup-dispatch' }, 'pickup-dispatch'); db = getFirestore(app); });
  afterAll(async () => { await db.terminate(); await deleteApp(app); });
  beforeEach(async () => {
    for (const name of ['rentalRequests', 'auditEvents', 'adminAuditLogs', 'idempotencyKeys', 'payments', 'bookingBlocks']) {
      const rows = await db.collection(name).get(); await Promise.all(rows.docs.map((row) => row.ref.delete()));
    }
    await db.doc('rentalRequests/request-one').set(record);
    await db.doc('payments/paid-one').set({ state: 'succeeded', amountKobo: 12345 });
    await db.doc('bookingBlocks/block-one').set({ state: 'paid', version: 1 });
  });
  it('confirms local pickup time with one domain/admin audit and no financial or inventory effects', async () => {
    expect(await confirmRentalRequestPickup(command(), actor, db, now)).toEqual({ state: 'approved', version: 3 });
    expect((await db.doc('rentalRequests/request-one').get()).data()).toMatchObject({ ...record, version: 3, confirmedPickupTime: '09:30' });
    expect((await db.collection('auditEvents').get()).size).toBe(1);
    expect((await db.collection('adminAuditLogs').get()).size).toBe(1);
    expect((await db.doc('payments/paid-one').get()).data()).toEqual({ state: 'succeeded', amountKobo: 12345 });
    expect((await db.doc('bookingBlocks/block-one').get()).data()).toEqual({ state: 'paid', version: 1 });
  });
  it('replays concurrent retries without duplicate audits', async () => {
    const results = await Promise.all([1, 2].map(() => confirmRentalRequestPickup(command(), actor, db, now)));
    expect(results[0]).toEqual(results[1]); expect((await db.collection('auditEvents').get()).size).toBe(1);
    expect((await db.collection('adminAuditLogs').get()).size).toBe(1);
  });
  it.each(['finance_admin', 'vehicle_admin', 'verification_admin', 'privacy_admin', 'owner'])('denies %s without mutation', async (role) => {
    await expect(confirmRentalRequestPickup(command(), { ...actor, role }, db, now)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await db.doc('rentalRequests/request-one').get()).data()).toEqual(record);
  });
  it.each(['requested', 'cancelled_by_renter', 'declined', 'needs_attention'])('does not confirm pickup for %s', async (state) => {
    await db.doc('rentalRequests/request-one').update({ state });
    await expect(confirmRentalRequestPickup(command(), actor, db, now)).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    expect((await db.collection('auditEvents').get()).empty).toBe(true);
  });
  it('rejects stale versions and unsafe client fields', async () => {
    await expect(confirmRentalRequestPickup({ ...command(), data: { ...command().data, expectedVersion: 1 } }, actor, db, now)).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    await expect(confirmRentalRequestPickup({ ...command(), data: { ...command().data, amountKobo: 0 } }, actor, db, now)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect((await db.collection('auditEvents').get()).empty).toBe(true);
  });
  it('fails closed for a missing pickup and invalid local time', async () => {
    await expect(confirmRentalRequestPickup(command('25:00'), actor, db, now)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await db.doc('rentalRequests/request-one').set({ ...record, pickupLocation: null });
    await expect(confirmRentalRequestPickup(command(), actor, db, now)).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });
  });
  it('rejects an already elapsed same-day pickup in Lagos time', async () => {
    await db.doc('rentalRequests/request-one').update({ startDate: '2026-10-25' });
    await expect(confirmRentalRequestPickup(command('10:30'), actor, db, now)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});
