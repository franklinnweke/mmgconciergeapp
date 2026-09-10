import type { RenterProfileRecord } from '@mmg/contracts';
import {
  getFirestore,
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import type {
  RenterAuditEvent,
  RenterRepository,
  RenterTransaction,
  StoredRenterIdempotency,
} from './renter-repository.js';

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
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

    return {
      renterId: data.renterId ?? renterId,
      fullName: data.fullName ?? '',
      email: data.email ?? '',
      phone: data.phone ?? '',
      defaultDeliveryAddress: data.defaultDeliveryAddress ?? {
        streetAddress: '',
        areaLabel: 'Victoria Island',
      },
      acceptedRenterTermsVersion: data.acceptedRenterTermsVersion ?? '2026-03-01',
      acceptedPrivacyNoticeVersion: data.acceptedPrivacyNoticeVersion ?? '2026-03-01',
      accountStatus: data.accountStatus ?? 'active',
      deletionReason: data.deletionReason ?? null,
      deletionRequestedAt: data.deletionRequestedAt ? toIsoString(data.deletionRequestedAt) : null,
      profileVersion: typeof data.profileVersion === 'number' ? data.profileVersion : 1,
      createdAt: toIsoString(data.createdAt),
      updatedAt: toIsoString(data.updatedAt),
    };
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

  async deleteRentalRequestContacts(renterId: string): Promise<number> {
    const contacts = await this.transaction.get(
      this.firestore.collection('rentalRequestContacts').where('renterId', '==', renterId),
    );
    for (const document of contacts.docs) {
      this.transaction.delete(document.ref);
    }
    return contacts.size;
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

    return {
      renterId: data.renterId ?? renterId,
      fullName: data.fullName ?? '',
      email: data.email ?? '',
      phone: data.phone ?? '',
      defaultDeliveryAddress: data.defaultDeliveryAddress ?? {
        streetAddress: '',
        areaLabel: 'Victoria Island',
      },
      acceptedRenterTermsVersion: data.acceptedRenterTermsVersion ?? '2026-03-01',
      acceptedPrivacyNoticeVersion: data.acceptedPrivacyNoticeVersion ?? '2026-03-01',
      accountStatus: data.accountStatus ?? 'active',
      deletionReason: data.deletionReason ?? null,
      deletionRequestedAt: data.deletionRequestedAt ? toIsoString(data.deletionRequestedAt) : null,
      profileVersion: typeof data.profileVersion === 'number' ? data.profileVersion : 1,
      createdAt: toIsoString(data.createdAt),
      updatedAt: toIsoString(data.updatedAt),
    };
  }
}
