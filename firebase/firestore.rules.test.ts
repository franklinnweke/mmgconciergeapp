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

  beforeEach(async () => {
    await environment.clearFirestore();
  });

  afterAll(async () => {
    await environment.cleanup();
  });

  it('allows an authenticated renter to create, read, and list an owned request', async () => {
    const database = environment.authenticatedContext(
      'renter-one',
      { email: 'ada@example.com' },
    ).firestore();
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

  it('allows a signed-in user to create and read one safe account profile', async () => {
    const database = environment.authenticatedContext(
      'renter-one',
      { email: 'ada@example.com' },
    ).firestore();
    const profile = doc(database, 'users/renter-one');

    await assertSucceeds(setDoc(profile, validAccountProfile('renter-one')));
    await assertSucceeds(getDoc(profile));
  });

  it('accepts an owner profile but rejects admin and schema pollution', async () => {
    const database = environment.authenticatedContext('owner-one', { email: 'ada@example.com' }).firestore();
    const adminDatabase = environment.authenticatedContext('admin-one', { email: 'ada@example.com' }).firestore();
    const pollutedDatabase = environment.authenticatedContext('polluted-one', { email: 'ada@example.com' }).firestore();
    await assertSucceeds(
      setDoc(doc(database, 'users/owner-one'), validAccountProfile('owner-one', 'owner')),
    );
    await assertFails(setDoc(doc(adminDatabase, 'users/admin-one'), {
      ...validAccountProfile('admin-one'),
      accountType: 'admin',
    }));
    await assertFails(setDoc(doc(pollutedDatabase, 'users/polluted-one'), {
      ...validAccountProfile('polluted-one'),
      isAdmin: true,
    }));
    await assertFails(setDoc(
      doc(environment.authenticatedContext('email-one', { email: 'real@example.com' }).firestore(), 'users/email-one'),
      validAccountProfile('email-one'),
    ));
  });

  it('prevents cross-user access and all client profile mutations', async () => {
    const ownerDatabase = environment.authenticatedContext(
      'renter-one',
      { email: 'ada@example.com' },
    ).firestore();
    const attackerDatabase = environment.authenticatedContext('renter-two').firestore();
    const profile = doc(ownerDatabase, 'users/renter-one');
    await assertSucceeds(setDoc(profile, validAccountProfile('renter-one')));

    await assertFails(getDoc(doc(attackerDatabase, profile.path)));
    await assertFails(setDoc(
      doc(attackerDatabase, 'users/renter-one'),
      validAccountProfile('renter-one'),
    ));
    await assertFails(updateDoc(profile, { accountType: 'owner' }));
    await assertFails(updateDoc(profile, { displayName: 'Changed Name' }));
    await assertFails(deleteDoc(profile));
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

  describe('owner collections and staff client isolation', () => {
    it('allows owner to get their own ownerProfiles but denies list and writes (F3, F5, F14)', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'ownerProfiles/owner-one'), {
          ownerId: 'owner-one',
          legalName: 'Alhaji Musa Danjuma',
          verificationStatus: 'draft',
        });
      });

      const ownerDatabase = environment.authenticatedContext('owner-one', { email: 'owner@example.com' }).firestore();
      const profileDoc = doc(ownerDatabase, 'ownerProfiles/owner-one');

      // F3: Owner A can get ownerProfiles/A
      await assertSucceeds(getDoc(profileDoc));

      // F14: Owner A cannot list ownerProfiles collection
      await assertFails(getDocs(collection(ownerDatabase, 'ownerProfiles')));

      // F5: Owner A cannot write/update/delete ownerProfiles/A
      await assertFails(setDoc(profileDoc, { legalName: 'Tampered' }));
      await assertFails(updateDoc(profileDoc, { verificationStatus: 'approved' }));
      await assertFails(deleteDoc(profileDoc));
    });

    it('denies cross-user and anonymous access to ownerProfiles (F1, F2, F4)', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'ownerProfiles/owner-one'), {
          ownerId: 'owner-one',
          legalName: 'Alhaji Musa Danjuma',
          verificationStatus: 'draft',
        });
      });

      const attackerDatabase = environment.authenticatedContext('owner-two', { email: 'other@example.com' }).firestore();
      const renterDatabase = environment.authenticatedContext('renter-one', { email: 'renter@example.com' }).firestore();
      const publicDatabase = environment.unauthenticatedContext().firestore();

      // F4: Owner B cannot read ownerProfiles/A
      await assertFails(getDoc(doc(attackerDatabase, 'ownerProfiles/owner-one')));

      // F2: Renter cannot read ownerProfiles/A
      await assertFails(getDoc(doc(renterDatabase, 'ownerProfiles/owner-one')));

      // F1: Anonymous cannot read ownerProfiles/A
      await assertFails(getDoc(doc(publicDatabase, 'ownerProfiles/owner-one')));
    });

    it('denies all client access to ownerVerifications, adminAuditLogs, and notificationOutbox (F1, F6, F7, F10, F11, F12, F15, F16)', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'ownerVerifications/owner-one'), {
          ownerId: 'owner-one',
          phoneE164: '+2348012345678',
          status: 'submitted',
        });
        await setDoc(doc(context.firestore(), 'adminAuditLogs/log-one'), {
          action: 'approve',
          ownerId: 'owner-one',
        });
        await setDoc(doc(context.firestore(), 'notificationOutbox/event-one'), {
          status: 'unavailable',
        });
      });

      const ownerDatabase = environment.authenticatedContext('owner-one', { email: 'owner@example.com' }).firestore();
      const staffDatabase = environment.authenticatedContext('staff-one', {
        email: 'staff@example.com',
        verification_admin: true,
      }).firestore();
      const supportDatabase = environment.authenticatedContext('support-one', {
        email: 'support@example.com',
        support: true,
      }).firestore();
      const publicDatabase = environment.unauthenticatedContext().firestore();

      // F6: Owner cannot read ownerVerifications
      await assertFails(getDoc(doc(ownerDatabase, 'ownerVerifications/owner-one')));

      // F7: Owner cannot write ownerVerifications
      await assertFails(setDoc(doc(ownerDatabase, 'ownerVerifications/owner-one'), { status: 'approved' }));

      // F10, F15: Staff JS client cannot read/list ownerVerifications, adminAuditLogs, or other user docs
      await assertFails(getDoc(doc(staffDatabase, 'ownerVerifications/owner-one')));
      await assertFails(getDocs(collection(staffDatabase, 'ownerVerifications')));
      await assertFails(getDoc(doc(staffDatabase, 'adminAuditLogs/log-one')));
      await assertFails(getDocs(collection(staffDatabase, 'adminAuditLogs')));
      await assertFails(getDoc(doc(staffDatabase, 'users/owner-one')));

      // F10, F11: Staff JS client cannot read, list, or write ownerProfiles
      await assertFails(getDoc(doc(staffDatabase, 'ownerProfiles/owner-one')));
      await assertFails(getDocs(collection(staffDatabase, 'ownerProfiles')));
      await assertFails(setDoc(doc(staffDatabase, 'ownerProfiles/owner-one'), { verificationStatus: 'approved' }));

      // F11: Staff JS client cannot write any of those
      await assertFails(setDoc(doc(staffDatabase, 'ownerVerifications/owner-one'), { status: 'approved' }));
      await assertFails(setDoc(doc(staffDatabase, 'adminAuditLogs/log-two'), { action: 'approve' }));

      // F12: Support claim cannot read ownerVerifications
      await assertFails(getDoc(doc(supportDatabase, 'ownerVerifications/owner-one')));

      // F1: Anonymous cannot write ownerProfiles, ownerVerifications, or adminAuditLogs
      await assertFails(setDoc(doc(publicDatabase, 'ownerProfiles/owner-one'), { verificationStatus: 'approved' }));
      await assertFails(setDoc(doc(publicDatabase, 'ownerVerifications/owner-one'), { status: 'approved' }));
      await assertFails(setDoc(doc(publicDatabase, 'adminAuditLogs/log-one'), { action: 'approve' }));

      // F16: Any client denied read/write on notificationOutbox
      await assertFails(getDoc(doc(ownerDatabase, 'notificationOutbox/event-one')));
      await assertFails(getDoc(doc(staffDatabase, 'notificationOutbox/event-one')));
      await assertFails(getDoc(doc(publicDatabase, 'notificationOutbox/event-one')));
      await assertFails(setDoc(doc(ownerDatabase, 'notificationOutbox/event-new'), { status: 'sent' }));
      await assertFails(setDoc(doc(staffDatabase, 'notificationOutbox/event-new'), { status: 'sent' }));
    });
  });
});
