import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

describeWithEmulator('Phase 0/1 Firestore rules', () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'mmg-concierge-rules-test',
      firestore: {
        rules: readFileSync(resolve(import.meta.dirname, 'firestore.rules'), 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await environment.cleanup();
  });

  it('denies unauthenticated reads and writes', async () => {
    const database = environment.unauthenticatedContext().firestore();
    const reference = doc(database, 'users/public-probe');

    await assertFails(getDoc(reference));
    await assertFails(setDoc(reference, { accountType: 'renter' }));
  });

  it('does not treat authentication as database authorization', async () => {
    const database = environment.authenticatedContext('renter-one').firestore();
    const ownReference = doc(database, 'users/renter-one');
    const otherReference = doc(database, 'users/renter-two');

    await assertFails(getDoc(ownReference));
    await assertFails(setDoc(ownReference, { accountType: 'renter' }));
    await assertFails(getDoc(otherReference));
  });
});
