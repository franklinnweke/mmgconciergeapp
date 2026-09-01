import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestoreOwnerResponseSlaRepository } from './firestore-owner-response-sla-repository.js';
import { emitOwnerResponseSlaSignals } from './owner-response-sla-service.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

async function clearCollections(database: Firestore) {
  for (const name of ['auditEvents', 'bookings', 'notificationOutbox', 'systemConfig']) {
    const documents = await database.collection(name).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

async function seedPaidPendingOwner(database: Firestore) {
  await database.doc('bookings/booking-sla-001').set({
    bookingId: 'booking-sla-001',
    intentId: 'intent-sla-001',
    renterId: 'renter-sla-001',
    ownerId: 'owner-sla-001',
    vehicleId: 'vehicle-sla-001',
    startDate: '2026-09-10',
    endDate: '2026-09-13',
    state: 'paid_pending_owner',
    version: 1,
    blockId: 'intent-sla-001',
    createdAt: Timestamp.fromDate(new Date('2026-09-01T11:00:00.000Z')),
    updatedAt: Timestamp.fromDate(new Date('2026-09-01T11:00:00.000Z')),
  });
}

describeWithEmulator('Firestore R5 owner response SLA operations signaling', () => {
  let database: Firestore;
  let repository: FirestoreOwnerResponseSlaRepository;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'payment-r5-sla-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'payment-r5-sla-emulator');
    database = getFirestore(app);
    repository = new FirestoreOwnerResponseSlaRepository(database);
  });

  beforeEach(async () => {
    await clearCollections(database);
    await seedPaidPendingOwner(database);
  });

  afterAll(async () => {
    if (database) await clearCollections(database);
  });

  it('creates one durable operations signal at the default 30-minute SLA without changing booking state', async () => {
    const result = await emitOwnerResponseSlaSignals({
      repository,
      now: () => new Date('2026-09-01T11:30:00.000Z'),
    });

    expect(result).toEqual({ slaMinutes: 30, scanned: 1, alerted: 1 });
    expect((await database.doc('bookings/booking-sla-001').get()).data()).toMatchObject({
      state: 'paid_pending_owner',
      version: 1,
      ownerResponseSlaMinutes: 30,
    });
    expect((await database.doc('notificationOutbox/owner-response-sla-booking-sla-001').get()).data()).toMatchObject({
      eventType: 'booking.owner_response_sla_exceeded',
      audience: 'operations',
      bookingId: 'booking-sla-001',
      status: 'unavailable',
    });
    expect((await database.collection('auditEvents').get()).size).toBe(1);
  });

  it('is idempotent and does not duplicate outbox or audit signals', async () => {
    const now = () => new Date('2026-09-01T11:31:00.000Z');
    await emitOwnerResponseSlaSignals({ repository, now });
    const replay = await emitOwnerResponseSlaSignals({ repository, now });

    expect(replay.alerted).toBe(0);
    expect((await database.collection('notificationOutbox').get()).size).toBe(1);
    expect((await database.collection('auditEvents').get()).size).toBe(1);
    expect((await database.doc('bookings/booking-sla-001').get()).data()?.state).toBe('paid_pending_owner');
  });

  it('respects configured SLA minutes from private system configuration', async () => {
    await database.doc('systemConfig/private').set({ ownerResponseSlaMinutes: 45 });

    const before = await emitOwnerResponseSlaSignals({
      repository,
      now: () => new Date('2026-09-01T11:44:59.000Z'),
    });
    expect(before.alerted).toBe(0);

    const after = await emitOwnerResponseSlaSignals({
      repository,
      now: () => new Date('2026-09-01T11:45:00.000Z'),
    });
    expect(after.alerted).toBe(1);
    expect((await database.doc('bookings/booking-sla-001').get()).data()?.ownerResponseSlaMinutes).toBe(45);
  });

  it('does not alert or mutate a booking that was confirmed before the transactional recheck', async () => {
    await database.doc('bookings/booking-sla-001').update({ state: 'confirmed', version: 2 });

    const result = await repository.recordExceededSla({
      bookingId: 'booking-sla-001',
      cutoff: new Date('2026-09-01T11:00:00.000Z'),
      slaMinutes: 30,
      now: new Date('2026-09-01T11:30:00.000Z'),
    });

    expect(result).toBe('noop');
    expect((await database.doc('bookings/booking-sla-001').get()).data()).toMatchObject({
      state: 'confirmed',
      version: 2,
    });
    expect((await database.collection('notificationOutbox').get()).size).toBe(0);
    expect((await database.collection('auditEvents').get()).size).toBe(0);
  });
});
