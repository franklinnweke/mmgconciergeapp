import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestoreRenterRepository } from './firestore-renter-repository.js';
import { requestAccountDeletionService } from './request-account-deletion-service.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

async function clearCollection(database: Firestore, name: string) {
  const documents = await database.collection(name).listDocuments();
  await Promise.all(documents.map((document) => document.delete()));
}

async function clearDatabase(database: Firestore) {
  for (const name of [
    'auditEvents',
    'idempotencyKeys',
    'rentalRequestContacts',
    'rentalRequests',
    'renterProfiles',
    'bookings',
  ]) {
    await clearCollection(database, name);
  }
}

describeWithEmulator('requestAccountDeletionService on Firestore Emulator', () => {
  let firestore: Firestore;
  let repository: FirestoreRenterRepository;

  beforeAll(() => {
    const app = getApps()[0] ?? initializeApp({ projectId: 'mmg-concierge-dev' });
    firestore = getFirestore(app);
    repository = new FirestoreRenterRepository(firestore);
  });

  beforeEach(async () => {
    await clearDatabase(firestore);
  });

  afterAll(async () => {
    await clearDatabase(firestore);
  });

  it('runs transaction without read-after-write errors and selectively deletes only createRentalRequest idempotency keys', async () => {
    const renterId = 'renter-em-1';
    const now = new Date();

    // 1. Create active profile
    await firestore.collection('renterProfiles').doc(renterId).set({
      renterId,
      fullName: 'Babatunde Adeleke',
      email: 'babatunde@example.com',
      phone: '+2348012345678',
      defaultDeliveryAddress: {
        streetAddress: '15 Queens Drive',
        areaLabel: 'Ikoyi',
      },
      acceptedRenterTermsVersion: '2026-03-01',
      acceptedPrivacyNoticeVersion: '2026-03-01',
      accountStatus: 'active',
      deletionReason: null,
      deletionRequestedAt: null,
      profileVersion: 1,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    // 2. Add completed/declined rental request with contact and location PII
    const requestId = 'req-closed-1';
    await firestore.collection('rentalRequests').doc(requestId).set({
      requestId,
      renterId,
      state: 'declined',
      pickupLocation: {
        displayName: 'Eko Hotel',
        formattedAddress: 'Adetokunbo Ademola St, VI',
        latitude: 6.4269,
        longitude: 3.4285,
        serviceAreaLabel: 'Victoria Island',
      },
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    await firestore.collection('rentalRequestContacts').doc(requestId).set({
      requestId,
      renterId,
      contactPhone: '+2348012345678',
      pickupLocation: {
        displayName: 'Eko Hotel',
        formattedAddress: 'Adetokunbo Ademola St, VI',
        latitude: 6.4269,
        longitude: 3.4285,
        serviceAreaLabel: 'Victoria Island',
      },
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    // 3. Add multiple idempotency keys for the renter
    // A: createRentalRequest (contains location PII) -> SHOULD be purged
    await firestore.collection('idempotencyKeys').doc('idemp-req-1').set({
      actorId: renterId,
      commandName: 'createRentalRequest',
      requestHash: 'hash-req-1',
      result: { requestId, pickupLocation: { displayName: 'Eko Hotel' } },
      createdAt: Timestamp.fromDate(now),
    });

    // B: cancelUnpaidRentalRequest (auditable command) -> MUST NOT be purged
    await firestore.collection('idempotencyKeys').doc('idemp-cancel-1').set({
      actorId: renterId,
      commandName: 'cancelUnpaidRentalRequest',
      requestHash: 'hash-cancel-1',
      result: { requestId, state: 'cancelled_by_renter' },
      createdAt: Timestamp.fromDate(now),
    });

    // C: initializeRequestFirstPayment (financial/audit command) -> MUST NOT be purged
    await firestore.collection('idempotencyKeys').doc('idemp-pay-1').set({
      actorId: renterId,
      commandName: 'initializeRequestFirstPayment',
      requestHash: 'hash-pay-1',
      result: { reference: 'pay_ref_123' },
      createdAt: Timestamp.fromDate(now),
    });

    // Execute deletion service
    const actor = { uid: renterId, email: 'babatunde@example.com' };
    const result = await requestAccountDeletionService(
      {
        schemaVersion: 1,
        idempotencyKey: 'idemp-del-req-0001',
        data: {
          confirmation: true,
          reason: 'Leaving Lagos permanently',
        },
      },
      actor,
      repository,
    );

    expect(result.result.accountStatus).toBe('deletion_requested');

    // Verify profile state
    const profileSnap = await firestore.collection('renterProfiles').doc(renterId).get();
    expect(profileSnap.data()?.accountStatus).toBe('deletion_requested');
    expect(profileSnap.data()?.deletionReason).toBe('Leaving Lagos permanently');

    // Verify rentalRequestContacts doc was deleted
    const contactSnap = await firestore.collection('rentalRequestContacts').doc(requestId).get();
    expect(contactSnap.exists).toBe(false);

    // Verify pickupLocation was redacted from rentalRequests doc
    const requestSnap = await firestore.collection('rentalRequests').doc(requestId).get();
    expect(requestSnap.exists).toBe(true);
    expect(requestSnap.data()?.pickupLocation).toBeUndefined();

    // Verify createRentalRequest idempotency was deleted
    const idempReqSnap = await firestore.collection('idempotencyKeys').doc('idemp-req-1').get();
    expect(idempReqSnap.exists).toBe(false);

    // Verify cancel and payment idempotency keys remain intact!
    const idempCancelSnap = await firestore.collection('idempotencyKeys').doc('idemp-cancel-1').get();
    expect(idempCancelSnap.exists).toBe(true);
    const idempPaySnap = await firestore.collection('idempotencyKeys').doc('idemp-pay-1').get();
    expect(idempPaySnap.exists).toBe(true);

    // Verify audit event
    const auditSnap = await firestore.collection('auditEvents').where('actorId', '==', renterId).get();
    expect(auditSnap.empty).toBe(false);
    const auditData = auditSnap.docs[0]?.data();
    expect(auditData?.details).toMatchObject({
      deletedRentalRequestContactCount: 1,
      redactedRentalRequestLocationCount: 1,
      deletedIdempotencyKeyCount: 1,
    });
  });
});
