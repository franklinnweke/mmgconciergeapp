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
  setDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

describeWithEmulator('rental request Firestore privacy rules', () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'mmg-concierge-rental-request-rules',
      firestore: {
        rules: readFileSync(resolve(import.meta.dirname, 'firestore.rules'), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      await setDoc(doc(database, 'rentalRequests/request-one'), {
        requestId: 'request-one',
        renterId: 'renter-one',
        ownerId: 'owner-one',
        vehicleId: 'vehicle-one',
        state: 'requested',
      });
      await setDoc(doc(database, 'rentalRequests/request-two'), {
        requestId: 'request-two',
        renterId: 'renter-two',
        ownerId: 'owner-one',
        vehicleId: 'vehicle-one',
        state: 'approved',
      });
      await setDoc(doc(database, 'rentalRequestContacts/request-one'), {
        requestId: 'request-one',
        renterId: 'renter-one',
        contactPhone: '+2348012345678',
      });
    });
  });

  afterAll(async () => environment.cleanup());

  it('allows a renter to read and query only their own request documents', async () => {
    const renter = environment.authenticatedContext('renter-one').firestore();

    await assertSucceeds(getDoc(doc(renter, 'rentalRequests/request-one')));
    await assertSucceeds(getDocs(query(
      collection(renter, 'rentalRequests'),
      where('renterId', '==', 'renter-one'),
    )));

    await assertFails(getDoc(doc(renter, 'rentalRequests/request-two')));
    await assertFails(getDocs(collection(renter, 'rentalRequests')));
  });

  it('denies owners, other renters and anonymous users direct rental request access', async () => {
    const owner = environment.authenticatedContext('owner-one').firestore();
    const attacker = environment.authenticatedContext('renter-two').firestore();
    const anonymous = environment.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(owner, 'rentalRequests/request-one')));
    await assertFails(getDocs(query(
      collection(owner, 'rentalRequests'),
      where('ownerId', '==', 'owner-one'),
    )));
    await assertFails(getDoc(doc(attacker, 'rentalRequests/request-one')));
    await assertFails(getDoc(doc(anonymous, 'rentalRequests/request-one')));
  });

  it('denies direct contact PII access to renter, owner, privileged-looking client claims and anonymous users', async () => {
    const contexts = [
      environment.authenticatedContext('renter-one').firestore(),
      environment.authenticatedContext('owner-one').firestore(),
      environment.authenticatedContext('staff-one', { support: true }).firestore(),
      environment.authenticatedContext('super-one', { super_admin: true }).firestore(),
      environment.unauthenticatedContext().firestore(),
    ];

    for (const database of contexts) {
      await assertFails(getDoc(doc(database, 'rentalRequestContacts/request-one')));
      await assertFails(getDocs(collection(database, 'rentalRequestContacts')));
    }
  });

  it('denies all client writes to request state and contact PII', async () => {
    const renter = environment.authenticatedContext('renter-one').firestore();
    const owner = environment.authenticatedContext('owner-one').firestore();

    await assertFails(setDoc(doc(renter, 'rentalRequests/client-request'), {
      requestId: 'client-request', renterId: 'renter-one', ownerId: 'owner-one', state: 'confirmed',
    }));
    await assertFails(setDoc(doc(owner, 'rentalRequests/request-one'), {
      requestId: 'request-one', renterId: 'renter-one', ownerId: 'owner-one', state: 'approved',
    }));
    await assertFails(setDoc(doc(renter, 'rentalRequestContacts/request-one'), {
      requestId: 'request-one', renterId: 'renter-one', contactPhone: '+2348099999999',
    }));
  });
});
