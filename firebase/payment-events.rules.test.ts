import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

describeWithEmulator('paymentEvents Firestore rules', () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'mmg-concierge-payment-events-rules',
      firestore: {
        rules: readFileSync(resolve(import.meta.dirname, 'firestore.rules'), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'paymentEvents/event-one'), {
        eventId: 'event-one',
        source: 'webhook',
        eventType: 'charge.success',
        reference: 'mmg-abc123',
        status: 'verified_success',
      });
    });
  });

  afterAll(async () => environment.cleanup());

  it('denies renter, staff-client, and anonymous reads and lists', async () => {
    const renter = environment.authenticatedContext('renter-one').firestore();
    const staff = environment.authenticatedContext('staff-one', { super_admin: true }).firestore();
    const anonymous = environment.unauthenticatedContext().firestore();

    for (const database of [renter, staff, anonymous]) {
      await assertFails(getDoc(doc(database, 'paymentEvents/event-one')));
      await assertFails(getDocs(collection(database, 'paymentEvents')));
    }
  });

  it('denies every client write even when a user spoofs server fields', async () => {
    const renter = environment.authenticatedContext('renter-one').firestore();
    await assertFails(setDoc(doc(renter, 'paymentEvents/client-event'), {
      eventId: 'client-event',
      source: 'webhook',
      eventType: 'charge.success',
      reference: 'mmg-attacker',
      status: 'verified_success',
      paymentId: 'payment-attacker',
      intentId: 'intent-attacker',
    }));
  });
});
