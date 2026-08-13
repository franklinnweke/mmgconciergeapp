import { dateOnlySchema, renterVehicleSnapshotSchema, type CreateBookingIntentResult } from '@mmg/contracts';
import { getFirestore, Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';

import type {
  BlockingInterval,
  BookingIntentRepository,
  BookingIntentTransaction,
  NewIntentRecord,
  StoredIdempotency,
  TrustedBookingConfig,
  TrustedVehicle,
} from './create-booking-intent-service.js';
import { BookingCommandError } from './errors.js';

const vehicleSchema = z.object({
  ownerId: z.string().min(1).max(128),
  active: z.boolean(),
  ownerDailyRateKobo: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  displayName: renterVehicleSnapshotSchema.shape.displayName,
  areaLabel: renterVehicleSnapshotSchema.shape.areaLabel,
  categoryLabel: renterVehicleSnapshotSchema.shape.categoryLabel,
  imageKey: renterVehicleSnapshotSchema.shape.imageKey,
  imageUrl: renterVehicleSnapshotSchema.shape.imageUrl,
}).passthrough();

const configSchema = z.object({
  deliveryFeeKobo: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  serviceFeeBps: z.number().int().min(0).max(10_000),
  serviceFeeFixedKobo: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ownerCommissionBps: z.number().int().min(0).max(10_000),
  configVersion: z.string().min(1).max(64),
  termsVersion: z.string().min(1).max(64),
  cancellationPolicyVersion: z.string().min(1).max(64),
}).strict();

const blockSchema = z.object({
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  state: z.enum(['held', 'paid', 'confirmed']),
  expiresAt: z.instanceof(Timestamp).optional(),
}).passthrough().superRefine((block, context) => {
  if (block.state === 'held' && !block.expiresAt) {
    context.addIssue({ code: 'custom', message: 'Held blocks require expiresAt.' });
  }
});

class FirestoreBookingIntentTransaction implements BookingIntentTransaction {
  constructor(private readonly firestore: Firestore, private readonly transaction: Transaction) {}

  async getIdempotency(documentId: string): Promise<StoredIdempotency | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`idempotencyKeys/${documentId}`));
    return snapshot.exists ? snapshot.data() as StoredIdempotency : null;
  }

  async getVehicle(vehicleId: string): Promise<TrustedVehicle | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`vehicles/${vehicleId}`));
    if (!snapshot.exists) return null;
    const parsed = vehicleSchema.safeParse(snapshot.data());
    if (!parsed.success) return null;
    const { displayName, areaLabel, categoryLabel, imageKey, imageUrl, ...vehicle } = parsed.data;
    return {
      id: snapshot.id,
      ...vehicle,
      vehicleSnapshot: {
        displayName,
        areaLabel,
        categoryLabel,
        ...(imageKey ? { imageKey } : {}),
        ...(imageUrl ? { imageUrl } : {}),
      },
    };
  }

  async getBookingConfig(): Promise<TrustedBookingConfig | null> {
    const snapshot = await this.transaction.get(this.firestore.doc('systemConfig/booking'));
    if (!snapshot.exists) return null;
    const parsed = configSchema.safeParse(snapshot.data());
    return parsed.success ? parsed.data : null;
  }

  async readAvailabilitySentinel(vehicleId: string): Promise<void> {
    await this.transaction.get(this.firestore.doc(`vehicleAvailability/${vehicleId}`));
  }

  async listBlockingIntervals(vehicleId: string, exclusiveEndDate: string): Promise<readonly BlockingInterval[]> {
    const query = this.firestore.collection('bookingBlocks')
      .where('vehicleId', '==', vehicleId)
      .where('startDate', '<', exclusiveEndDate);
    const snapshot = await this.transaction.get(query);
    return snapshot.docs.map((document) => {
      const parsed = blockSchema.safeParse(document.data());
      if (!parsed.success) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          'Availability data is invalid. Booking cannot continue safely.',
        );
      }
      return {
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        state: parsed.data.state,
        expiresAt: parsed.data.expiresAt?.toDate(),
      };
    });
  }

  writeAvailabilitySentinel(vehicleId: string, updatedAt: Date): void {
    this.transaction.set(
      this.firestore.doc(`vehicleAvailability/${vehicleId}`),
      { vehicleId, updatedAt: Timestamp.fromDate(updatedAt) },
      { merge: true },
    );
  }

  createIntent(record: NewIntentRecord): void {
    this.transaction.create(this.firestore.doc(`bookingIntents/${record.intentId}`), {
      ...record,
      createdAt: Timestamp.fromDate(record.createdAt),
      updatedAt: Timestamp.fromDate(record.updatedAt),
      expiresAt: Timestamp.fromDate(record.expiresAt),
    });
  }

  createHeldBlock(record: NewIntentRecord): void {
    this.transaction.create(this.firestore.doc(`bookingBlocks/${record.intentId}`), {
      intentId: record.intentId,
      renterId: record.renterId,
      ownerId: record.ownerId,
      vehicleId: record.vehicleId,
      startDate: record.startDate,
      endDate: record.endDate,
      state: 'held',
      expiresAt: Timestamp.fromDate(record.expiresAt),
      createdAt: Timestamp.fromDate(record.createdAt),
    });
  }

  createAuditEvent(record: NewIntentRecord, requestId: string): void {
    this.transaction.create(this.firestore.collection('auditEvents').doc(), {
      actorId: record.renterId,
      actorType: 'renter',
      entityId: record.intentId,
      entityType: 'bookingIntent',
      eventType: 'booking_intent.created',
      fromState: null,
      toState: record.state,
      requestId,
      occurredAt: Timestamp.fromDate(record.createdAt),
    });
  }

  saveIdempotency(
    documentId: string,
    requestHash: string,
    result: CreateBookingIntentResult,
    createdAt: Date,
  ): void {
    this.transaction.create(this.firestore.doc(`idempotencyKeys/${documentId}`), {
      requestHash,
      result,
      createdAt: Timestamp.fromDate(createdAt),
    });
  }
}

export class FirestoreBookingIntentRepository implements BookingIntentRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  runTransaction<T>(work: (transaction: BookingIntentTransaction) => Promise<T>): Promise<T> {
    return this.firestore.runTransaction((transaction) =>
      work(new FirestoreBookingIntentTransaction(this.firestore, transaction)));
  }
}
