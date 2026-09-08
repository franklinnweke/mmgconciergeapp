import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const describeWithEmulator = process.env.STORAGE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST
  ? describe
  : describe.skip;

describeWithEmulator('renter profile-photo Storage rules', () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'mmg-concierge-dev',
      firestore: {
        rules: readFileSync(resolve(import.meta.dirname, 'firestore.rules'), 'utf8'),
      },
      storage: {
        rules: readFileSync(resolve(import.meta.dirname, 'storage.rules'), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.clearStorage();
  });

  afterAll(async () => {
    await environment.cleanup();
  });

  async function seedAccount(uid: string) {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `users/${uid}`), {
        uid,
        accountType: 'renter',
        displayName: 'Demo Renter',
        email: `${uid}@example.com`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  }

  const metadata = (uid: string, contentType = 'image/jpeg') => ({
    contentType,
    customMetadata: {
      purpose: 'profile_photo',
      renterId: uid,
    },
  });

  it('allows a registered renter to create, replace, read and delete their own avatar', async () => {
    await seedAccount('renter-one');
    const storage = environment.authenticatedContext('renter-one').storage();
    const avatar = ref(storage, 'private/renter-profile/renter-one/avatar');

    await assertSucceeds(uploadBytes(avatar, Buffer.from('first-avatar'), metadata('renter-one')));
    await assertSucceeds(getBytes(avatar));
    await assertSucceeds(uploadBytes(avatar, Buffer.from('replacement-avatar'), metadata('renter-one')));
    await assertSucceeds(deleteObject(avatar));
  });

  it('denies anonymous users and other authenticated users from reading or writing an avatar', async () => {
    await seedAccount('renter-one');
    await seedAccount('renter-two');

    const ownerStorage = environment.authenticatedContext('renter-one').storage();
    const ownerAvatar = ref(ownerStorage, 'private/renter-profile/renter-one/avatar');
    await assertSucceeds(uploadBytes(ownerAvatar, Buffer.from('avatar'), metadata('renter-one')));

    const otherStorage = environment.authenticatedContext('renter-two').storage();
    await assertFails(getBytes(ref(otherStorage, 'private/renter-profile/renter-one/avatar')));
    await assertFails(uploadBytes(
      ref(otherStorage, 'private/renter-profile/renter-one/avatar'),
      Buffer.from('tamper'),
      metadata('renter-two'),
    ));

    const anonymousStorage = environment.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(anonymousStorage, 'private/renter-profile/renter-one/avatar')));
  });

  it('denies profile-photo writes without a registered account or with invalid metadata/type', async () => {
    const unregistered = environment.authenticatedContext('missing-user').storage();
    await assertFails(uploadBytes(
      ref(unregistered, 'private/renter-profile/missing-user/avatar'),
      Buffer.from('avatar'),
      metadata('missing-user'),
    ));

    await seedAccount('renter-one');
    const storage = environment.authenticatedContext('renter-one').storage();
    const avatar = ref(storage, 'private/renter-profile/renter-one/avatar');

    await assertFails(uploadBytes(avatar, Buffer.from('script'), metadata('renter-one', 'image/svg+xml')));
    await assertFails(uploadBytes(avatar, Buffer.from('wrong-metadata'), {
      contentType: 'image/jpeg',
      customMetadata: { purpose: 'government_id', renterId: 'renter-one' },
    }));
  });

  it('denies profile photos larger than 5 MiB', async () => {
    await seedAccount('renter-one');
    const storage = environment.authenticatedContext('renter-one').storage();
    await assertFails(uploadBytes(
      ref(storage, 'private/renter-profile/renter-one/avatar'),
      Buffer.alloc(5 * 1024 * 1024 + 1),
      metadata('renter-one'),
    ));
  });
});
