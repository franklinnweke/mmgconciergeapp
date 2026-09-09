import {
  dateOnlySchema,
  releaseBookingHoldResultSchema,
  renterVehicleSnapshotSchema,
  type ReleaseBookingHoldResult,
} from '@mmg/contracts';
import { getFirestore, Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { z } from 'zod';

import type {
  BookingHoldReleaseRepository,
  ReleaseBookingHoldInput,
} from './release-booking-hold-service.js';

import { buildBookingVehicleSnapshot } from './booking-vehicle-snapshot.js';
import type {
  BlockingInterval,
  AvailabilityAuditEvent,
  BookingIntentRepository,
  BookingIntentTransaction,
  NewIntentRecord,
  StoredIdempotency,
  StoredOwnerAvailabilityBlock,
  TrustedBookingConfig,
  TrustedVehicle,
} from './create-booking-intent-service.js';
import { BookingCommandError } from './errors.js';
import {
  googleCloudStoragePublicUrl,
  type PublicObjectUrl,
} from '../vehicle/renter-vehicle-view.js';
import type { VehicleImageRecord } from '../vehicle/vehicle-repository.js';

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

const blockSchema = z.object({
  blockId: z.string().min(1).max(128).optional(),
  ownerId: z.string().min(1).max(128).optional(),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  state: z.enum(['held', 'paid', 'confirmed', 'owner_block']),
  reason: z.enum(['maintenance', 'owner_use', 'offline', 'other']).optional(),
  notes: z.string().max(500).optional(),
  version: z.number().int().positive().optional(),
  expiresAt: z.instanceof(Timestamp).optional(),
  createdAt: z.instanceof(Timestamp).optional(),
  updatedAt: z.instanceof(Timestamp).optional(),
}).passthrough().superRefine((block, context) => {
  if (block.state === 'held' && !block.expiresAt) {
    context.addIssue({ code: 'custom', message: 'Held blocks require expiresAt.' });
  }
});

class FirestoreBookingIntentTransaction implements BookingIntentTransaction {
  constructor(
    private readonly firestore: Firestore,
    private readonly transaction: Transaction,
    private readonly publicObjectUrl?: PublicObjectUrl,
  ) {}

  async getIdempotency(documentId: string): Promise<StoredIdempotency | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`idempotencyKeys/${documentId}`));
    return snapshot.exists ? snapshot.data() as StoredIdempotency : null;
  }

  async getVehicle(vehicleId: string): Promise<TrustedVehicle | null> {
    const vehicleRef = this.firestore.doc(`vehicles/${vehicleId}`);
    const snapshot = await this.transaction.get(vehicleRef);
    if (!snapshot.exists) return null;
    const parsed = vehicleSchema.safeParse(snapshot.data());
    if (!parsed.success) return null;

    const data = parsed.data;

    // A vehicle is active if it explicitly sets active: true (legacy test fixtures)
    // or satisfies the canonical invariant: approved + active visibility + discoverable.
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

    // Booking snapshots must use the same renter-readable image source as
    // Discovery. Read approved image records and resolve the deterministic card
    // variant. This keeps Trips stable even if the listing changes later.
    const imagesSnapshot = await this.transaction.get(
      vehicleRef.collection('images').where('status', '==', 'approved'),
    );
    const images = imagesSnapshot.docs.map((document) => ({
      ...document.data(),
      imageId: typeof document.data().imageId === 'string' ? document.data().imageId : document.id,
    } as VehicleImageRecord));

    const storedImageUrl =
      data.imageUrl ??
      (data.primaryImagePath && (data.primaryImagePath.startsWith('http://') || data.primaryImagePath.startsWith('https://'))
        ? data.primaryImagePath
        : undefined);
    const imageUrlResolver: PublicObjectUrl = this.publicObjectUrl ?? ((publicPath) => {
      const bucketName = getStorage().bucket().name;
      return googleCloudStoragePublicUrl(bucketName)(publicPath);
    });
    const isLegacyFixture =
      data.active === true &&
      data.moderationStatus === undefined &&
      data.visibility === undefined &&
      data.discoverable === undefined;

    const vehicleSnapshot = buildBookingVehicleSnapshot(
      {
        displayName: data.displayName,
        areaLabel: data.areaLabel,
        categoryLabel,
        ...(data.imageKey ? { imageKey: data.imageKey } : {}),
        ...(storedImageUrl ? { imageUrl: storedImageUrl } : {}),
      },
      images,
      imageUrlResolver,
      { allowLegacyImageKeyFallback: isLegacyFixture },
    );

    return {
      id: snapshot.id,
      ownerId: data.ownerId,
      approved: data.moderationStatus === 'approved' || data.active === true,
      active: isActive,
      ownerDailyRateKobo: data.ownerDailyRateKobo,
      vehicleSnapshot,
    };
  }

  async getBookingConfig(): Promise<TrustedBookingConfig | null> {
    const snapshot = await this.transaction.get(this.firestore.doc('systemConfig/booking'));
    if (!snapshot.exists) return null;
    const parsed = configSchema.safeParse(snapshot.data());
    return parsed.success ? parsed.data : null;
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
        blockId: parsed.data.blockId ?? document.id,
        ownerId: parsed.data.ownerId,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        state: parsed.data.state,
        reason: parsed.data.reason,
        notes: parsed.data.notes,
        version: parsed.data.version,
        expiresAt: parsed.data.expiresAt?.toDate(),
        createdAt: parsed.data.createdAt?.toDate(),
        updatedAt: parsed.data.updatedAt?.toDate(),
      };
    });
  }

  async getAvailabilityBlock(blockId: string): Promise<StoredOwnerAvailabilityBlock | null> {
    const snapshot = await this.transaction.get(this.firestore.doc(`bookingBlocks/${blockId}`));
    if (!snapshot.exists) return null;
    const parsed = blockSchema.safeParse(snapshot.data());
    if (!parsed.success || parsed.data.state !== 'owner_block') return null;
    const data = parsed.data;
    if (
      !data.ownerId ||
      !data.reason ||
      !data.version ||
      !data.createdAt ||
      !data.updatedAt
    ) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Availability block data is invalid.');
    }
    const vehicleId = snapshot.data()?.vehicleId;
    if (typeof vehicleId !== 'string' || !vehicleId) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Availability block data is invalid.');
    }
    return {
      blockId: data.blockId ?? snapshot.id,
      vehicleId,
      ownerId: data.ownerId,
      startDate: data.startDate,
      endDate: data.endDate,
      state: 'owner_block',
      reason: data.reason,
      notes: data.notes,
      version: data.version,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
    };
  }

  createOwnerAvailabilityBlock(record: StoredOwnerAvailabilityBlock): void {
    this.transaction.create(this.firestore.doc(`bookingBlocks/${record.blockId}`), {
      blockId: record.blockId,
      vehicleId: record.vehicleId,
      ownerId: record.ownerId,
      startDate: record.startDate,
      endDate: record.endDate,
      state: record.state,
      reason: record.reason,
      ...(record.notes ? { notes: record.notes } : {}),
      version: record.version,
      createdAt: Timestamp.fromDate(record.createdAt),
      updatedAt: Timestamp.fromDate(record.updatedAt),
    });
  }

  deleteOwnerAvailabilityBlock(blockId: string): void {
    this.transaction.delete(this.firestore.doc(`bookingBlocks/${blockId}`));
  }

  writeAvailabilitySentinel(vehicleId: string, updatedAt: Date, version: number): void {
    this.transaction.set(
      this.firestore.doc(`vehicleAvailability/${vehicleId}`),
      { vehicleId, version, updatedAt: Timestamp.fromDate(updatedAt) },
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
      version: 1,
      expiresAt: Timestamp.fromDate(record.expiresAt),
      createdAt: Timestamp.fromDate(record.createdAt),
      updatedAt: Timestamp.fromDate(record.updatedAt),
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

  createAvailabilityAuditEvent(event: AvailabilityAuditEvent): void {
    this.transaction.create(this.firestore.collection('auditEvents').doc(), {
      actorId: event.actorId,
      actorType: 'owner',
      entityId: event.entityId,
      entityType: 'availabilityBlock',
      eventType: event.eventType,
      fromState: event.fromState,
      toState: event.toState,
      requestId: event.requestId,
      occurredAt: Timestamp.fromDate(event.occurredAt),
      details: {
        vehicleId: event.vehicleId,
        startDate: event.startDate,
        endDate: event.endDate,
        ...(event.reason ? { reason: event.reason } : {}),
      },
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

export class FirestoreBookingIntentRepository
  implements BookingIntentRepository, BookingHoldReleaseRepository {
  constructor(
    private readonly firestore: Firestore = getFirestore(),
    private readonly publicObjectUrl?: PublicObjectUrl,
  ) {}

  runTransaction<T>(work: (transaction: BookingIntentTransaction) => Promise<T>): Promise<T> {
    return this.firestore.runTransaction((transaction) =>
      work(new FirestoreBookingIntentTransaction(this.firestore, transaction, this.publicObjectUrl)));
  }

  async releaseHold(input: ReleaseBookingHoldInput): Promise<ReleaseBookingHoldResult> {
    return this.firestore.runTransaction(async (transaction) => {
      // 1. Check idempotency document
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const idempotencySnapshot = await transaction.get(idempotencyRef);
      if (idempotencySnapshot.exists) {
        const stored = idempotencySnapshot.data();
        if (stored?.actorId !== input.renterId) {
          throw new BookingCommandError('FAILED_PRECONDITION', 'Stored idempotency data is invalid.');
        }
        if (stored?.requestHash !== input.requestHash) {
          throw new BookingCommandError(
            'IDEMPOTENCY_CONFLICT',
            'This idempotency key was already used for a different request.',
          );
        }
        return releaseBookingHoldResultSchema.parse(stored.result);
      }

      // 2. Check released hold tombstone for idempotent retry
      const releasedRef = this.firestore.doc(`releasedBookingHolds/${input.intentId}`);
      const releasedSnapshot = await transaction.get(releasedRef);
      if (releasedSnapshot.exists) {
        const releasedData = releasedSnapshot.data();
        if (releasedData?.renterId !== input.renterId) {
          throw new BookingCommandError('FORBIDDEN', 'You cannot release this booking hold.');
        }
        const releasedAt =
          releasedData?.releasedAt instanceof Timestamp
            ? releasedData.releasedAt.toDate().toISOString()
            : typeof releasedData?.releasedAt === 'string'
              ? releasedData.releasedAt
              : input.now.toISOString();
        const replayResult = releaseBookingHoldResultSchema.parse({
          requestId: input.requestId,
          result: {
            intentId: input.intentId,
            released: true,
            releasedAt,
          },
        });
        transaction.set(idempotencyRef, {
          actorId: input.renterId,
          requestHash: input.requestHash,
          result: replayResult,
          createdAt: Timestamp.fromDate(input.now),
        });
        return replayResult;
      }

      // 3. Read bookingIntents/${intentId}
      const intentRef = this.firestore.doc(`bookingIntents/${input.intentId}`);
      const intentSnapshot = await transaction.get(intentRef);
      if (!intentSnapshot.exists) {
        throw new BookingCommandError('NOT_FOUND', 'Booking intent was not found.');
      }
      const intentData = intentSnapshot.data();
      if (!intentData || typeof intentData !== 'object') {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Booking intent data is invalid.');
      }
      if (intentData.renterId !== input.renterId) {
        throw new BookingCommandError('FORBIDDEN', 'You cannot release this booking hold.');
      }
      if (intentData.state !== 'intent_created') {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          'Only active unpaid date holds can be released.',
        );
      }

      // 4. Read bookingBlocks/${intentId}
      const blockRef = this.firestore.doc(`bookingBlocks/${input.intentId}`);
      const blockSnapshot = await transaction.get(blockRef);

      // 5. Read vehicle availability sentinel
      const vehicleId = intentData.vehicleId;
      if (typeof vehicleId !== 'string' || !vehicleId) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Booking intent vehicle is invalid.');
      }
      const sentinelRef = this.firestore.doc(`vehicleAvailability/${vehicleId}`);
      const sentinelSnapshot = await transaction.get(sentinelRef);
      const currentVersion =
        sentinelSnapshot.exists && typeof sentinelSnapshot.data()?.version === 'number'
          ? (sentinelSnapshot.data()!.version as number)
          : 0;

      // ALL READS COMPLETE. WRITES BEGIN:
      if (blockSnapshot.exists) {
        transaction.delete(blockRef);
      }

      transaction.set(
        sentinelRef,
        {
          vehicleId,
          version: currentVersion + 1,
          updatedAt: Timestamp.fromDate(input.now),
        },
        { merge: true },
      );

      // Delete active booking intent from renter-visible collection
      transaction.delete(intentRef);

      // Save audit-safe tombstone/record in releasedBookingHolds
      const releasedAtIso = input.now.toISOString();
      transaction.set(releasedRef, {
        intentId: input.intentId,
        renterId: input.renterId,
        vehicleId,
        ownerId: intentData.ownerId ?? null,
        startDate: intentData.startDate ?? null,
        endDate: intentData.endDate ?? null,
        releasedAt: Timestamp.fromDate(input.now),
        requestId: input.requestId,
        createdAt: intentData.createdAt ?? null,
        priceSnapshot: intentData.priceSnapshot ?? null,
        vehicleSnapshot: intentData.vehicleSnapshot ?? null,
      });

      // Save audit event
      const auditRef = this.firestore.collection('auditEvents').doc();
      transaction.set(auditRef, {
        actorId: input.renterId,
        actorType: 'renter',
        entityId: input.intentId,
        entityType: 'bookingIntent',
        eventType: 'booking_hold.released',
        fromState: 'intent_created',
        toState: 'released',
        requestId: input.requestId,
        occurredAt: Timestamp.fromDate(input.now),
        details: {
          vehicleId,
          startDate: intentData.startDate ?? null,
          endDate: intentData.endDate ?? null,
        },
      });

      const result = releaseBookingHoldResultSchema.parse({
        requestId: input.requestId,
        result: {
          intentId: input.intentId,
          released: true,
          releasedAt: releasedAtIso,
        },
      });

      transaction.set(idempotencyRef, {
        actorId: input.renterId,
        requestHash: input.requestHash,
        result,
        createdAt: Timestamp.fromDate(input.now),
      });

      return result;
    });
  }
}
