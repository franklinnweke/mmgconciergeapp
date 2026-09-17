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
      if (accountType === 'owner') {
        await setDoc(doc(context.firestore(), `ownerProfiles/${uid}`), {
          ownerId: uid, verificationStatus: 'draft', version: 1,
        });
      }
    });
  }

  async function seedVehicle(
    vehicleId: string,
    ownerId: string,
    discoverable = false,
    moderationStatus: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'suspended' = 'draft',
    visibility: 'draft' | 'public' | 'unlisted' | 'archived' | 'deleted' = 'draft',
  ) {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `vehicles/${vehicleId}`), {
        vehicleId,
        ownerId,
        discoverable,
        moderationStatus,
        visibility,
      });
      await setDoc(doc(context.firestore(), `ownerProfiles/${ownerId}`), {
        ownerId, verificationStatus: 'approved', version: 2,
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

  it('S2: allows a legacy owner with a trusted draft application to create a valid private verification upload', async () => {
    await seedUserAccount('owner-one', 'owner');
    const ownerStorage = environment.authenticatedContext('owner-one', { email_verified: true }).storage();
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
    const ownerStorage = environment.authenticatedContext('owner-one', { email_verified: true }).storage();
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
    const ownerStorage = environment.authenticatedContext('owner-one', { email_verified: true }).storage();
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
    const ownerStorage = environment.authenticatedContext('owner-one', { email_verified: true }).storage();
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
    const ownerStorage = environment.authenticatedContext('owner-one', { email_verified: true }).storage();
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

    const ownerStorage = environment.authenticatedContext('owner-one', { email_verified: true }).storage();
    const otherStorage = environment.authenticatedContext('owner-two', { email_verified: true }).storage();
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
    const ownerStorage = environment.authenticatedContext('owner-one', { email_verified: true }).storage();
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
    const ownerStorage = environment.authenticatedContext('owner-one', { email_verified: true }).storage();
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
    const renterStorage = environment.authenticatedContext('renter-one', { email_verified: true }).storage();
    const targetRef = ref(renterStorage, 'private/owner-verification/renter-one/upload-01');

    // Registration alone is not a server-created owner application.
    await assertFails(uploadBytes(
      targetRef,
      Buffer.from('valid-jpeg-bytes'),
      {
        contentType: 'image/jpeg',
        customMetadata: { purpose: 'government_id', ownerId: 'renter-one' },
      },
    ));
  });

  it.each(['draft', 'rejected'])('allows a renter with a trusted %s application to upload ID', async (status) => {
    await seedUserAccount('renter-one', 'renter');
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'ownerProfiles/renter-one'), {
        ownerId: 'renter-one', verificationStatus: status, version: 1,
      });
    });
    await assertSucceeds(uploadBytes(
      ref(environment.authenticatedContext('renter-one', { email_verified: true }).storage(), 'private/owner-verification/renter-one/upload-01'),
      Buffer.from('jpeg'), { contentType: 'image/jpeg', customMetadata: { purpose: 'government_id', ownerId: 'renter-one' } },
    ));
  });

  it.each(['submitted', 'under_review', 'approved', 'suspended', 'revoked', 'corrupt', 'wrong-owner', 'missing-version', 'unverified'])('denies ID upload for %s application', async (mode) => {
    await seedUserAccount('renter-one', 'renter');
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'ownerProfiles/renter-one'), {
        ownerId: mode === 'wrong-owner' ? 'someone-else' : 'renter-one',
        verificationStatus: ['wrong-owner', 'missing-version', 'unverified'].includes(mode) ? 'draft' : mode,
        ...(mode === 'missing-version' ? {} : { version: 1 }),
      });
    });
    await assertFails(uploadBytes(
      ref(environment.authenticatedContext('renter-one', { email_verified: mode !== 'unverified' }).storage(), 'private/owner-verification/renter-one/upload-01'),
      Buffer.from('jpeg'), { contentType: 'image/jpeg', customMetadata: { purpose: 'government_id', ownerId: 'renter-one' } },
    ));
  });

  it('denies a client creating its own owner capability', async () => {
    await seedUserAccount('renter-one', 'renter');
    const firestore = environment.authenticatedContext('renter-one', { email_verified: true }).firestore();
    await assertFails(setDoc(doc(firestore, 'ownerProfiles/renter-one'), {
      ownerId: 'renter-one', verificationStatus: 'approved', version: 1,
    }));
  });

  it.each(['owner', 'renter'] as const)('V1: allows an approved %s compatibility account to create only its own private vehicle image/document uploads', async (accountType) => {
    await seedUserAccount('owner-one', accountType);
    await seedVehicle('vehicle-one', 'owner-one');
    const ownerStorage = environment.authenticatedContext('owner-one', { email_verified: true }).storage();

    await assertSucceeds(uploadBytes(
      ref(ownerStorage, 'private/vehicle-uploads/owner-one/vehicle-one/upload-vehicle-01'),
      Buffer.from('vehicle-image'),
      {
        contentType: 'image/jpeg',
        customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_image' },
      },
    ));

    await assertSucceeds(uploadBytes(
      ref(ownerStorage, 'private/vehicle-documents/owner-one/vehicle-one/upload-doc-01'),
      Buffer.from('vehicle-document'),
      {
        contentType: 'application/pdf',
        customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_document' },
      },
    ));
  });

  it('V2: denies vehicle uploads for cross-owner, missing-vehicle, renter, and malformed-metadata paths', async () => {
    await seedUserAccount('owner-one', 'owner');
    await seedUserAccount('owner-two', 'owner');
    await seedUserAccount('renter-one', 'renter');
    await seedVehicle('vehicle-one', 'owner-one');
    await seedVehicle('vehicle-two', 'owner-two');

    const ownerStorage = environment.authenticatedContext('owner-one', { email_verified: true }).storage();
    const renterStorage = environment.authenticatedContext('renter-one', { email_verified: true }).storage();
    const imageBytes = Buffer.from('vehicle-image');

    await assertFails(uploadBytes(
      ref(ownerStorage, 'private/vehicle-uploads/owner-one/vehicle-two/upload-vehicle-02'),
      imageBytes,
      {
        contentType: 'image/jpeg',
        customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_image' },
      },
    ));
    await assertFails(uploadBytes(
      ref(ownerStorage, 'private/vehicle-uploads/owner-one/missing-vehicle/upload-vehicle-03'),
      imageBytes,
      {
        contentType: 'image/jpeg',
        customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_image' },
      },
    ));
    await assertFails(uploadBytes(
      ref(renterStorage, 'private/vehicle-uploads/renter-one/vehicle-one/upload-vehicle-04'),
      imageBytes,
      {
        contentType: 'image/jpeg',
        customMetadata: { ownerId: 'renter-one', purpose: 'vehicle_image' },
      },
    ));
    await assertFails(uploadBytes(
      ref(ownerStorage, 'private/vehicle-uploads/owner-one/vehicle-one/upload-vehicle-05'),
      imageBytes,
      {
        contentType: 'image/jpeg',
        customMetadata: { ownerId: 'owner-two', purpose: 'vehicle_image' },
      },
    ));
  });

  it('V2b: allows vehicle uploads only for draft or rejected moderation status and non-deleted visibility', async () => {
    await seedUserAccount('owner-one', 'owner');
    const ownerStorage = environment.authenticatedContext('owner-one', { email_verified: true }).storage();

    // draft -> ALLOW
    await seedVehicle('vehicle-draft', 'owner-one', false, 'draft', 'draft');
    await assertSucceeds(uploadBytes(
      ref(ownerStorage, 'private/vehicle-uploads/owner-one/vehicle-draft/upload-01'),
      Buffer.from('vehicle-image'),
      { contentType: 'image/jpeg', customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_image' } },
    ));
    await assertSucceeds(uploadBytes(
      ref(ownerStorage, 'private/vehicle-documents/owner-one/vehicle-draft/upload-01'),
      Buffer.from('vehicle-document'),
      { contentType: 'application/pdf', customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_document' } },
    ));

    // rejected -> ALLOW
    await seedVehicle('vehicle-rejected', 'owner-one', false, 'rejected', 'unlisted');
    await assertSucceeds(uploadBytes(
      ref(ownerStorage, 'private/vehicle-uploads/owner-one/vehicle-rejected/upload-02'),
      Buffer.from('vehicle-image'),
      { contentType: 'image/jpeg', customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_image' } },
    ));
    await assertSucceeds(uploadBytes(
      ref(ownerStorage, 'private/vehicle-documents/owner-one/vehicle-rejected/upload-02'),
      Buffer.from('vehicle-document'),
      { contentType: 'application/pdf', customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_document' } },
    ));

    // pending_review -> DENY
    await seedVehicle('vehicle-pending', 'owner-one', false, 'pending_review', 'unlisted');
    await assertFails(uploadBytes(
      ref(ownerStorage, 'private/vehicle-uploads/owner-one/vehicle-pending/upload-03'),
      Buffer.from('vehicle-image'),
      { contentType: 'image/jpeg', customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_image' } },
    ));
    await assertFails(uploadBytes(
      ref(ownerStorage, 'private/vehicle-documents/owner-one/vehicle-pending/upload-03'),
      Buffer.from('vehicle-document'),
      { contentType: 'application/pdf', customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_document' } },
    ));

    // approved -> DENY
    await seedVehicle('vehicle-approved', 'owner-one', false, 'approved', 'public');
    await assertFails(uploadBytes(
      ref(ownerStorage, 'private/vehicle-uploads/owner-one/vehicle-approved/upload-04'),
      Buffer.from('vehicle-image'),
      { contentType: 'image/jpeg', customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_image' } },
    ));
    await assertFails(uploadBytes(
      ref(ownerStorage, 'private/vehicle-documents/owner-one/vehicle-approved/upload-04'),
      Buffer.from('vehicle-document'),
      { contentType: 'application/pdf', customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_document' } },
    ));

    // suspended -> DENY
    await seedVehicle('vehicle-suspended', 'owner-one', false, 'suspended', 'unlisted');
    await assertFails(uploadBytes(
      ref(ownerStorage, 'private/vehicle-uploads/owner-one/vehicle-suspended/upload-05'),
      Buffer.from('vehicle-image'),
      { contentType: 'image/jpeg', customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_image' } },
    ));
    await assertFails(uploadBytes(
      ref(ownerStorage, 'private/vehicle-documents/owner-one/vehicle-suspended/upload-05'),
      Buffer.from('vehicle-document'),
      { contentType: 'application/pdf', customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_document' } },
    ));

    // deleted visibility -> DENY (even if moderationStatus is draft or rejected)
    await seedVehicle('vehicle-deleted', 'owner-one', false, 'draft', 'deleted');
    await assertFails(uploadBytes(
      ref(ownerStorage, 'private/vehicle-uploads/owner-one/vehicle-deleted/upload-06'),
      Buffer.from('vehicle-image'),
      { contentType: 'image/jpeg', customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_image' } },
    ));
    await assertFails(uploadBytes(
      ref(ownerStorage, 'private/vehicle-documents/owner-one/vehicle-deleted/upload-06'),
      Buffer.from('vehicle-document'),
      { contentType: 'application/pdf', customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_document' } },
    ));
  });

  it('V3: public approved vehicle images are readable but client writes remain denied', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(
        ref(context.storage(), 'public/vehicles/vehicle-one/approved/image-one/card'),
        Buffer.from('processed-image'),
        { contentType: 'image/jpeg' },
      );
    });

    const publicStorage = environment.unauthenticatedContext().storage();
    await assertSucceeds(getBytes(ref(
      publicStorage,
      'public/vehicles/vehicle-one/approved/image-one/card',
    )));
    await assertFails(uploadBytes(
      ref(publicStorage, 'public/vehicles/vehicle-one/approved/image-two/card'),
      Buffer.from('client-write'),
      { contentType: 'image/jpeg' },
    ));
  });

  it('V4: the public prefix is read-only for signed-in clients too, including its owner', async () => {
    // Being the owner of the listing grants nothing here. Promotion and demotion
    // are Admin-SDK operations; an owner who could delete or overwrite a public
    // object could take a moderated photo down, or swap it for an unmoderated
    // one at a path renters already have cached.
    await seedUserAccount('owner-one', 'owner');
    await seedVehicle('vehicle-one', 'owner-one', true);
    const publicPath = 'public/vehicles/vehicle-one/approved/image-one/card';

    await environment.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(ref(context.storage(), publicPath), Buffer.from('processed-image'), {
        contentType: 'image/jpeg',
      });
    });

    const ownerStorage = environment.authenticatedContext('owner-one', { email_verified: true }).storage();

    await assertSucceeds(getBytes(ref(ownerStorage, publicPath)));
    await assertFails(uploadBytes(ref(ownerStorage, publicPath), Buffer.from('overwrite'), {
      contentType: 'image/jpeg',
    }));
    await assertFails(deleteObject(ref(ownerStorage, publicPath)));
    // Metadata specifically: the promoter publishes with empty custom metadata so
    // nothing about the owner travels with the photo, and metadata is readable by
    // anyone who can read the object.
    await assertFails(updateMetadata(ref(ownerStorage, publicPath), {
      customMetadata: { ownerId: 'owner-one' },
    }));
  });

  it('V5: denies clients any access to processed variant objects', async () => {
    // Variants live one level deeper than the upload rule matches
    // (`.../{vehicleId}/{imageId}/variants/{variant}`), so they fall through to
    // the catch-all deny. They are written by the Admin SDK only — a client that
    // could write here would bypass the magic-byte check and the EXIF strip.
    await seedUserAccount('owner-one', 'owner');
    await seedVehicle('vehicle-one', 'owner-one');
    const variantPath =
      'private/vehicle-uploads/owner-one/vehicle-one/image-one/variants/card';

    await environment.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(ref(context.storage(), variantPath), Buffer.from('variant-bytes'), {
        contentType: 'image/jpeg',
      });
    });

    const ownerStorage = environment.authenticatedContext('owner-one', { email_verified: true }).storage();

    await assertFails(getBytes(ref(ownerStorage, variantPath)));
    await assertFails(uploadBytes(ref(ownerStorage, variantPath), Buffer.from('client-variant'), {
      contentType: 'image/jpeg',
      customMetadata: { ownerId: 'owner-one', purpose: 'vehicle_image' },
    }));
    await assertFails(deleteObject(ref(ownerStorage, variantPath)));
  });

  it('V6: denies a client writing outside the approved segment of the public prefix', async () => {
    // `public/vehicles/{vehicleId}/approved/...` is the only public match. A
    // sibling segment must not fall into it, and must not find another rule.
    await seedUserAccount('owner-one', 'owner');
    await seedVehicle('vehicle-one', 'owner-one');
    const ownerStorage = environment.authenticatedContext('owner-one', { email_verified: true }).storage();

    for (const path of [
      'public/vehicles/vehicle-one/pending/image-one/card',
      'public/vehicles/vehicle-one/approved/image-one',
      'public/vehicles/vehicle-one/approved/image-one/card/extra',
      'public/anything-else/file.jpg',
    ]) {
      await assertFails(uploadBytes(ref(ownerStorage, path), Buffer.from('client-write'), {
        contentType: 'image/jpeg',
      }));
    }
  });

  describe('renter profile-photo Storage rules', () => {
    const profileMetadata = (uid: string, contentType = 'image/jpeg') => ({
      contentType,
      customMetadata: {
        purpose: 'profile_photo',
        renterId: uid,
      },
    });

    it('allows a registered renter to create, replace, read and delete their own avatar', async () => {
      await seedUserAccount('renter-one', 'renter');
      const storage = environment.authenticatedContext('renter-one').storage();
      const avatar = ref(storage, 'private/renter-profile/renter-one/avatar');

      await assertSucceeds(uploadBytes(avatar, Buffer.from('first-avatar'), profileMetadata('renter-one')));
      await assertSucceeds(getBytes(avatar));
      await assertSucceeds(uploadBytes(avatar, Buffer.from('replacement-avatar'), profileMetadata('renter-one')));
      await assertSucceeds(deleteObject(avatar));
    });

    it('denies anonymous users and other authenticated users from reading or writing an avatar', async () => {
      await seedUserAccount('renter-one', 'renter');
      await seedUserAccount('renter-two', 'renter');

      const ownerStorage = environment.authenticatedContext('renter-one').storage();
      const ownerAvatar = ref(ownerStorage, 'private/renter-profile/renter-one/avatar');
      await assertSucceeds(uploadBytes(ownerAvatar, Buffer.from('avatar'), profileMetadata('renter-one')));

      const otherStorage = environment.authenticatedContext('renter-two').storage();
      await assertFails(getBytes(ref(otherStorage, 'private/renter-profile/renter-one/avatar')));
      await assertFails(uploadBytes(
        ref(otherStorage, 'private/renter-profile/renter-one/avatar'),
        Buffer.from('tamper'),
        profileMetadata('renter-two'),
      ));

      const anonymousStorage = environment.unauthenticatedContext().storage();
      await assertFails(getBytes(ref(anonymousStorage, 'private/renter-profile/renter-one/avatar')));
    });

    it('denies profile-photo writes without a registered account or with invalid metadata/type', async () => {
      const unregistered = environment.authenticatedContext('missing-user').storage();
      await assertFails(uploadBytes(
        ref(unregistered, 'private/renter-profile/missing-user/avatar'),
        Buffer.from('avatar'),
        profileMetadata('missing-user'),
      ));

      await seedUserAccount('renter-one', 'renter');
      const storage = environment.authenticatedContext('renter-one').storage();
      const avatar = ref(storage, 'private/renter-profile/renter-one/avatar');

      await assertFails(uploadBytes(avatar, Buffer.from('script'), profileMetadata('renter-one', 'image/svg+xml')));
      await assertFails(uploadBytes(avatar, Buffer.from('wrong-metadata'), {
        contentType: 'image/jpeg',
        customMetadata: { purpose: 'government_id', renterId: 'renter-one' },
      }));
    });

    it('denies profile photos larger than 5 MiB', async () => {
      await seedUserAccount('renter-one', 'renter');
      const storage = environment.authenticatedContext('renter-one').storage();
      await assertFails(uploadBytes(
        ref(storage, 'private/renter-profile/renter-one/avatar'),
        Buffer.alloc(5 * 1024 * 1024 + 1),
        profileMetadata('renter-one'),
      ));
    });
  });
});
