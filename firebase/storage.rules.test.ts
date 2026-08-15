import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  deleteObject,
  getBytes,
  ref,
  updateMetadata,
  uploadBytes,
} from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const describeWithEmulator = process.env.STORAGE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST
  ? describe
  : describe.skip;

describeWithEmulator('private owner-verification Storage rules', () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'mmg-concierge',
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

  async function seedUserAccount(uid: string, accountType: 'owner' | 'renter') {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `users/${uid}`), {
        uid,
        accountType,
        displayName: 'Test User',
        email: `${uid}@example.com`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  }

  it('S1: denies anonymous client create and read on all storage paths', async () => {
    const unauthStorage = environment.unauthenticatedContext().storage();
    const targetRef = ref(unauthStorage, 'private/owner-verification/owner-one/upload-01');

    await assertFails(uploadBytes(
      targetRef,
      Buffer.from('sample-bytes'),
      {
        contentType: 'image/jpeg',
        customMetadata: { purpose: 'government_id', ownerId: 'owner-one' },
      },
    ));
    await assertFails(getBytes(targetRef));
  });

  it('S2: allows owner with accountType == owner to create a valid private verification upload', async () => {
    await seedUserAccount('owner-one', 'owner');
    const ownerStorage = environment.authenticatedContext('owner-one').storage();
    const targetRef = ref(ownerStorage, 'private/owner-verification/owner-one/upload-01');

    await assertSucceeds(uploadBytes(
      targetRef,
      Buffer.from('valid-jpeg-bytes'),
      {
        contentType: 'image/jpeg',
        customMetadata: { purpose: 'government_id', ownerId: 'owner-one' },
      },
    ));
  });

  it('S2b: denies upload if users/{uid} document is missing in Firestore', async () => {
    // Unseeded user (no users/unseeded-owner doc in Firestore)
    const ownerStorage = environment.authenticatedContext('unseeded-owner').storage();
    const targetRef = ref(ownerStorage, 'private/owner-verification/unseeded-owner/upload-01');

    await assertFails(uploadBytes(
      targetRef,
      Buffer.from('valid-jpeg-bytes'),
      {
        contentType: 'image/jpeg',
        customMetadata: { purpose: 'government_id', ownerId: 'unseeded-owner' },
      },
    ));
  });

  it('S3: denies owner creating an upload under another owner prefix', async () => {
    await seedUserAccount('owner-one', 'owner');
    const ownerStorage = environment.authenticatedContext('owner-one').storage();
    const targetRef = ref(ownerStorage, 'private/owner-verification/owner-two/upload-01');

    await assertFails(uploadBytes(
      targetRef,
      Buffer.from('valid-jpeg-bytes'),
      {
        contentType: 'image/jpeg',
        customMetadata: { purpose: 'government_id', ownerId: 'owner-two' },
      },
    ));
  });

  it('S4: denies owner uploading to public or non-private prefixes', async () => {
    await seedUserAccount('owner-one', 'owner');
    const ownerStorage = environment.authenticatedContext('owner-one').storage();
    const publicRef = ref(ownerStorage, 'public/owner-verification/owner-one/upload-01');

    await assertFails(uploadBytes(
      publicRef,
      Buffer.from('valid-jpeg-bytes'),
      {
        contentType: 'image/jpeg',
        customMetadata: { purpose: 'government_id', ownerId: 'owner-one' },
      },
    ));
  });

  it('S5: denies upload with forbidden MIME types', async () => {
    await seedUserAccount('owner-one', 'owner');
    const ownerStorage = environment.authenticatedContext('owner-one').storage();
    const targetRef = ref(ownerStorage, 'private/owner-verification/owner-one/upload-01');

    await assertFails(uploadBytes(
      targetRef,
      Buffer.from('script-bytes'),
      {
        contentType: 'application/x-sh',
        customMetadata: { purpose: 'government_id', ownerId: 'owner-one' },
      },
    ));

    await assertFails(uploadBytes(
      targetRef,
      Buffer.from('<svg></svg>'),
      {
        contentType: 'image/svg+xml',
        customMetadata: { purpose: 'government_id', ownerId: 'owner-one' },
      },
    ));
  });

  it('S6: denies upload of oversized files (> 10 MiB)', async () => {
    await seedUserAccount('owner-one', 'owner');
    const ownerStorage = environment.authenticatedContext('owner-one').storage();
    const targetRef = ref(ownerStorage, 'private/owner-verification/owner-one/upload-01');

    // 10 MiB + 1 byte
    const oversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);

    await assertFails(uploadBytes(
      targetRef,
      oversizedBuffer,
      {
        contentType: 'image/jpeg',
        customMetadata: { purpose: 'government_id', ownerId: 'owner-one' },
      },
    ));
  });

  it('S7 & S8: denies client download/read for both owner self and other owners', async () => {
    await seedUserAccount('owner-one', 'owner');
    await seedUserAccount('owner-two', 'owner');

    const ownerStorage = environment.authenticatedContext('owner-one').storage();
    const otherStorage = environment.authenticatedContext('owner-two').storage();
    const targetRef = ref(ownerStorage, 'private/owner-verification/owner-one/upload-01');

    await assertSucceeds(uploadBytes(
      targetRef,
      Buffer.from('valid-jpeg-bytes'),
      {
        contentType: 'image/jpeg',
        customMetadata: { purpose: 'government_id', ownerId: 'owner-one' },
      },
    ));

    // S7: Owner cannot get/download own object from client SDK
    await assertFails(getBytes(targetRef));

    // S8: Owner B cannot read Owner A's object
    await assertFails(getBytes(ref(otherStorage, 'private/owner-verification/owner-one/upload-01')));
  });

  it('S9: denies owner updating metadata or deleting an existing upload', async () => {
    await seedUserAccount('owner-one', 'owner');
    const ownerStorage = environment.authenticatedContext('owner-one').storage();
    const targetRef = ref(ownerStorage, 'private/owner-verification/owner-one/upload-01');

    await assertSucceeds(uploadBytes(
      targetRef,
      Buffer.from('valid-jpeg-bytes'),
      {
        contentType: 'image/jpeg',
        customMetadata: { purpose: 'government_id', ownerId: 'owner-one' },
      },
    ));

    // S9: Update / metadata update is denied
    await assertFails(updateMetadata(targetRef, {
      customMetadata: { purpose: 'tampered_purpose' },
    }));

    // S9: Delete is denied
    await assertFails(deleteObject(targetRef));
  });

  it('S10 & S11: denies staff verification_admin JS client from reading or writing storage objects', async () => {
    await seedUserAccount('owner-one', 'owner');
    const ownerStorage = environment.authenticatedContext('owner-one').storage();
    const targetRef = ref(ownerStorage, 'private/owner-verification/owner-one/upload-01');

    await assertSucceeds(uploadBytes(
      targetRef,
      Buffer.from('valid-jpeg-bytes'),
      {
        contentType: 'image/jpeg',
        customMetadata: { purpose: 'government_id', ownerId: 'owner-one' },
      },
    ));

    const staffStorage = environment.authenticatedContext('staff-one', {
      email: 'staff@example.com',
      verification_admin: true,
    }).storage();
    const staffTargetRef = ref(staffStorage, 'private/owner-verification/owner-one/upload-01');

    // S10: Staff JS client cannot read
    await assertFails(getBytes(staffTargetRef));

    // S11: Staff JS client cannot write or delete
    await assertFails(uploadBytes(
      ref(staffStorage, 'private/owner-verification/staff-one/upload-01'),
      Buffer.from('staff-upload'),
      {
        contentType: 'image/jpeg',
        customMetadata: { purpose: 'government_id', ownerId: 'staff-one' },
      },
    ));
    await assertFails(deleteObject(staffTargetRef));
  });

  it('S12: denies users with accountType == renter from creating private owner verification uploads', async () => {
    await seedUserAccount('renter-one', 'renter');
    const renterStorage = environment.authenticatedContext('renter-one').storage();
    const targetRef = ref(renterStorage, 'private/owner-verification/renter-one/upload-01');

    // S12: Denied because ownerAccount() check requires accountType == 'owner'
    await assertFails(uploadBytes(
      targetRef,
      Buffer.from('valid-jpeg-bytes'),
      {
        contentType: 'image/jpeg',
        customMetadata: { purpose: 'government_id', ownerId: 'renter-one' },
      },
    ));
  });
});
