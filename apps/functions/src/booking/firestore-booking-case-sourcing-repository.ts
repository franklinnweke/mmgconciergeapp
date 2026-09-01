import {
  bookingCaseStatusSchema,
  bookingCaseTypeSchema,
  startBookingCaseSourcingResultSchema,
} from '@mmg/contracts/booking-case';
import { getFirestore, Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';

import { BookingCommandError } from './errors.js';
import type {
  BookingCaseSourcingRepository,
  BookingCaseSourcingTransaction,
  StoredBookingCaseIdempotency,
  StoredBookingInterventionCase,
} from './booking-case-sourcing-service.js';

const caseSchema = z.object({
  type: bookingCaseTypeSchema,
  status: bookingCaseStatusSchema,
  version: z.number().int().positive(),
}).passthrough();

class FirestoreBookingCaseSourcingTransaction implements BookingCaseSourcingTransaction {
  constructor(
    private readonly firestore: Firestore,
    private readonly transaction: Transaction,
  ) {}

  async getIdempotency(documentId: string): Promise<StoredBookingCaseIdempotency | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`idempotencyKeys/${documentId}`));
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (typeof data?.requestHash !== 'string') {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Idempotency data is invalid.');
    }
    return { requestHash: data.requestHash, result: data.result };
  }

  async getCase(caseId: string): Promise<StoredBookingInterventionCase | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`bookingCases/${caseId}`));
    if (!snapshot.exists) return null;
    const parsed = caseSchema.safeParse(snapshot.data());
    if (!parsed.success) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Booking intervention case data is invalid.');
    }
    return {
      caseId: snapshot.id,
      type: parsed.data.type,
      status: parsed.data.status,
      version: parsed.data.version,
    };
  }

  updateCase(input: {
    caseId: string;
    version: number;
    actor: { uid: string; role: 'support' | 'super_admin' };
    updatedAt: Date;
  }): void {
    this.transaction.update(this.firestore.doc(`bookingCases/${input.caseId}`), {
      status: 'sourcing_alternative',
      version: input.version,
      lastAction: 'start_sourcing_alternative',
      lastActionBy: input.actor.uid,
      lastActionRole: input.actor.role,
      updatedAt: Timestamp.fromDate(input.updatedAt),
    });
  }

  createDomainAudit(input: {
    caseId: string;
    actor: { uid: string; role: 'support' | 'super_admin' };
    requestId: string;
    updatedAt: Date;
  }): void {
    this.transaction.create(this.firestore.collection('auditEvents').doc(), {
      actorId: input.actor.uid,
      actorType: 'admin',
      actorRole: input.actor.role,
      entityId: input.caseId,
      entityType: 'bookingCase',
      eventType: 'booking.case_sourcing_started',
      fromState: 'open',
      toState: 'sourcing_alternative',
      requestId: input.requestId,
      occurredAt: Timestamp.fromDate(input.updatedAt),
    });
  }

  createAdminAudit(input: {
    caseId: string;
    actor: { uid: string; role: 'support' | 'super_admin' };
    requestId: string;
    fromStatus: 'open';
    toStatus: 'sourcing_alternative';
    updatedAt: Date;
  }): void {
    this.transaction.create(this.firestore.collection('adminAuditLogs').doc(), {
      actorId: input.actor.uid,
      role: input.actor.role,
      action: 'booking_case.start_sourcing',
      targetType: 'bookingCase',
      targetId: input.caseId,
      requestId: input.requestId,
      beforeStatus: input.fromStatus,
      afterStatus: input.toStatus,
      occurredAt: Timestamp.fromDate(input.updatedAt),
    });
  }

  saveIdempotency(input: {
    documentId: string;
    requestHash: string;
    actor: { uid: string; role: 'support' | 'super_admin' };
    result: unknown;
    createdAt: Date;
  }): void {
    const result = startBookingCaseSourcingResultSchema.parse(input.result);
    this.transaction.create(this.firestore.doc(`idempotencyKeys/${input.documentId}`), {
      requestHash: input.requestHash,
      commandName: 'startBookingCaseSourcing',
      actorId: input.actor.uid,
      actorRole: input.actor.role,
      result,
      createdAt: Timestamp.fromDate(input.createdAt),
    });
  }
}

export class FirestoreBookingCaseSourcingRepository implements BookingCaseSourcingRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  runTransaction<T>(work: (transaction: BookingCaseSourcingTransaction) => Promise<T>): Promise<T> {
    return this.firestore.runTransaction((transaction) =>
      work(new FirestoreBookingCaseSourcingTransaction(this.firestore, transaction)));
  }
}
