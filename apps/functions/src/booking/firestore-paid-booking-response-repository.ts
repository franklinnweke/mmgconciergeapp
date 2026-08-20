import { paidBookingStateSchema } from '@mmg/contracts';
import { getFirestore, Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';

import { BookingCommandError } from './errors.js';
import type {
  PaidBookingAuditEvent,
  PaidBookingCase,
  PaidBookingOutboxEvent,
  PaidBookingResponseRepository,
  PaidBookingResponseTransaction,
  StoredPaidBooking,
  StoredPaidBookingBlock,
  StoredPaidBookingIdempotency,
} from './paid-booking-response-service.js';

const bookingSchema = z.object({
  renterId: z.string().min(1).max(128),
  ownerId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  state: paidBookingStateSchema,
  version: z.number().int().positive().optional(),
  blockId: z.string().min(1).max(128).nullable().optional(),
}).passthrough();

const bookingBlockSchema = z.object({
  vehicleId: z.string().min(1).max(128),
  state: z.enum(['held', 'paid', 'confirmed', 'owner_block']),
}).passthrough();

class FirestorePaidBookingResponseTransaction implements PaidBookingResponseTransaction {
  constructor(
    private readonly firestore: Firestore,
    private readonly transaction: Transaction,
  ) {}

  async getIdempotency(documentId: string): Promise<StoredPaidBookingIdempotency | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`idempotencyKeys/${documentId}`));
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (typeof data?.requestHash !== 'string') {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Idempotency data is invalid.');
    }
    return { requestHash: data.requestHash, result: data.result };
  }

  async getBooking(bookingId: string): Promise<StoredPaidBooking | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`bookings/${bookingId}`));
    if (!snapshot.exists) return null;
    const parsed = bookingSchema.safeParse(snapshot.data());
    if (!parsed.success) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Booking data is invalid.');
    }
    return {
      bookingId: snapshot.id,
      renterId: parsed.data.renterId,
      ownerId: parsed.data.ownerId,
      vehicleId: parsed.data.vehicleId,
      state: parsed.data.state,
      version: parsed.data.version ?? 1,
      blockId: parsed.data.blockId ?? null,
    };
  }

  async getBookingBlock(blockId: string): Promise<StoredPaidBookingBlock | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`bookingBlocks/${blockId}`));
    if (!snapshot.exists) return null;
    const parsed = bookingBlockSchema.safeParse(snapshot.data());
    if (!parsed.success) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Booking availability data is invalid.');
    }
    return { blockId: snapshot.id, ...parsed.data };
  }

  async readAvailabilitySentinel(vehicleId: string): Promise<number> {
    const snapshot = await this.transaction.get(this.firestore.doc(`vehicleAvailability/${vehicleId}`));
    if (!snapshot.exists) return 0;
    const version = snapshot.data()?.version;
    if (version === undefined) return 0;
    if (!Number.isSafeInteger(version) || version < 0) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Availability version is invalid.');
    }
    return version;
  }

  updateBooking(
    bookingId: string,
    patch: {
      state: 'confirmed' | 'intervention_required';
      version: number;
      updatedAt: Date;
      lastOwnerDecisionReason: string | null;
    },
  ): void {
    this.transaction.update(this.firestore.doc(`bookings/${bookingId}`), {
      ...patch,
      updatedAt: Timestamp.fromDate(patch.updatedAt),
    });
  }

  updateBookingBlock(blockId: string, state: 'confirmed', updatedAt: Date): void {
    this.transaction.update(this.firestore.doc(`bookingBlocks/${blockId}`), {
      state,
      updatedAt: Timestamp.fromDate(updatedAt),
    });
  }

  deleteBookingBlock(blockId: string): void {
    this.transaction.delete(this.firestore.doc(`bookingBlocks/${blockId}`));
  }

  writeAvailabilitySentinel(vehicleId: string, version: number, updatedAt: Date): void {
    this.transaction.set(this.firestore.doc(`vehicleAvailability/${vehicleId}`), {
      vehicleId,
      version,
      updatedAt: Timestamp.fromDate(updatedAt),
    }, { merge: true });
  }

  createBookingCase(record: PaidBookingCase): void {
    this.transaction.create(this.firestore.doc(`bookingCases/${record.caseId}`), {
      ...record,
      openedAt: Timestamp.fromDate(record.openedAt),
    });
  }

  createAuditEvent(event: PaidBookingAuditEvent): void {
    this.transaction.create(this.firestore.collection('auditEvents').doc(), {
      ...event,
      occurredAt: Timestamp.fromDate(event.occurredAt),
    });
  }

  createOutboxEvent(event: PaidBookingOutboxEvent): void {
    this.transaction.create(this.firestore.doc(`notificationOutbox/${event.eventId}`), {
      ...event,
      createdAt: Timestamp.fromDate(event.createdAt),
    });
  }

  saveIdempotency(
    documentId: string,
    record: {
      requestHash: string;
      commandName: 'confirmBooking' | 'rejectBooking';
      actorId: string;
      result: unknown;
    },
    createdAt: Date,
  ): void {
    this.transaction.create(this.firestore.doc(`idempotencyKeys/${documentId}`), {
      ...record,
      createdAt: Timestamp.fromDate(createdAt),
    });
  }
}

export class FirestorePaidBookingResponseRepository implements PaidBookingResponseRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  runTransaction<T>(work: (transaction: PaidBookingResponseTransaction) => Promise<T>): Promise<T> {
    return this.firestore.runTransaction((transaction) =>
      work(new FirestorePaidBookingResponseTransaction(this.firestore, transaction)));
  }
}
