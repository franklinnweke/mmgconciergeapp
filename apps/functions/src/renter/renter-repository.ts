import type { RenterProfileRecord } from '@mmg/contracts';

export type StoredRenterIdempotency = {
  requestHash: string;
  commandName: string;
  actorId: string;
  result: unknown;
};

export type RenterAuditEvent = {
  actorId: string;
  actorType: 'renter' | 'system' | 'privacy_admin';
  entityId: string;
  entityType: 'renterProfile';
  eventType: string;
  fromState?: string | null;
  toState?: string | null;
  requestId: string;
  occurredAt: Date;
  details?: Record<string, unknown>;
};

export interface RenterTransaction {
  getRenterProfile(renterId: string): Promise<RenterProfileRecord | null>;
  setRenterProfile(renterId: string, record: RenterProfileRecord, now: Date): void;
  hasActiveBookings(renterId: string): Promise<boolean>;
  getIdempotency(documentId: string): Promise<StoredRenterIdempotency | null>;
  saveIdempotency(documentId: string, record: StoredRenterIdempotency, createdAt: Date): void;
  createAuditEvent(event: RenterAuditEvent): void;
}

export interface RenterRepository {
  runTransaction<T>(work: (transaction: RenterTransaction) => Promise<T>): Promise<T>;
  getRenterProfile(renterId: string): Promise<RenterProfileRecord | null>;
}
