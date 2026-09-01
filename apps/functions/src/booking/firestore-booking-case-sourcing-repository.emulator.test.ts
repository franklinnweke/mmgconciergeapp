import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startBookingCaseSourcing } from './booking-case-sourcing-service.js';
import { FirestoreBookingCaseSourcingRepository } from './firestore-booking-case-sourcing-repository.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

async function clearCollections(database: Firestore) {
  for (const name of [
    'adminAuditLogs',
    'auditEvents',
    'bookingCases',
    'idempotencyKeys',
    'payments',
    'refunds',
  ]) {
    const documents = await database.collection(name).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

async function seedCase(
  database: Firestore,
  overrides: Record<string, unknown> = {},
) {
  const createdAt = Timestamp.fromDate(new Date('2026-09-01T12:30:00.000Z'));
  await database.doc('bookingCases/case-r5-ops').set({
    caseId: 'case-r5-ops',
    bookingId: 'booking-r5-ops',
    ownerId: 'owner-r5-ops',
    renterId: 'renter-r5-ops',
    vehicleId: 'vehicle-r5-ops',
    type: 'owner_rejection',
    status: 'open',
    version: 1,
    ownerReason: 'The assigned chauffeur is no longer available.',
    openedAt: createdAt,
    openedBy: 'owner-r5-ops',
    ...overrides,
  });
}

const command = {
  schemaVersion: 1 as const,
  idempotencyKey: 'r5-case-sourcing-0001',
  data: { caseId: 'case-r5-ops', expectedVersion: 1 },
};
const support = { uid: 'support-r5', role: 'support' as const };

describeWithEmulator('Firestore R5 booking case sourcing', () => {
  let database: Firestore;
  let repository: FirestoreBookingCaseSourcingRepository;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'payment-r5-case-sourcing-emulator') ??
      initializeApp({ projectId: 'mmg-concierge' }, 'payment-r5-case-sourcing-emulator');
    database = getFirestore(app);
    repository = new FirestoreBookingCaseSourcingRepository(database);
  });

  beforeEach(async () => {
    await clearCollections(database);
    await seedCase(database);
  });

  afterAll(async () => {
    if (database) await clearCollections(database);
  });

  it('atomically marks an open intervention case as sourcing and writes domain/admin audit evidence', async () => {
    const result = await startBookingCaseSourcing(command, support, {
      repository,
      now: () => new Date('2026-09-01T13:00:00.000Z'),
      createRequestId: () => 'request-r5-sourcing',
    });

    expect(result.result).toMatchObject({
      fromStatus: 'open',
      toStatus: 'sourcing_alternative',
      version: 2,
    });
    expect((await database.doc('bookingCases/case-r5-ops').get()).data()).toMatchObject({
      status: 'sourcing_alternative',
      version: 2,
      lastAction: 'start_sourcing_alternative',
      lastActionBy: 'support-r5',
      lastActionRole: 'support',
    });
    expect((await database.collection('auditEvents').get()).docs[0]?.data()).toMatchObject({
      eventType: 'booking.case_sourcing_started',
      actorId: 'support-r5',
      actorRole: 'support',
      fromState: 'open',
      toState: 'sourcing_alternative',
    });
    expect((await database.collection('adminAuditLogs').get()).docs[0]?.data()).toMatchObject({
      action: 'booking_case.start_sourcing',
      role: 'support',
      targetId: 'case-r5-ops',
    });
  });

  it('supports a paid_conflict case without creating any financial record', async () => {
    await database.doc('bookingCases/case-r5-ops').update({
      type: 'paid_conflict',
      paymentId: 'payment-r5-conflict',
      intentId: 'intent-r5-conflict',
    });

    await startBookingCaseSourcing(command, support, {
      repository,
      now: () => new Date('2026-09-01T13:00:00.000Z'),
    });

    expect((await database.doc('bookingCases/case-r5-ops').get()).data()?.status)
      .toBe('sourcing_alternative');
    expect((await database.collection('refunds').get()).size).toBe(0);
    expect((await database.collection('payments').get()).size).toBe(0);
  });

  it('is idempotent and creates one pair of audit effects', async () => {
    const first = await startBookingCaseSourcing(command, support, {
      repository,
      createRequestId: () => 'request-first',
    });
    const replay = await startBookingCaseSourcing(command, support, {
      repository,
      createRequestId: () => 'request-replay',
    });

    expect(replay).toEqual(first);
    expect((await database.collection('auditEvents').get()).size).toBe(1);
    expect((await database.collection('adminAuditLogs').get()).size).toBe(1);
  });

  it('fails stale and already-progressed cases with zero audit mutation', async () => {
    await expect(startBookingCaseSourcing({
      ...command,
      data: { caseId: 'case-r5-ops', expectedVersion: 2 },
    }, support, { repository })).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });
    expect((await database.collection('auditEvents').get()).size).toBe(0);

    await database.doc('bookingCases/case-r5-ops').update({
      status: 'refund_pending',
      version: 2,
    });
    await expect(startBookingCaseSourcing({
      ...command,
      idempotencyKey: 'r5-case-sourcing-progressed',
      data: { caseId: 'case-r5-ops', expectedVersion: 2 },
    }, support, { repository })).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    expect((await database.collection('adminAuditLogs').get()).size).toBe(0);
  });
});
