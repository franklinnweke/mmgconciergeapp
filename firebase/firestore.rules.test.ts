import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  deleteDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

function validBookingRequest(userId: string) {
  const pickupAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
  const returnAt = Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000);

  return {
    createdAt: serverTimestamp(),
    dailyRateKobo: 38_500_000,
    durationDays: 2,
    pickupAt,
    returnAt,
    status: 'availability_requested',
    totalKobo: 83_160_000,
    updatedAt: serverTimestamp(),
    userId,
    vehicleId: 'preview-pearl-suv',
  };
}

describeWithEmulator('booking request Firestore rules', () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'mmg-concierge',
      firestore: {
        rules: readFileSync(resolve(import.meta.dirname, 'firestore.rules'), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
  });

  afterAll(async () => {
    await environment.cleanup();
  });

  it('allows an authenticated renter to create, read, and list an owned request', async () => {
    const database = environment.authenticatedContext('renter-one').firestore();
    const reference = doc(database, 'users/renter-one/bookingRequests/request-one');

    await assertSucceeds(setDoc(reference, validBookingRequest('renter-one')));
    await assertSucceeds(getDoc(reference));
    await assertSucceeds(getDocs(collection(database, 'users/renter-one/bookingRequests')));
  });

  it('denies public reads, lists, and creates', async () => {
    const database = environment.unauthenticatedContext().firestore();
    const reference = doc(database, 'users/renter-one/bookingRequests/request-one');

    await assertFails(getDoc(reference));
    await assertFails(getDocs(collection(database, 'users/renter-one/bookingRequests')));
    await assertFails(setDoc(reference, validBookingRequest('renter-one')));
  });

  it('isolates each renter collection and rejects ownership spoofing', async () => {
    const ownerDatabase = environment.authenticatedContext('renter-one').firestore();
    const attackerDatabase = environment.authenticatedContext('renter-two').firestore();
    const reference = doc(ownerDatabase, 'users/renter-one/bookingRequests/request-one');

    await assertSucceeds(setDoc(reference, validBookingRequest('renter-one')));
    await assertFails(getDoc(doc(attackerDatabase, reference.path)));
    await assertFails(
      getDocs(collection(attackerDatabase, 'users/renter-one/bookingRequests')),
    );
    await assertFails(
      setDoc(
        doc(attackerDatabase, 'users/renter-two/bookingRequests/spoofed'),
        validBookingRequest('renter-one'),
      ),
    );
  });

  it('rejects schema pollution, oversized strings, and missing required fields', async () => {
    const database = environment.authenticatedContext('renter-one').firestore();
    const basePath = 'users/renter-one/bookingRequests';

    await assertFails(
      setDoc(doc(database, basePath, 'polluted'), {
        ...validBookingRequest('renter-one'),
        isAdmin: true,
      }),
    );
    await assertFails(
      setDoc(doc(database, basePath, 'oversized'), {
        ...validBookingRequest('renter-one'),
        vehicleId: 'v'.repeat(129),
      }),
    );
    const { returnAt: _omitted, ...missingReturn } = validBookingRequest('renter-one');
    await assertFails(setDoc(doc(database, basePath, 'missing'), missingReturn));
  });

  it('rejects invalid types, ranges, timestamps, and initial statuses', async () => {
    const database = environment.authenticatedContext('renter-one').firestore();
    const basePath = 'users/renter-one/bookingRequests';

    await assertFails(
      setDoc(doc(database, basePath, 'type-juggle'), {
        ...validBookingRequest('renter-one'),
        durationDays: '2',
      }),
    );
    await assertFails(
      setDoc(doc(database, basePath, 'negative'), {
        ...validBookingRequest('renter-one'),
        totalKobo: -1,
      }),
    );
    await assertFails(
      setDoc(doc(database, basePath, 'overflow'), {
        ...validBookingRequest('renter-one'),
        dailyRateKobo: 1_000_000_001,
      }),
    );
    await assertFails(
      setDoc(doc(database, basePath, 'past-pickup'), {
        ...validBookingRequest('renter-one'),
        pickupAt: Timestamp.fromMillis(Date.now() - 60_000),
      }),
    );
    await assertFails(
      setDoc(doc(database, basePath, 'timestamp-manipulation'), {
        ...validBookingRequest('renter-one'),
        createdAt: Timestamp.fromMillis(Date.now() - 60_000),
      }),
    );
    await assertFails(
      setDoc(doc(database, basePath, 'status-escalation'), {
        ...validBookingRequest('renter-one'),
        status: 'booked',
      }),
    );
  });

  it('denies all client updates and deletes, including status escalation', async () => {
    const database = environment.authenticatedContext('renter-one').firestore();
    const reference = doc(database, 'users/renter-one/bookingRequests/request-one');
    await assertSucceeds(setDoc(reference, validBookingRequest('renter-one')));

    await assertFails(updateDoc(reference, { status: 'confirmed' }));
    await assertFails(updateDoc(reference, { vehicleId: 'tampered', extraData: 'x'.repeat(1000) }));
    await assertFails(deleteDoc(reference));
  });

  it('keeps unrelated user documents denied', async () => {
    const database = environment.authenticatedContext('renter-one').firestore();
    const profile = doc(database, 'users/renter-one');

    await assertFails(getDoc(profile));
    await assertFails(setDoc(profile, { role: 'admin' }));
  });

  it('allows renters to read only their server-created intents and bookings', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const adminDatabase = context.firestore();
      await setDoc(doc(adminDatabase, 'bookingIntents/intent-one'), {
        renterId: 'renter-one',
        state: 'intent_created',
        renterTotalKobo: 83_160_000,
      });
      await setDoc(doc(adminDatabase, 'bookings/booking-one'), {
        renterId: 'renter-one',
        state: 'paid_pending_owner',
        paymentReference: 'server-only-reference',
      });
    });

    const ownerDatabase = environment.authenticatedContext('renter-one').firestore();
    const attackerDatabase = environment.authenticatedContext('renter-two').firestore();
    const publicDatabase = environment.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(ownerDatabase, 'bookingIntents/intent-one')));
    await assertSucceeds(getDoc(doc(ownerDatabase, 'bookings/booking-one')));
    await assertSucceeds(getDocs(query(
      collection(ownerDatabase, 'bookingIntents'),
      where('renterId', '==', 'renter-one'),
    )));
    await assertSucceeds(getDocs(query(
      collection(ownerDatabase, 'bookings'),
      where('renterId', '==', 'renter-one'),
    )));
    await assertFails(getDocs(collection(ownerDatabase, 'bookingIntents')));
    await assertFails(getDocs(query(
      collection(attackerDatabase, 'bookings'),
      where('renterId', '==', 'renter-one'),
    )));
    await assertFails(getDoc(doc(attackerDatabase, 'bookingIntents/intent-one')));
    await assertFails(getDoc(doc(attackerDatabase, 'bookings/booking-one')));
    await assertFails(getDoc(doc(publicDatabase, 'bookingIntents/intent-one')));
  });

  it('denies all client writes to server-owned booking collections', async () => {
    const database = environment.authenticatedContext('renter-one').firestore();
    const paths = [
      'bookingIntents/client-intent',
      'bookings/client-booking',
      'bookingBlocks/client-block',
      'vehicleAvailability/vehicle-one',
      'payments/client-payment',
      'auditEvents/client-audit',
      'idempotencyKeys/client-key',
      'systemConfig/booking',
    ];

    for (const path of paths) {
      await assertFails(setDoc(doc(database, path), {
        renterId: 'renter-one',
        state: 'confirmed',
        totalKobo: 1,
        isAdmin: true,
      }));
    }
  });

  it('denies update and delete attempts against server-created records', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'bookingIntents/intent-one'), {
        renterId: 'renter-one',
        state: 'intent_created',
        renterTotalKobo: 83_160_000,
      });
    });
    const database = environment.authenticatedContext('renter-one').firestore();
    const reference = doc(database, 'bookingIntents/intent-one');
    await assertFails(updateDoc(reference, { state: 'paid', renterTotalKobo: 1 }));
    await assertFails(deleteDoc(reference));
  });
});
