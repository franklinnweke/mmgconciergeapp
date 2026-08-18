import {
  dateOnlySchema,
  renterVehicleSnapshotSchema,
  type CreateBookingIntentResult,
} from '@mmg/contracts';
import { getFirestore, Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';

import type {
  BlockingInterval,
  BookingAuditEvent,
  BookingNotificationOutbox,
  BookingRepository,
  BookingTransaction,
  NewIntentRecord,
  StoredAvailabilityBlock,
  StoredBookingRecord,
  StoredIdempotency,
  TrustedBookingConfig,
  TrustedVehicle,
} from './booking-repository.js';
import { BookingCommandError } from './errors.js';

const vehicleSchema = z.object({
  ownerId: z.string().min(1).max(128),
  ownerDailyRateKobo: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  displayName: renterVehicleSnapshotSchema.shape.displayName,
  areaLabel: renterVehicleSnapshotSchema.shape.areaLabel,
  category: z.string().optional(),
  categoryLabel: renterVehicleSnapshotSchema.shape.categoryLabel.optional(),
  moderationStatus: z.enum(['draft', 'pending_review', 'approved', 'rejected', 'suspended']).optional(),
  visibility: z.enum(['active', 'paused', 'deleted']).optional(),
  discoverable: z.boolean().optional(),
  active: z.boolean().optional(),
  imageKey: renterVehicleSnapshotSchema.shape.imageKey,
  imageUrl: renterVehicleSnapshotSchema.shape.imageUrl,
  primaryImagePath: z.string().optional(),
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

const blockDocSchema = z.object({
  blockId: z.string().optional(),
  vehicleId: z.string(),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  state: z.enum(['held', 'paid', 'confirmed', 'owner_block']).optional(),
  type: z.enum(['owner_block', 'held', 'booked']).optional(),
  reason: z.enum(['maintenance', 'owner_use', 'offline', 'other']).optional(),
  notes: z.string().optional(),
  ownerId: z.string().optional(),
  expiresAt: z.instanceof(Timestamp).optional(),
  createdAt: z.instanceof(Timestamp).optional(),
  updatedAt: z.instanceof(Timestamp).optional(),
}).passthrough();

export class FirestoreBookingTransactionImpl implements BookingTransaction {
  constructor(private readonly firestore: Firestore, private readonly transaction: Transaction) {}

  async getIdempotency(documentId: string): Promise<StoredIdempotency | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`idempotencyKeys/${documentId}`));
    return snapshot.exists ? (snapshot.data() as StoredIdempotency) : null;
  }

  async getVehicle(vehicleId: string): Promise<TrustedVehicle | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`vehicles/${vehicleId}`));
    if (!snapshot.exists) return null;
    const parsed = vehicleSchema.safeParse(snapshot.data());
    if (!parsed.success) return null;

    const data = parsed.data;
    const isActive =
      data.active === true ||
      (data.moderationStatus === 'approved' && data.visibility === 'active' && data.discoverable === true);

    const categoryLabel =
      data.categoryLabel ??
      (data.category === 'executive_suv'
        ? 'Executive SUV'
        : data.category === 'executive_sedan'
          ? 'Executive Sedan'
          : data.category
            ? data.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
            : 'Executive Vehicle');

    const imageUrl =
      data.imageUrl ??
      (data.primaryImagePath && (data.primaryImagePath.startsWith('http://') || data.primaryImagePath.startsWith('https://'))
        ? data.primaryImagePath
        : undefined);

    return {
      id: snapshot.id,
      ownerId: data.ownerId,
      active: isActive,
      ownerDailyRateKobo: data.ownerDailyRateKobo,
      vehicleSnapshot: {
        displayName: data.displayName,
        areaLabel: data.areaLabel,
        categoryLabel,
        ...(data.imageKey ? { imageKey: data.imageKey } : {}),
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

  writeAvailabilitySentinel(vehicleId: string, updatedAt: Date): void {
    this.transaction.set(
      this.firestore.doc(`vehicleAvailability/${vehicleId}`),
      { vehicleId, updatedAt: Timestamp.fromDate(updatedAt) },
      { merge: true },
    );
  }

  async listBlockingIntervals(vehicleId: string, exclusiveEndDate: string): Promise<readonly BlockingInterval[]> {
    const query = this.firestore
      .collection('bookingBlocks')
      .where('vehicleId', '==', vehicleId)
      .where('startDate', '<', exclusiveEndDate);
    const snapshot = await this.transaction.get(query);
    return snapshot.docs.map((docSnap) => {
      const parsed = blockDocSchema.safeParse(docSnap.data());
      if (!parsed.success) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Availability data is invalid.');
      }
      const data = parsed.data;
      const state = (data.state ?? (data.type === 'booked' ? 'confirmed' : data.type === 'held' ? 'held' : 'owner_block')) as BlockingInterval['state'];
      return {
        blockId: docSnap.id,
        startDate: data.startDate,
        endDate: data.endDate,
        state,
        type: data.type,
        reason: data.reason,
        expiresAt: data.expiresAt?.toDate(),
      };
    });
  }

  async getAvailabilityBlocksInWindow(
    vehicleId: string,
    windowStartDate: string,
    windowEndDate: string,
  ): Promise<readonly StoredAvailabilityBlock[]> {
    const query = this.firestore
      .collection('bookingBlocks')
      .where('vehicleId', '==', vehicleId)
      .where('startDate', '<', windowEndDate);
    const snapshot = await this.transaction.get(query);
    const results: StoredAvailabilityBlock[] = [];

    for (const docSnap of snapshot.docs) {
      const parsed = blockDocSchema.safeParse(docSnap.data());
      if (!parsed.success) continue;
      const d = parsed.data;
      if (d.endDate <= windowStartDate) continue; // Outside window

      results.push({
        blockId: docSnap.id,
        vehicleId: d.vehicleId,
        ownerId: d.ownerId ?? '',
        startDate: d.startDate,
        endDate: d.endDate,
        type: d.type ?? (d.state === 'held' ? 'held' : d.state === 'confirmed' ? 'booked' : 'owner_block'),
        reason: d.reason,
        notes: d.notes,
        createdAt: d.createdAt ? d.createdAt.toDate() : new Date(),
        updatedAt: d.updatedAt ? d.updatedAt.toDate() : new Date(),
        expiresAt: d.expiresAt ? d.expiresAt.toDate() : undefined,
      });
    }

    return results;
  }

  createAvailabilityBlock(block: StoredAvailabilityBlock): void {
    this.transaction.set(this.firestore.doc(`bookingBlocks/${block.blockId}`), {
      ...block,
      createdAt: Timestamp.fromDate(block.createdAt),
      updatedAt: Timestamp.fromDate(block.updatedAt),
      ...(block.expiresAt ? { expiresAt: Timestamp.fromDate(block.expiresAt) } : {}),
    });
  }

  removeAvailabilityBlock(_vehicleId: string, blockId: string): void {
    this.transaction.delete(this.firestore.doc(`bookingBlocks/${blockId}`));
  }

  async getAvailabilityBlock(blockId: string): Promise<StoredAvailabilityBlock | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`bookingBlocks/${blockId}`));
    if (!snapshot.exists) return null;
    const parsed = blockDocSchema.safeParse(snapshot.data());
    if (!parsed.success) return null;
    const d = parsed.data;

    return {
      blockId: snapshot.id,
      vehicleId: d.vehicleId,
      ownerId: d.ownerId ?? '',
      startDate: d.startDate,
      endDate: d.endDate,
      type: d.type ?? (d.state === 'held' ? 'held' : d.state === 'confirmed' ? 'booked' : 'owner_block'),
      reason: d.reason,
      notes: d.notes,
      createdAt: d.createdAt ? d.createdAt.toDate() : new Date(),
      updatedAt: d.updatedAt ? d.updatedAt.toDate() : new Date(),
      expiresAt: d.expiresAt ? d.expiresAt.toDate() : undefined,
    };
  }

  async getIntent(intentId: string): Promise<NewIntentRecord | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`bookingIntents/${intentId}`));
    if (!snapshot.exists) return null;
    const data = snapshot.data() as any;
    return {
      intentId: snapshot.id,
      renterId: data.renterId,
      ownerId: data.ownerId,
      vehicleId: data.vehicleId,
      startDate: data.startDate,
      endDate: data.endDate,
      state: data.state,
      priceSnapshot: data.priceSnapshot,
      vehicleSnapshot: data.vehicleSnapshot,
      paymentReference: data.paymentReference ?? undefined,
      createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(data.updatedAt),
      expiresAt: data.expiresAt?.toDate?.() ?? new Date(data.expiresAt),
    };
  }

  createIntent(record: NewIntentRecord): void {
    this.transaction.create(this.firestore.doc(`bookingIntents/${record.intentId}`), {
      ...record,
      createdAt: Timestamp.fromDate(record.createdAt),
      updatedAt: Timestamp.fromDate(record.updatedAt),
      expiresAt: Timestamp.fromDate(record.expiresAt),
    });
  }

  updateIntent(record: NewIntentRecord): void {
    const payload: Record<string, unknown> = {
      state: record.state,
      updatedAt: Timestamp.fromDate(record.updatedAt),
    };
    if (record.paymentReference !== undefined) {
      payload.paymentReference = record.paymentReference;
    }
    this.transaction.set(
      this.firestore.doc(`bookingIntents/${record.intentId}`),
      payload,
      { merge: true },
    );
  }

  async getBooking(bookingId: string): Promise<StoredBookingRecord | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`bookings/${bookingId}`));
    if (!snapshot.exists) return null;
    const data = snapshot.data() as any;
    return {
      bookingId: snapshot.id,
      intentId: data.intentId,
      renterId: data.renterId,
      ownerId: data.ownerId,
      vehicleId: data.vehicleId,
      startDate: data.startDate,
      endDate: data.endDate,
      state: data.state,
      version: data.version ?? 1,
      priceSnapshot: data.priceSnapshot,
      vehicleSnapshot: data.vehicleSnapshot,
      paymentReference: data.paymentReference ?? '',
      paidAmountKobo: data.paidAmountKobo ?? data.priceSnapshot?.renterTotalKobo ?? 0,
      paymentEnvironment: data.paymentEnvironment ?? 'test',
      chauffeurNotes: data.chauffeurNotes,
      ownerRejectionReason: data.ownerRejectionReason,
      ownerRejectionDetails: data.ownerRejectionDetails,
      adminNotes: data.adminNotes,
      reassignedFromVehicleId: data.reassignedFromVehicleId,
      paidAt: data.paidAt?.toDate?.() ?? new Date(data.paidAt),
      createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(data.updatedAt),
    };
  }

  createBooking(record: StoredBookingRecord): void {
    this.transaction.create(this.firestore.doc(`bookings/${record.bookingId}`), {
      ...record,
      paidAt: Timestamp.fromDate(record.paidAt),
      createdAt: Timestamp.fromDate(record.createdAt),
      updatedAt: Timestamp.fromDate(record.updatedAt),
    });
  }

  updateBooking(record: StoredBookingRecord): void {
    this.transaction.set(
      this.firestore.doc(`bookings/${record.bookingId}`),
      {
        ...record,
        paidAt: Timestamp.fromDate(record.paidAt),
        createdAt: Timestamp.fromDate(record.createdAt),
        updatedAt: Timestamp.fromDate(record.updatedAt),
      },
      { merge: true },
    );
  }

  createHeldBlock(record: NewIntentRecord): void {
    this.transaction.create(this.firestore.doc(`bookingBlocks/${record.intentId}`), {
      blockId: record.intentId,
      intentId: record.intentId,
      renterId: record.renterId,
      ownerId: record.ownerId,
      vehicleId: record.vehicleId,
      startDate: record.startDate,
      endDate: record.endDate,
      state: 'held',
      type: 'held',
      expiresAt: Timestamp.fromDate(record.expiresAt),
      createdAt: Timestamp.fromDate(record.createdAt),
      updatedAt: Timestamp.fromDate(record.updatedAt),
    });
  }

  updateHeldBlockToBooked(intentId: string, bookingId: string, updatedAt: Date): void {
    this.transaction.set(
      this.firestore.doc(`bookingBlocks/${intentId}`),
      {
        state: 'paid',
        type: 'booked',
        bookingId,
        updatedAt: Timestamp.fromDate(updatedAt),
      },
      { merge: true },
    );
  }

  releaseHeldBlock(intentId: string): void {
    this.transaction.delete(this.firestore.doc(`bookingBlocks/${intentId}`));
  }

  createAuditEvent(event: BookingAuditEvent): void {
    this.transaction.create(this.firestore.collection('auditEvents').doc(), {
      ...event,
      occurredAt: Timestamp.fromDate(event.occurredAt),
    });
  }

  createNotificationOutbox(record: BookingNotificationOutbox): void {
    this.transaction.create(this.firestore.collection('notificationOutbox').doc(record.notificationId), {
      ...record,
      createdAt: Timestamp.fromDate(record.createdAt),
    });
  }

  saveIdempotency(
    documentId: string,
    requestHash: string,
    result: unknown,
    createdAt: Date,
  ): void {
    this.transaction.create(this.firestore.doc(`idempotencyKeys/${documentId}`), {
      requestHash,
      result,
      createdAt: Timestamp.fromDate(createdAt),
    });
  }
}

export class FirestoreBookingRepository implements BookingRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  runTransaction<T>(work: (transaction: BookingTransaction) => Promise<T>): Promise<T> {
    return this.firestore.runTransaction((transaction) =>
      work(new FirestoreBookingTransactionImpl(this.firestore, transaction)));
  }
}
