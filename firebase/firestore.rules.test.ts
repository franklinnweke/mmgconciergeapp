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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
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

function validAccountProfile(userId: string, accountType: 'renter' | 'owner' = 'renter') {
  return {
    uid: userId,
    accountType,
    displayName: 'Ada Okafor',
    email: 'ada@example.com',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
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

  beforeEach(async () => environment.clearFirestore());
  afterAll(async () => environment.cleanup());

  it('allows an authenticated renter to create, read, and list an owned request', async () => {
    const database = environment.authenticatedContext('renter-one', { email: 'ada@example.com' }).firestore();
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
    await assertFails(getDocs(collection(attackerDatabase, 'users/renter-one/bookingRequests')));
    await assertFails(setDoc(
      doc(attackerDatabase, 'users/renter-two/bookingRequests/spoofed'),
      validBookingRequest('renter-one'),
    ));
  });

  it('rejects schema pollution, oversized strings, and missing required fields', async () => {
    const database = environment.authenticatedContext('renter-one').firestore();
    const basePath = 'users/renter-one/bookingRequests';
    await assertFails(setDoc(doc(database, basePath, 'polluted'), {
      ...validBookingRequest('renter-one'), isAdmin: true,
    }));
    await assertFails(setDoc(doc(database, basePath, 'oversized'), {
      ...validBookingRequest('renter-one'), vehicleId: 'v'.repeat(129),
    }));
    const { returnAt: _omitted, ...missingReturn } = validBookingRequest('renter-one');
    await assertFails(setDoc(doc(database, basePath, 'missing'), missingReturn));
  });

  it('rejects invalid types, ranges, timestamps, and initial statuses', async () => {
    const database = environment.authenticatedContext('renter-one').firestore();
    const basePath = 'users/renter-one/bookingRequests';
    await assertFails(setDoc(doc(database, basePath, 'type-juggle'), {
      ...validBookingRequest('renter-one'), durationDays: '2',
    }));
    await assertFails(setDoc(doc(database, basePath, 'negative'), {
      ...validBookingRequest('renter-one'), totalKobo: -1,
    }));
    await assertFails(setDoc(doc(database, basePath, 'overflow'), {
      ...validBookingRequest('renter-one'), dailyRateKobo: 1_000_000_001,
    }));
    await assertFails(setDoc(doc(database, basePath, 'past-pickup'), {
      ...validBookingRequest('renter-one'), pickupAt: Timestamp.fromMillis(Date.now() - 60_000),
    }));
    await assertFails(setDoc(doc(database, basePath, 'timestamp-manipulation'), {
      ...validBookingRequest('renter-one'), createdAt: Timestamp.fromMillis(Date.now() - 60_000),
    }));
    await assertFails(setDoc(doc(database, basePath, 'status-escalation'), {
      ...validBookingRequest('renter-one'), status: 'booked',
    }));
  });

  it('denies all client updates and deletes, including status escalation', async () => {
    const database = environment.authenticatedContext('renter-one').firestore();
    const reference = doc(database, 'users/renter-one/bookingRequests/request-one');
    await assertSucceeds(setDoc(reference, validBookingRequest('renter-one')));
    await assertFails(updateDoc(reference, { status: 'confirmed' }));
    await assertFails(updateDoc(reference, { vehicleId: 'tampered', extraData: 'x'.repeat(1000) }));
    await assertFails(deleteDoc(reference));
  });

  it('allows a signed-in user to create and read one safe account profile', async () => {
    const database = environment.authenticatedContext('renter-one', { email: 'ada@example.com' }).firestore();
    const profile = doc(database, 'users/renter-one');
    await assertSucceeds(setDoc(profile, validAccountProfile('renter-one')));
    await assertSucceeds(getDoc(profile));
  });

  it('accepts an owner profile but rejects admin, email spoofing, and schema pollution', async () => {
    const owner = environment.authenticatedContext('owner-one', { email: 'ada@example.com' }).firestore();
    const admin = environment.authenticatedContext('admin-one', { email: 'ada@example.com' }).firestore();
    const polluted = environment.authenticatedContext('polluted-one', { email: 'ada@example.com' }).firestore();
    await assertSucceeds(setDoc(doc(owner, 'users/owner-one'), validAccountProfile('owner-one', 'owner')));
    await assertFails(setDoc(doc(admin, 'users/admin-one'), {
      ...validAccountProfile('admin-one'), accountType: 'admin',
    }));
    await assertFails(setDoc(doc(polluted, 'users/polluted-one'), {
      ...validAccountProfile('polluted-one'), isAdmin: true,
    }));
    const emailSpoof = environment.authenticatedContext('email-one', { email: 'real@example.com' }).firestore();
    await assertFails(setDoc(doc(emailSpoof, 'users/email-one'), validAccountProfile('email-one')));
  });

  it('prevents cross-user access and all client profile mutations', async () => {
    const ownerDatabase = environment.authenticatedContext('renter-one', { email: 'ada@example.com' }).firestore();
    const attackerDatabase = environment.authenticatedContext('renter-two').firestore();
    const profile = doc(ownerDatabase, 'users/renter-one');
    await assertSucceeds(setDoc(profile, validAccountProfile('renter-one')));
    await assertFails(getDoc(doc(attackerDatabase, profile.path)));
    await assertFails(setDoc(doc(attackerDatabase, 'users/renter-one'), validAccountProfile('renter-one')));
    await assertFails(updateDoc(profile, { accountType: 'owner' }));
    await assertFails(updateDoc(profile, { displayName: 'Changed Name' }));
    await assertFails(deleteDoc(profile));
  });

  it('allows renters to read only their server-created intents and bookings', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      await setDoc(doc(database, 'bookingIntents/intent-one'), {
        renterId: 'renter-one', state: 'intent_created', renterTotalKobo: 83_160_000,
      });
      await setDoc(doc(database, 'bookings/booking-one'), {
        renterId: 'renter-one', state: 'paid_pending_owner', paymentReference: 'server-only-reference',
      });
    });
    const renter = environment.authenticatedContext('renter-one').firestore();
    const attacker = environment.authenticatedContext('renter-two').firestore();
    const publicDatabase = environment.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(renter, 'bookingIntents/intent-one')));
    await assertSucceeds(getDoc(doc(renter, 'bookings/booking-one')));
    await assertSucceeds(getDocs(query(collection(renter, 'bookingIntents'), where('renterId', '==', 'renter-one'))));
    await assertSucceeds(getDocs(query(collection(renter, 'bookings'), where('renterId', '==', 'renter-one'))));
    await assertFails(getDocs(collection(renter, 'bookingIntents')));
    await assertFails(getDocs(query(collection(attacker, 'bookings'), where('renterId', '==', 'renter-one'))));
    await assertFails(getDoc(doc(attacker, 'bookingIntents/intent-one')));
    await assertFails(getDoc(doc(attacker, 'bookings/booking-one')));
    await assertFails(getDoc(doc(publicDatabase, 'bookingIntents/intent-one')));
  });

  it('denies all client writes to server-owned booking collections', async () => {
    const database = environment.authenticatedContext('renter-one').firestore();
    const paths = [
      'bookingIntents/client-intent', 'bookings/client-booking', 'bookingBlocks/client-block',
      'vehicleAvailability/vehicle-one', 'payments/client-payment', 'auditEvents/client-audit',
      'idempotencyKeys/client-key', 'systemConfig/booking',
    ];
    for (const path of paths) {
      await assertFails(setDoc(doc(database, path), {
        renterId: 'renter-one', state: 'confirmed', totalKobo: 1, isAdmin: true,
      }));
    }
  });

  it('denies update and delete attempts against server-created records', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'bookingIntents/intent-one'), {
        renterId: 'renter-one', state: 'intent_created', renterTotalKobo: 83_160_000,
      });
    });
    const database = environment.authenticatedContext('renter-one').firestore();
    const reference = doc(database, 'bookingIntents/intent-one');
    await assertFails(updateDoc(reference, { state: 'paid', renterTotalKobo: 1 }));
    await assertFails(deleteDoc(reference));
  });

  describe('owner collections and staff client isolation', () => {
    it('allows an owner to get their profile but denies list and writes', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'ownerProfiles/owner-one'), {
          ownerId: 'owner-one', legalName: 'Alhaji Musa Danjuma', verificationStatus: 'draft',
        });
      });
      const owner = environment.authenticatedContext('owner-one', { email: 'owner@example.com' }).firestore();
      const profile = doc(owner, 'ownerProfiles/owner-one');
      await assertSucceeds(getDoc(profile));
      await assertFails(getDocs(collection(owner, 'ownerProfiles')));
      await assertFails(setDoc(profile, { legalName: 'Tampered' }));
      await assertFails(updateDoc(profile, { verificationStatus: 'approved' }));
      await assertFails(deleteDoc(profile));
    });

    it('denies cross-user and anonymous access to owner profiles', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'ownerProfiles/owner-one'), {
          ownerId: 'owner-one', legalName: 'Alhaji Musa Danjuma', verificationStatus: 'draft',
        });
      });
      await assertFails(getDoc(doc(environment.authenticatedContext('owner-two').firestore(), 'ownerProfiles/owner-one')));
      await assertFails(getDoc(doc(environment.authenticatedContext('renter-one').firestore(), 'ownerProfiles/owner-one')));
      await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'ownerProfiles/owner-one')));
    });

    it('denies all client access to verification, audit, and notification collections', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        const database = context.firestore();
        await setDoc(doc(database, 'ownerVerifications/owner-one'), {
          ownerId: 'owner-one', phoneE164: '+2348012345678', status: 'submitted',
        });
        await setDoc(doc(database, 'adminAuditLogs/log-one'), { action: 'approve', ownerId: 'owner-one' });
        await setDoc(doc(database, 'notificationOutbox/event-one'), { status: 'unavailable' });
      });
      const owner = environment.authenticatedContext('owner-one').firestore();
      const staff = environment.authenticatedContext('staff-one', { verification_admin: true }).firestore();
      const support = environment.authenticatedContext('support-one', { support: true }).firestore();
      const publicDatabase = environment.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(owner, 'ownerVerifications/owner-one')));
      await assertFails(setDoc(doc(owner, 'ownerVerifications/owner-one'), { status: 'approved' }));
      await assertFails(getDoc(doc(staff, 'ownerVerifications/owner-one')));
      await assertFails(getDocs(collection(staff, 'ownerVerifications')));
      await assertFails(getDoc(doc(staff, 'adminAuditLogs/log-one')));
      await assertFails(getDocs(collection(staff, 'adminAuditLogs')));
      await assertFails(getDoc(doc(staff, 'ownerProfiles/owner-one')));
      await assertFails(getDocs(collection(staff, 'ownerProfiles')));
      await assertFails(setDoc(doc(staff, 'ownerProfiles/owner-one'), { verificationStatus: 'approved' }));
      await assertFails(setDoc(doc(staff, 'adminAuditLogs/log-two'), { action: 'approve' }));
      await assertFails(getDoc(doc(support, 'ownerVerifications/owner-one')));
      await assertFails(setDoc(doc(publicDatabase, 'ownerProfiles/owner-one'), { verificationStatus: 'approved' }));
      await assertFails(getDoc(doc(owner, 'notificationOutbox/event-one')));
      await assertFails(getDoc(doc(staff, 'notificationOutbox/event-one')));
      await assertFails(getDoc(doc(publicDatabase, 'notificationOutbox/event-one')));
      await assertFails(setDoc(doc(owner, 'notificationOutbox/event-new'), { status: 'sent' }));
    });
  });

  describe('vehicle inventory and booking-case isolation', () => {
    beforeEach(async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        const database = context.firestore();
        await setDoc(doc(database, 'vehicles/vehicle-owner'), {
          vehicleId: 'vehicle-owner', ownerId: 'owner-one', discoverable: false,
          ownerDailyRateKobo: 15_000_000,
        });
        await setDoc(doc(database, 'vehicles/vehicle-discoverable'), {
          vehicleId: 'vehicle-discoverable', ownerId: 'owner-two', discoverable: true,
          ownerDailyRateKobo: 18_000_000, lastDecisionReason: 'private moderation note',
          pendingRevisionId: 'private-revision-id',
          primaryImagePath: 'private/vehicle-uploads/owner-two/vehicle-discoverable/card',
        });
        await setDoc(doc(database, 'vehiclePrivate/vehicle-owner'), {
          vehicleId: 'vehicle-owner', ownerId: 'owner-one', exactLatitude: 6.43,
          exactLongitude: 3.42, plate: 'KJA-123AB',
        });
        await setDoc(doc(database, 'vehicles/vehicle-owner/images/image-private'), {
          vehicleId: 'vehicle-owner', ownerId: 'owner-one', status: 'processed',
          originalUploadId: 'upload-private', variantPaths: { card: 'private/owner/card' },
        });
        await setDoc(doc(database, 'vehicles/vehicle-discoverable/images/image-public-looking'), {
          vehicleId: 'vehicle-discoverable', ownerId: 'owner-two', status: 'approved',
          originalUploadId: 'upload-secret', variantPaths: { card: 'private/owner-two/card' },
          publicVariantPaths: { card: 'public/vehicles/vehicle-discoverable/card' },
        });
        await setDoc(doc(database, 'vehicleRevisions/revision-owner'), {
          vehicleId: 'vehicle-owner', ownerId: 'owner-one', createdAt: serverTimestamp(),
        });
        await setDoc(doc(database, 'bookingCases/case-owner'), {
          ownerId: 'owner-one', renterId: 'renter-one', status: 'open',
        });
      });
    });

    it('keeps trusted vehicle records owner-only even when discoverable is true', async () => {
      const owner = environment.authenticatedContext('owner-one').firestore();
      const renter = environment.authenticatedContext('renter-one').firestore();
      const anonymous = environment.unauthenticatedContext().firestore();
      const staff = environment.authenticatedContext('staff-one', { vehicle_admin: true }).firestore();

      await assertSucceeds(getDoc(doc(owner, 'vehicles/vehicle-owner')));
      await assertSucceeds(getDocs(query(collection(owner, 'vehicles'), where('ownerId', '==', 'owner-one'))));
      await assertFails(getDocs(collection(owner, 'vehicles')));
      await assertFails(getDoc(doc(owner, 'vehicles/vehicle-discoverable')));

      await assertFails(getDoc(doc(renter, 'vehicles/vehicle-discoverable')));
      await assertFails(getDocs(query(collection(renter, 'vehicles'), where('discoverable', '==', true))));
      await assertFails(getDoc(doc(anonymous, 'vehicles/vehicle-discoverable')));
      await assertFails(getDoc(doc(staff, 'vehicles/vehicle-discoverable')));
    });

    it('never exposes private vehicle or image documents to renters', async () => {
      const owner = environment.authenticatedContext('owner-one').firestore();
      const otherOwner = environment.authenticatedContext('owner-two').firestore();
      const renter = environment.authenticatedContext('renter-one').firestore();

      await assertSucceeds(getDoc(doc(owner, 'vehiclePrivate/vehicle-owner')));
      await assertFails(getDoc(doc(otherOwner, 'vehiclePrivate/vehicle-owner')));
      await assertSucceeds(getDocs(query(collection(owner, 'vehiclePrivate'), where('ownerId', '==', 'owner-one'))));
      await assertFails(getDoc(doc(renter, 'vehiclePrivate/vehicle-owner')));

      await assertSucceeds(getDoc(doc(owner, 'vehicles/vehicle-owner/images/image-private')));
      await assertFails(getDoc(doc(renter, 'vehicles/vehicle-discoverable/images/image-public-looking')));
      await assertFails(getDoc(doc(renter, 'vehicles/vehicle-owner/images/image-private')));
      await assertFails(setDoc(doc(owner, 'vehicles/vehicle-owner'), { discoverable: true }));
    });

    it('limits revisions and booking cases to the owner or booking participants', async () => {
      const owner = environment.authenticatedContext('owner-one').firestore();
      const renter = environment.authenticatedContext('renter-one').firestore();
      const attacker = environment.authenticatedContext('renter-two').firestore();
      await assertSucceeds(getDoc(doc(owner, 'vehicleRevisions/revision-owner')));
      await assertSucceeds(getDocs(query(collection(owner, 'vehicleRevisions'), where('ownerId', '==', 'owner-one'))));
      await assertFails(getDoc(doc(attacker, 'vehicleRevisions/revision-owner')));
      await assertSucceeds(getDoc(doc(owner, 'bookingCases/case-owner')));
      await assertSucceeds(getDoc(doc(renter, 'bookingCases/case-owner')));
      await assertFails(getDoc(doc(attacker, 'bookingCases/case-owner')));
      await assertFails(setDoc(doc(owner, 'bookingCases/case-new'), { ownerId: 'owner-one' }));
    });
  });
});
