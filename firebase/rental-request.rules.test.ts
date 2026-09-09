import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

describeWithEmulator('request-first rental Firestore rules', () => {
  let environment: RulesTestEnvironment;
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'mmg-concierge',
      firestore: { rules: readFileSync(resolve(import.meta.dirname, 'firestore.rules'), 'utf8') },
    });
  });
  beforeEach(async () => environment.clearFirestore());
  afterAll(async () => environment.cleanup());

  async function seed() {
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      await setDoc(doc(database, 'rentalRequests/request-one'), {
        requestId: 'request-one', renterId: 'renter-one', ownerId: 'owner-one', vehicleId: 'vehicle-one',
        state: 'requested', serviceAreaLabel: 'Ikoyi', startDate: '2026-09-15', endDate: '2026-09-18',
        version: 1, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      });
      await setDoc(doc(database, 'rentalRequestContacts/request-one'), {
        requestId: 'request-one', renterId: 'renter-one', contactPhone: '+2348012345678',
      });
    });
  }

  it('allows only the assigned renter and owner to read the safe request projection', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(environment.authenticatedContext('renter-one').firestore(), 'rentalRequests/request-one')));
    await assertSucceeds(getDoc(doc(environment.authenticatedContext('owner-one').firestore(), 'rentalRequests/request-one')));
    await assertFails(getDoc(doc(environment.authenticatedContext('other-user').firestore(), 'rentalRequests/request-one')));
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'rentalRequests/request-one')));
  });

  it('denies all client writes to trusted rental requests', async () => {
    await seed();
    const renter = environment.authenticatedContext('renter-one').firestore();
    await assertFails(setDoc(doc(renter, 'rentalRequests/request-two'), { renterId: 'renter-one', ownerId: 'owner-one' }));
  });

  it('keeps request contact data private from renter, owner, and unrelated users', async () => {
    await seed();
    for (const uid of ['renter-one', 'owner-one', 'other-user']) {
      await assertFails(getDoc(doc(environment.authenticatedContext(uid).firestore(), 'rentalRequestContacts/request-one')));
    }
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'rentalRequestContacts/request-one')));
  });
});
