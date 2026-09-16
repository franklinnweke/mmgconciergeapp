import {
  renterProfileRecordSchema,
  type RenterProfileRecord,
} from '@mmg/contracts';
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import type {
  RenterAuditEvent,
  RenterPrivacyPurgeSummary,
  RenterRepository,
  RenterTransaction,
  StoredRenterIdempotency,
} from './renter-repository.js';

function toIsoString(value: unknown, fieldName: string): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) return value.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (value && typeof value === 'object') {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === 'function') {
      const parsed = (toDate as () => Date)();
      if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }
  throw new Error(`Renter profile ${fieldName} timestamp is invalid.`);
}

export function parseRenterProfileDocument(
  renterId: string,
  data: Record<string, unknown>,
): RenterProfileRecord {
  const normalized = {
    renterId: data.renterId,
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    defaultDeliveryAddress: data.defaultDeliveryAddress,
    acceptedRenterTermsVersion: data.acceptedRenterTermsVersion,
    acceptedPrivacyNoticeVersion: data.acceptedPrivacyNoticeVersion,
    accountStatus: data.accountStatus,
    deletionReason: data.deletionReason ?? null,
    deletionRequestedAt:
      data.deletionRequestedAt === null || data.deletionRequestedAt === undefined
        ? null
        : toIsoString(data.deletionRequestedAt, 'deletionRequestedAt'),
    profileVersion: data.profileVersion,
    createdAt: toIsoString(data.createdAt, 'createdAt'),
    updatedAt: toIsoString(data.updatedAt, 'updatedAt'),
  };

  const parsed = renterProfileRecordSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new Error('Renter profile record is malformed.');
  }
  if (parsed.data.renterId !== renterId) {
    throw new Error('Renter profile identity does not match its document path.');
  }
  return parsed.data;
}

class FirestoreRenterTransaction implements RenterTransaction {
  constructor(
    private readonly firestore: Firestore,
    private readonly transaction: Transaction,
  ) {}

  async getRenterProfile(renterId: string): Promise<RenterProfileRecord | null> {
    const docRef = this.firestore.collection('renterProfiles').doc(renterId);
    const snapshot = await this.transaction.get(docRef);
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (!data) return null;
    return parseRenterProfileDocument(renterId, data);
  }

  setRenterProfile(renterId: string, record: RenterProfileRecord, now: Date): void {
    const docRef = this.firestore.collection('renterProfiles').doc(renterId);
    this.transaction.set(docRef, {
      ...record,
      createdAt: Timestamp.fromDate(new Date(record.createdAt)),
      updatedAt: Timestamp.fromDate(now),
    });
  }

  async hasActiveBookings(renterId: string): Promise<boolean> {
    const bookingsRef = this.firestore.collection('bookings');
    const q = bookingsRef
      .where('renterId', '==', renterId)
      .where('state', 'in', [
        'paid_pending_owner',
        'confirmed',
        'intervention_required',
        'refund_pending',
        'in_progress',
        'completion_pending',
      ]);
    const snap = await this.transaction.get(q);
    return !snap.empty;
  }

  async hasActiveRentalRequests(renterId: string): Promise<boolean> {
    const requestsRef = this.firestore.collection('rentalRequests');
    const q = requestsRef
      .where('renterId', '==', renterId)
      .where('state', 'in', ['requested', 'approved', 'ready_for_payment', 'needs_attention']);
    const snap = await this.transaction.get(q);
    return !snap.empty;
  }

  async purgeRenterPrivacyData(renterId: string): Promise<RenterPrivacyPurgeSummary> {
    const contactsSnap = await this.transaction.get(
      this.firestore.collection('rentalRequestContacts').where('renterId', '==', renterId),
    );
    const requestsSnap = await this.transaction.get(
      this.firestore.collection('rentalRequests').where('renterId', '==', renterId),
    );
    const idempotencySnap = await this.transaction.get(
      this.firestore.collection('idempotencyKeys').where('actorId', '==', renterId),
    );

    const relevantIdempotencyDocs = idempotencySnap.docs.filter(
      (doc) => doc.data()?.commandName === 'createRentalRequest',
    );

    for (const doc of contactsSnap.docs) {
      this.transaction.delete(doc.ref);
    }

    let redactedLocationsCount = 0;
    const nowTimestamp = Timestamp.fromDate(new Date());
    for (const doc of requestsSnap.docs) {
      const data = doc.data();
      if (data?.pickupLocation) {
        this.transaction.update(doc.ref, {
          pickupLocation: FieldValue.delete(),
          updatedAt: nowTimestamp,
        });
        redactedLocationsCount++;
      }
    }

    for (const doc of relevantIdempotencyDocs) {
      this.transaction.delete(doc.ref);
    }

    return {
      deletedRentalRequestContactCount: contactsSnap.size,
      redactedRentalRequestLocationCount: redactedLocationsCount,
      deletedIdempotencyKeyCount: relevantIdempotencyDocs.length,
    };
  }

  async getIdempotency(documentId: string): Promise<StoredRenterIdempotency | null> {
    const docRef = this.firestore.collection('idempotencyKeys').doc(documentId);
    const snapshot = await this.transaction.get(docRef);
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (!data) return null;
    return {
      requestHash: data.requestHash,
      commandName: data.commandName,
      actorId: data.actorId,
      result: data.result,
    };
  }

  saveIdempotency(documentId: string, record: StoredRenterIdempotency, createdAt: Date): void {
    const docRef = this.firestore.collection('idempotencyKeys').doc(documentId);
    this.transaction.set(docRef, {
      ...record,
      createdAt: Timestamp.fromDate(createdAt),
    });
  }

  createAuditEvent(event: RenterAuditEvent): void {
    const docRef = this.firestore.collection('auditEvents').doc();
    this.transaction.set(docRef, {
      ...event,
      occurredAt: Timestamp.fromDate(event.occurredAt),
    });
  }
}

export class FirestoreRenterRepository implements RenterRepository {
  private readonly firestore: Firestore;

  constructor(firestore?: Firestore) {
    this.firestore = firestore ?? getFirestore();
  }

  async runTransaction<T>(work: (transaction: RenterTransaction) => Promise<T>): Promise<T> {
    return this.firestore.runTransaction(async (tx) => {
      const transaction = new FirestoreRenterTransaction(this.firestore, tx);
      return work(transaction);
    });
  }

  async getRenterProfile(renterId: string): Promise<RenterProfileRecord | null> {
    const docRef = this.firestore.collection('renterProfiles').doc(renterId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (!data) return null;
    return parseRenterProfileDocument(renterId, data);
  }
}
