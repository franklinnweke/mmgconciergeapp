import {
  dateOnlySchema,
  priceSnapshotSchema,
  renterVehicleSnapshotSchema,
  type PriceSnapshot,
  type RenterVehicleSnapshot,
} from '@mmg/contracts';
import {
  approveRentalRequestResultSchema,
  createRentalRequestResultSchema,
  declineRentalRequestResultSchema,
  rentalRequestServiceAreaSchema,
  releaseRentalRequestPaymentHoldResultSchema,
  type ApproveRentalRequestResult,
  type CreateRentalRequestResult,
  type DeclineRentalRequestResult,
  type ReleaseRentalRequestPaymentHoldResult,
} from '@mmg/contracts/rental-request';
import {
  calculateAuthoritativePrice,
  calculateChargedDays,
  intervalsOverlap,
} from '@mmg/domain';
import { getFirestore, Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { z } from 'zod';

import { buildBookingVehicleSnapshot } from './booking-vehicle-snapshot.js';
import { BookingCommandError } from './errors.js';
import type {
  CreateRentalRequestInput,
  DecideRentalRequestInput,
  ReleaseRentalRequestPaymentHoldInput,
  RentalRequestRepository,
} from './rental-request-service.js';
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

const rentalRequestSchema = z.object({
  requestId: z.string().min(1).max(128),
  renterId: z.string().min(1).max(128),
  ownerId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  serviceAreaLabel: rentalRequestServiceAreaSchema,
  state: z.enum(['requested', 'ready_for_payment', 'declined', 'payment_window_expired', 'confirmed', 'needs_attention']),
  version: z.number().int().positive(),
  estimatedPriceSnapshot: priceSnapshotSchema,
  authoritativePriceSnapshot: priceSnapshotSchema.optional(),
  vehicleSnapshot: renterVehicleSnapshotSchema,
  intentId: z.string().min(1).max(128).optional(),
  holdExpiresAt: z.instanceof(Timestamp).optional(),
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp),
}).passthrough();

const intentSchema = z.object({
  renterId: z.string().min(1).max(128),
  ownerId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  rentalRequestId: z.string().min(1).max(128).optional(),
  state: z.enum(['intent_created', 'checkout_pending', 'paid', 'expired', 'failed', 'invalid', 'paid_conflict']),
}).passthrough();

const blockSchema = z.object({
  intentId: z.string().min(1).max(128).optional(),
  renterId: z.string().min(1).max(128).optional(),
  ownerId: z.string().min(1).max(128).optional(),
  vehicleId: z.string().min(1).max(128),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  state: z.enum(['held', 'paid', 'confirmed', 'owner_block']),
  expiresAt: z.instanceof(Timestamp).optional(),
}).passthrough();

type TrustedVehicle = {
  id: string;
  ownerId: string;
  ownerDailyRateKobo: number;
  vehicleSnapshot: RenterVehicleSnapshot;
};

type TrustedConfig = z.infer<typeof configSchema>;

function dateOnlyInLagos(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Africa/Lagos',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function activeBlock(block: z.infer<typeof blockSchema>, now: Date): boolean {
  if (block.state !== 'held') return true;
  return Boolean(block.expiresAt && block.expiresAt.toMillis() > now.getTime());
}

export class FirestoreRentalRequestRepository implements RentalRequestRepository {
  constructor(
    private readonly firestore: Firestore = getFirestore(),
    private readonly publicObjectUrl?: PublicObjectUrl,
  ) {}

  private async readVehicle(transaction: Transaction, vehicleId: string): Promise<TrustedVehicle> {
    const vehicleRef = this.firestore.doc(`vehicles/${vehicleId}`);
    const snapshot = await transaction.get(vehicleRef);
    const parsed = vehicleSchema.safeParse(snapshot.data());
    if (!snapshot.exists || !parsed.success) {
      throw new BookingCommandError('NOT_FOUND', 'Vehicle is not available.');
    }
    const data = parsed.data;
    const active = data.active === true ||
      (data.moderationStatus === 'approved' && data.visibility === 'active' && data.discoverable === true);
    if (!active) throw new BookingCommandError('NOT_FOUND', 'Vehicle is not available.');

    const imageSnapshot = await transaction.get(vehicleRef.collection('images').where('status', '==', 'approved'));
    const images = imageSnapshot.docs.map((document) => ({
      ...document.data(),
      imageId: typeof document.data().imageId === 'string' ? document.data().imageId : document.id,
    } as VehicleImageRecord));
    const categoryLabel = data.categoryLabel ??
      (data.category === 'executive_suv' ? 'Executive SUV'
        : data.category === 'executive_sedan' ? 'Executive Sedan'
          : data.category ? data.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
            : 'Executive Vehicle');
    const storedImageUrl = data.imageUrl ??
      (data.primaryImagePath?.startsWith('http://') || data.primaryImagePath?.startsWith('https://')
        ? data.primaryImagePath : undefined);
    const resolver = this.publicObjectUrl ?? ((publicPath: string) =>
      googleCloudStoragePublicUrl(getStorage().bucket().name)(publicPath));
    const legacyFixture = data.active === true && data.moderationStatus === undefined &&
      data.visibility === undefined && data.discoverable === undefined;
    const vehicleSnapshot = buildBookingVehicleSnapshot({
      displayName: data.displayName,
      areaLabel: data.areaLabel,
      categoryLabel,
      ...(data.imageKey ? { imageKey: data.imageKey } : {}),
      ...(storedImageUrl ? { imageUrl: storedImageUrl } : {}),
    }, images, resolver, { allowLegacyImageKeyFallback: legacyFixture });

    return { id: snapshot.id, ownerId: data.ownerId, ownerDailyRateKobo: data.ownerDailyRateKobo, vehicleSnapshot };
  }

  private async readConfig(transaction: Transaction): Promise<TrustedConfig> {
    const snapshot = await transaction.get(this.firestore.doc('systemConfig/booking'));
    const parsed = configSchema.safeParse(snapshot.data());
    if (!snapshot.exists || !parsed.success) {
      throw new BookingCommandError('CONFIGURATION_UNAVAILABLE', 'Booking configuration is unavailable.');
    }
    return parsed.data;
  }

  private price(vehicle: TrustedVehicle, config: TrustedConfig, startDate: string, endDate: string): PriceSnapshot {
    let chargedDays: number;
    try {
      chargedDays = calculateChargedDays(startDate, endDate);
    } catch {
      throw new BookingCommandError('INVALID_ARGUMENT', 'Return date must be after pickup date.');
    }
    if (chargedDays < 1 || chargedDays > 30) {
      throw new BookingCommandError('INVALID_ARGUMENT', 'Rental duration must be between 1 and 30 days.');
    }
    try {
      return calculateAuthoritativePrice({ ownerDailyRateKobo: vehicle.ownerDailyRateKobo, chargedDays, ...config });
    } catch {
      throw new BookingCommandError('FAILED_PRECONDITION', 'The current rental price is invalid.');
    }
  }

  async createRequest(input: CreateRentalRequestInput): Promise<CreateRentalRequestResult> {
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const idempotency = await transaction.get(idempotencyRef);
      if (idempotency.exists) {
        const stored = idempotency.data();
        if (stored?.actorId !== input.renterId || stored?.requestHash !== input.requestHash) {
          throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This request key was already used differently.');
        }
        return createRentalRequestResultSchema.parse(stored.result);
      }
      if (input.data.startDate < dateOnlyInLagos(input.now)) {
        throw new BookingCommandError('INVALID_ARGUMENT', 'Pickup date cannot be in the past.');
      }
      const vehicle = await this.readVehicle(transaction, input.data.vehicleId);
      const config = await this.readConfig(transaction);
      const estimatedPriceSnapshot = this.price(vehicle, config, input.data.startDate, input.data.endDate);
      const requestRef = this.firestore.doc(`rentalRequests/${input.requestId}`);
      const contactRef = this.firestore.doc(`rentalRequestContacts/${input.requestId}`);
      const result = createRentalRequestResultSchema.parse({
        requestId: input.commandRequestId,
        result: {
          requestId: input.requestId,
          state: 'requested',
          startDate: input.data.startDate,
          endDate: input.data.endDate,
          serviceAreaLabel: input.data.serviceAreaLabel,
          estimatedPriceSnapshot,
          vehicleSnapshot: vehicle.vehicleSnapshot,
          version: 1,
          createdAt: input.now.toISOString(),
        },
      });
      transaction.create(requestRef, {
        requestId: input.requestId,
        renterId: input.renterId,
        ownerId: vehicle.ownerId,
        vehicleId: vehicle.id,
        startDate: input.data.startDate,
        endDate: input.data.endDate,
        serviceAreaLabel: input.data.serviceAreaLabel,
        state: 'requested',
        version: 1,
        estimatedPriceSnapshot,
        vehicleSnapshot: vehicle.vehicleSnapshot,
        createdAt: Timestamp.fromDate(input.now),
        updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.create(contactRef, {
        requestId: input.requestId,
        renterId: input.renterId,
        contactPhone: input.data.contactPhone,
        createdAt: Timestamp.fromDate(input.now),
        updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: input.renterId, actorType: 'renter', entityId: input.requestId,
        entityType: 'rentalRequest', eventType: 'rental_request.created', fromState: null,
        toState: 'requested', requestId: input.commandRequestId, occurredAt: Timestamp.fromDate(input.now),
        details: { vehicleId: vehicle.id, startDate: input.data.startDate, endDate: input.data.endDate },
      });
      transaction.create(this.firestore.collection('notificationOutbox').doc(), {
        eventType: 'rental_request.requested', requestId: input.requestId, ownerId: vehicle.ownerId,
        status: 'unavailable', reason: 'fcm_not_in_current_acceptance_scope', createdAt: Timestamp.fromDate(input.now),
      });
      transaction.create(idempotencyRef, {
        actorId: input.renterId, commandName: 'createRentalRequest', requestHash: input.requestHash,
        result, createdAt: Timestamp.fromDate(input.now),
      });
      return result;
    });
  }

  async approveRequest(input: DecideRentalRequestInput & { intentId: string; holdExpiresAt: Date }): Promise<ApproveRentalRequestResult> {
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const idempotency = await transaction.get(idempotencyRef);
      if (idempotency.exists) {
        const stored = idempotency.data();
        if (stored?.actorId !== input.actor.uid || stored?.requestHash !== input.requestHash) {
          throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This approval key was already used differently.');
        }
        return approveRentalRequestResultSchema.parse(stored.result);
      }
      const requestRef = this.firestore.doc(`rentalRequests/${input.requestId}`);
      const requestSnapshot = await transaction.get(requestRef);
      const request = rentalRequestSchema.safeParse(requestSnapshot.data());
      if (!requestSnapshot.exists || !request.success) throw new BookingCommandError('NOT_FOUND', 'Rental request was not found.');
      if (request.data.ownerId !== input.actor.uid && !input.actor.isStaff) {
        throw new BookingCommandError('FORBIDDEN', 'You cannot approve this rental request.');
      }
      if (request.data.state !== 'requested' || request.data.version !== input.expectedVersion) {
        throw new BookingCommandError('INVALID_STATE_TRANSITION', 'This rental request is no longer awaiting approval.');
      }
      if (request.data.startDate < dateOnlyInLagos(input.now)) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'The requested pickup date has passed.');
      }
      const vehicle = await this.readVehicle(transaction, request.data.vehicleId);
      if (vehicle.ownerId !== request.data.ownerId) throw new BookingCommandError('FAILED_PRECONDITION', 'Vehicle ownership changed.');
      const config = await this.readConfig(transaction);
      const priceSnapshot = this.price(vehicle, config, request.data.startDate, request.data.endDate);
      const sentinelRef = this.firestore.doc(`vehicleAvailability/${vehicle.id}`);
      const sentinelSnapshot = await transaction.get(sentinelRef);
      const rawVersion = sentinelSnapshot.exists ? sentinelSnapshot.data()?.version : 0;
      if (!Number.isSafeInteger(rawVersion) || rawVersion < 0) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Availability version is invalid.');
      }
      const candidate = await transaction.get(this.firestore.collection('bookingBlocks')
        .where('vehicleId', '==', vehicle.id).where('startDate', '<', request.data.endDate));
      for (const document of candidate.docs) {
        const block = blockSchema.safeParse(document.data());
        if (!block.success) throw new BookingCommandError('FAILED_PRECONDITION', 'Availability data is invalid.');
        if (activeBlock(block.data, input.now) && intervalsOverlap(request.data, block.data)) {
          throw new BookingCommandError('VEHICLE_UNAVAILABLE', 'These dates are no longer available.');
        }
      }
      const nextVersion = request.data.version + 1;
      const result = approveRentalRequestResultSchema.parse({
        requestId: input.commandRequestId,
        result: {
          requestId: input.requestId, state: 'ready_for_payment', version: nextVersion,
          intentId: input.intentId, holdExpiresAt: input.holdExpiresAt.toISOString(),
          authoritativePriceSnapshot: priceSnapshot, approvedAt: input.now.toISOString(),
        },
      });
      transaction.create(this.firestore.doc(`bookingIntents/${input.intentId}`), {
        intentId: input.intentId, rentalRequestId: input.requestId, renterId: request.data.renterId,
        ownerId: request.data.ownerId, vehicleId: request.data.vehicleId,
        startDate: request.data.startDate, endDate: request.data.endDate, state: 'intent_created',
        priceSnapshot, vehicleSnapshot: vehicle.vehicleSnapshot,
        createdAt: Timestamp.fromDate(input.now), updatedAt: Timestamp.fromDate(input.now),
        expiresAt: Timestamp.fromDate(input.holdExpiresAt),
      });
      transaction.create(this.firestore.doc(`bookingBlocks/${input.intentId}`), {
        intentId: input.intentId, rentalRequestId: input.requestId, renterId: request.data.renterId,
        ownerId: request.data.ownerId, vehicleId: request.data.vehicleId,
        startDate: request.data.startDate, endDate: request.data.endDate, state: 'held', version: 1,
        expiresAt: Timestamp.fromDate(input.holdExpiresAt), createdAt: Timestamp.fromDate(input.now),
        updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.update(requestRef, {
        state: 'ready_for_payment', version: nextVersion, intentId: input.intentId,
        holdExpiresAt: Timestamp.fromDate(input.holdExpiresAt), authoritativePriceSnapshot: priceSnapshot,
        approvedBy: input.actor.uid, approvedByType: input.actor.isStaff ? 'staff' : 'owner',
        approvedAt: Timestamp.fromDate(input.now), updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.set(sentinelRef, { vehicleId: vehicle.id, version: rawVersion + 1, updatedAt: Timestamp.fromDate(input.now) }, { merge: true });
      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: input.actor.uid, actorType: input.actor.isStaff ? 'staff' : 'owner',
        entityId: input.requestId, entityType: 'rentalRequest', eventType: 'rental_request.approved',
        fromState: 'requested', toState: 'ready_for_payment', requestId: input.commandRequestId,
        occurredAt: Timestamp.fromDate(input.now), details: { intentId: input.intentId, holdMinutes: 30 },
      });
      transaction.create(this.firestore.collection('notificationOutbox').doc(), {
        eventType: 'rental_request.ready_for_payment', requestId: input.requestId,
        renterId: request.data.renterId, status: 'unavailable', reason: 'fcm_not_in_current_acceptance_scope',
        createdAt: Timestamp.fromDate(input.now),
      });
      transaction.create(idempotencyRef, {
        actorId: input.actor.uid, commandName: 'approveRentalRequest', requestHash: input.requestHash,
        result, createdAt: Timestamp.fromDate(input.now),
      });
      return result;
    });
  }

  async declineRequest(input: DecideRentalRequestInput): Promise<DeclineRentalRequestResult> {
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const idempotency = await transaction.get(idempotencyRef);
      if (idempotency.exists) {
        const stored = idempotency.data();
        if (stored?.actorId !== input.actor.uid || stored?.requestHash !== input.requestHash) {
          throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This decline key was already used differently.');
        }
        return declineRentalRequestResultSchema.parse(stored.result);
      }
      const requestRef = this.firestore.doc(`rentalRequests/${input.requestId}`);
      const requestSnapshot = await transaction.get(requestRef);
      const request = rentalRequestSchema.safeParse(requestSnapshot.data());
      if (!requestSnapshot.exists || !request.success) throw new BookingCommandError('NOT_FOUND', 'Rental request was not found.');
      if (request.data.ownerId !== input.actor.uid && !input.actor.isStaff) throw new BookingCommandError('FORBIDDEN', 'You cannot decline this rental request.');
      if (request.data.state !== 'requested' || request.data.version !== input.expectedVersion) {
        throw new BookingCommandError('INVALID_STATE_TRANSITION', 'This rental request is no longer awaiting a response.');
      }
      const nextVersion = request.data.version + 1;
      const result = declineRentalRequestResultSchema.parse({
        requestId: input.commandRequestId,
        result: { requestId: input.requestId, state: 'declined', version: nextVersion, declinedAt: input.now.toISOString() },
      });
      transaction.update(requestRef, {
        state: 'declined', version: nextVersion, declinedBy: input.actor.uid,
        declinedByType: input.actor.isStaff ? 'staff' : 'owner',
        declineReason: input.reason ?? 'Request declined', declinedAt: Timestamp.fromDate(input.now),
        updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: input.actor.uid, actorType: input.actor.isStaff ? 'staff' : 'owner', entityId: input.requestId,
        entityType: 'rentalRequest', eventType: 'rental_request.declined', fromState: 'requested', toState: 'declined',
        requestId: input.commandRequestId, occurredAt: Timestamp.fromDate(input.now),
      });
      transaction.create(this.firestore.collection('notificationOutbox').doc(), {
        eventType: 'rental_request.declined', requestId: input.requestId, renterId: request.data.renterId,
        status: 'unavailable', reason: 'fcm_not_in_current_acceptance_scope', createdAt: Timestamp.fromDate(input.now),
      });
      transaction.create(idempotencyRef, {
        actorId: input.actor.uid, commandName: 'declineRentalRequest', requestHash: input.requestHash,
        result, createdAt: Timestamp.fromDate(input.now),
      });
      return result;
    });
  }

  async releasePaymentHold(input: ReleaseRentalRequestPaymentHoldInput): Promise<ReleaseRentalRequestPaymentHoldResult> {
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const idempotency = await transaction.get(idempotencyRef);
      if (idempotency.exists) {
        const stored = idempotency.data();
        if (stored?.actorId !== input.renterId || stored?.requestHash !== input.requestHash) {
          throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This release key was already used differently.');
        }
        return releaseRentalRequestPaymentHoldResultSchema.parse(stored.result);
      }
      const requestRef = this.firestore.doc(`rentalRequests/${input.requestId}`);
      const requestSnapshot = await transaction.get(requestRef);
      const request = rentalRequestSchema.safeParse(requestSnapshot.data());
      if (!requestSnapshot.exists || !request.success) throw new BookingCommandError('NOT_FOUND', 'Rental request was not found.');
      if (request.data.renterId !== input.renterId) throw new BookingCommandError('FORBIDDEN', 'You cannot release this payment window.');
      if (request.data.state !== 'ready_for_payment' || !request.data.intentId) {
        throw new BookingCommandError('INVALID_STATE_TRANSITION', 'This request has no active payment window to release.');
      }
      const intentRef = this.firestore.doc(`bookingIntents/${request.data.intentId}`);
      const blockRef = this.firestore.doc(`bookingBlocks/${request.data.intentId}`);
      const intentSnapshot = await transaction.get(intentRef);
      const blockSnapshot = await transaction.get(blockRef);
      const intent = intentSchema.safeParse(intentSnapshot.data());
      if (!intentSnapshot.exists || !intent.success || intent.data.rentalRequestId !== input.requestId || intent.data.state !== 'intent_created') {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Payment has already started or the hold no longer matches this request.');
      }
      const sentinelRef = this.firestore.doc(`vehicleAvailability/${request.data.vehicleId}`);
      const sentinelSnapshot = await transaction.get(sentinelRef);
      const rawVersion = sentinelSnapshot.exists ? sentinelSnapshot.data()?.version : 0;
      if (!Number.isSafeInteger(rawVersion) || rawVersion < 0) throw new BookingCommandError('FAILED_PRECONDITION', 'Availability version is invalid.');
      const nextVersion = request.data.version + 1;
      const result = releaseRentalRequestPaymentHoldResultSchema.parse({
        requestId: input.commandRequestId,
        result: { requestId: input.requestId, state: 'payment_window_expired', version: nextVersion, releasedAt: input.now.toISOString() },
      });
      if (blockSnapshot.exists) transaction.delete(blockRef);
      transaction.delete(intentRef);
      transaction.update(requestRef, {
        state: 'payment_window_expired', closedReason: 'renter_released', version: nextVersion,
        updatedAt: Timestamp.fromDate(input.now), paymentWindowClosedAt: Timestamp.fromDate(input.now),
      });
      transaction.set(sentinelRef, { vehicleId: request.data.vehicleId, version: rawVersion + 1, updatedAt: Timestamp.fromDate(input.now) }, { merge: true });
      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: input.renterId, actorType: 'renter', entityId: input.requestId, entityType: 'rentalRequest',
        eventType: 'rental_request.payment_hold_released', fromState: 'ready_for_payment', toState: 'payment_window_expired',
        requestId: input.commandRequestId, occurredAt: Timestamp.fromDate(input.now),
      });
      transaction.create(idempotencyRef, {
        actorId: input.renterId, commandName: 'releaseRentalRequestPaymentHold', requestHash: input.requestHash,
        result, createdAt: Timestamp.fromDate(input.now),
      });
      return result;
    });
  }

  async expirePaymentWindows(now: Date): Promise<{ scanned: number; expired: number }> {
    const snapshot = await this.firestore.collection('rentalRequests').where('state', '==', 'ready_for_payment').get();
    const expiredIds = snapshot.docs.filter((document) => {
      const value = rentalRequestSchema.safeParse(document.data());
      return value.success && value.data.holdExpiresAt && value.data.holdExpiresAt.toMillis() <= now.getTime();
    }).map((document) => document.id);
    let expired = 0;
    for (const requestId of expiredIds) {
      const changed = await this.firestore.runTransaction(async (transaction) => {
        const requestRef = this.firestore.doc(`rentalRequests/${requestId}`);
        const requestSnapshot = await transaction.get(requestRef);
        const request = rentalRequestSchema.safeParse(requestSnapshot.data());
        if (!requestSnapshot.exists || !request.success || request.data.state !== 'ready_for_payment' ||
          !request.data.holdExpiresAt || request.data.holdExpiresAt.toMillis() > now.getTime() || !request.data.intentId) return false;
        const intentRef = this.firestore.doc(`bookingIntents/${request.data.intentId}`);
        const blockRef = this.firestore.doc(`bookingBlocks/${request.data.intentId}`);
        const intentSnapshot = await transaction.get(intentRef);
        const blockSnapshot = await transaction.get(blockRef);
        const intent = intentSchema.safeParse(intentSnapshot.data());
        const sentinelRef = this.firestore.doc(`vehicleAvailability/${request.data.vehicleId}`);
        const sentinelSnapshot = await transaction.get(sentinelRef);
        const rawVersion = sentinelSnapshot.exists ? sentinelSnapshot.data()?.version : 0;
        if (!Number.isSafeInteger(rawVersion) || rawVersion < 0) throw new BookingCommandError('FAILED_PRECONDITION', 'Availability version is invalid.');
        if (blockSnapshot.exists) transaction.delete(blockRef);
        if (intentSnapshot.exists && intent.success && intent.data.state === 'intent_created') {
          transaction.update(intentRef, { state: 'expired', updatedAt: Timestamp.fromDate(now) });
        }
        transaction.update(requestRef, {
          state: 'payment_window_expired', closedReason: 'payment_window_elapsed',
          version: request.data.version + 1, paymentWindowClosedAt: Timestamp.fromDate(now), updatedAt: Timestamp.fromDate(now),
        });
        if (blockSnapshot.exists) {
          transaction.set(sentinelRef, { vehicleId: request.data.vehicleId, version: rawVersion + 1, updatedAt: Timestamp.fromDate(now) }, { merge: true });
        }
        transaction.create(this.firestore.collection('auditEvents').doc(), {
          actorId: 'system', actorType: 'system', entityId: requestId, entityType: 'rentalRequest',
          eventType: 'rental_request.payment_window_expired', fromState: 'ready_for_payment', toState: 'payment_window_expired',
          requestId: `expire_${requestId}`, occurredAt: Timestamp.fromDate(now),
        });
        return true;
      });
      if (changed) expired += 1;
    }
    return { scanned: snapshot.size, expired };
  }
}
