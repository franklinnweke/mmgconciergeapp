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
  openRentalRequestPaymentWindowResultSchema,
  rentalRequestServiceAreaSchema,
  releaseRentalRequestPaymentHoldResultSchema,
  type ApproveRentalRequestResult,
  type CreateRentalRequestResult,
  type DeclineRentalRequestResult,
  type OpenRentalRequestPaymentWindowResult,
  type ReleaseRentalRequestPaymentHoldResult,
} from '@mmg/contracts/rental-request';
import { calculateAuthoritativePrice, calculateChargedDays, intervalsOverlap } from '@mmg/domain';
import { FieldValue, getFirestore, Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { z } from 'zod';

import { buildBookingVehicleSnapshot } from './booking-vehicle-snapshot.js';
import { BookingCommandError } from './errors.js';
import type {
  CreateRentalRequestInput,
  DecideRentalRequestInput,
  OpenRentalRequestPaymentWindowInput,
  ReleaseRentalRequestPaymentHoldInput,
  RentalRequestRepository,
} from './rental-request-service.js';
import { googleCloudStoragePublicUrl, type PublicObjectUrl } from '../vehicle/renter-vehicle-view.js';
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
  requestId: z.string().min(1).max(128), renterId: z.string().min(1).max(128), ownerId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128), startDate: dateOnlySchema, endDate: dateOnlySchema,
  serviceAreaLabel: rentalRequestServiceAreaSchema,
  state: z.enum(['requested', 'approved', 'ready_for_payment', 'payment_in_progress', 'declined', 'payment_window_expired', 'confirmed', 'needs_attention']),
  version: z.number().int().positive(), estimatedPriceSnapshot: priceSnapshotSchema,
  authoritativePriceSnapshot: priceSnapshotSchema.optional(), vehicleSnapshot: renterVehicleSnapshotSchema,
  intentId: z.string().min(1).max(128).optional(), holdExpiresAt: z.instanceof(Timestamp).optional(),
  bookingId: z.string().min(1).max(128).optional(), createdAt: z.instanceof(Timestamp), updatedAt: z.instanceof(Timestamp),
}).passthrough();

const intentSchema = z.object({
  renterId: z.string().min(1).max(128), ownerId: z.string().min(1).max(128), vehicleId: z.string().min(1).max(128),
  rentalRequestId: z.string().min(1).max(128).optional(), state: z.enum(['intent_created', 'checkout_pending', 'paid', 'expired', 'failed', 'invalid', 'paid_conflict']),
  startDate: dateOnlySchema, endDate: dateOnlySchema,
}).passthrough();

const blockSchema = z.object({
  intentId: z.string().min(1).max(128).optional(), renterId: z.string().min(1).max(128).optional(), ownerId: z.string().min(1).max(128).optional(),
  vehicleId: z.string().min(1).max(128), startDate: dateOnlySchema, endDate: dateOnlySchema,
  state: z.enum(['held', 'paid', 'confirmed', 'owner_block']), expiresAt: z.instanceof(Timestamp).optional(),
}).passthrough();

type TrustedVehicle = { id: string; ownerId: string; ownerDailyRateKobo: number; vehicleSnapshot: RenterVehicleSnapshot };
type TrustedConfig = z.infer<typeof configSchema>;

function dateOnlyInLagos(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Africa/Lagos' }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function activeBlock(block: z.infer<typeof blockSchema>, now: Date): boolean {
  if (block.state !== 'held') return true;
  return Boolean(block.expiresAt && block.expiresAt.toMillis() > now.getTime());
}

function validSentinelVersion(snapshot: FirebaseFirestore.DocumentSnapshot): number {
  if (!snapshot.exists) throw new BookingCommandError('FAILED_PRECONDITION', 'Availability state is missing.');
  const value = snapshot.data()?.version;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new BookingCommandError('FAILED_PRECONDITION', 'Availability version is invalid.');
  }
  return value;
}

export class FirestoreRentalRequestRepository implements RentalRequestRepository {
  constructor(private readonly firestore: Firestore = getFirestore(), private readonly publicObjectUrl?: PublicObjectUrl) {}

  private async readVehicle(transaction: Transaction, vehicleId: string): Promise<TrustedVehicle> {
    const vehicleRef = this.firestore.doc(`vehicles/${vehicleId}`);
    const snapshot = await transaction.get(vehicleRef);
    const parsed = vehicleSchema.safeParse(snapshot.data());
    if (!snapshot.exists || !parsed.success) throw new BookingCommandError('NOT_FOUND', 'Vehicle is not available.');
    const data = parsed.data;
    const active = data.active === true || (data.moderationStatus === 'approved' && data.visibility === 'active' && data.discoverable === true);
    if (!active) throw new BookingCommandError('NOT_FOUND', 'Vehicle is not available.');

    const imageSnapshot = await transaction.get(vehicleRef.collection('images').where('status', '==', 'approved'));
    const images = imageSnapshot.docs.map((document) => ({ ...document.data(), imageId: typeof document.data().imageId === 'string' ? document.data().imageId : document.id } as VehicleImageRecord));
    const categoryLabel = data.categoryLabel ?? (data.category === 'executive_suv' ? 'Executive SUV' : data.category === 'executive_sedan' ? 'Executive Sedan' : data.category ? data.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Executive Vehicle');
    const storedImageUrl = data.imageUrl ?? ((data.primaryImagePath?.startsWith('http://') || data.primaryImagePath?.startsWith('https://')) ? data.primaryImagePath : undefined);
    const resolver = this.publicObjectUrl ?? ((publicPath: string) => googleCloudStoragePublicUrl(getStorage().bucket().name)(publicPath));
    const legacyFixture = data.active === true && data.moderationStatus === undefined && data.visibility === undefined && data.discoverable === undefined;
    const vehicleSnapshot = buildBookingVehicleSnapshot({
      displayName: data.displayName, areaLabel: data.areaLabel, categoryLabel,
      ...(data.imageKey ? { imageKey: data.imageKey } : {}), ...(storedImageUrl ? { imageUrl: storedImageUrl } : {}),
    }, images, resolver, { allowLegacyImageKeyFallback: legacyFixture });
    return { id: snapshot.id, ownerId: data.ownerId, ownerDailyRateKobo: data.ownerDailyRateKobo, vehicleSnapshot };
  }

  private async readConfig(transaction: Transaction): Promise<TrustedConfig> {
    const snapshot = await transaction.get(this.firestore.doc('systemConfig/booking'));
    const parsed = configSchema.safeParse(snapshot.data());
    if (!snapshot.exists || !parsed.success) throw new BookingCommandError('CONFIGURATION_UNAVAILABLE', 'Booking configuration is unavailable.');
    return parsed.data;
  }

  private price(vehicle: TrustedVehicle, config: TrustedConfig, startDate: string, endDate: string): PriceSnapshot {
    let chargedDays: number;
    try { chargedDays = calculateChargedDays(startDate, endDate); } catch { throw new BookingCommandError('INVALID_ARGUMENT', 'Return date must be after pickup date.'); }
    if (chargedDays < 1 || chargedDays > 30) throw new BookingCommandError('INVALID_ARGUMENT', 'Rental duration must be between 1 and 30 days.');
    try { return calculateAuthoritativePrice({ ownerDailyRateKobo: vehicle.ownerDailyRateKobo, chargedDays, ...config }); }
    catch { throw new BookingCommandError('FAILED_PRECONDITION', 'The current rental price is invalid.'); }
  }

  private writeStaffAudit(transaction: Transaction, actor: { uid: string; role?: string }, action: string, requestId: string, now: Date, details: Record<string, unknown> = {}): void {
    if (!actor.role) return;
    transaction.create(this.firestore.collection('adminAuditLogs').doc(), {
      actorUid: actor.uid, actorRole: actor.role, action, entityType: 'rentalRequest', entityId: requestId,
      occurredAt: Timestamp.fromDate(now), details,
    });
  }

  async createRequest(input: CreateRentalRequestInput): Promise<CreateRentalRequestResult> {
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const idempotency = await transaction.get(idempotencyRef);
      if (idempotency.exists) {
        const stored = idempotency.data();
        if (stored?.actorId !== input.renterId || stored?.requestHash !== input.requestHash) throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This request key was already used differently.');
        return createRentalRequestResultSchema.parse(stored.result);
      }
      if (input.data.startDate < dateOnlyInLagos(input.now)) throw new BookingCommandError('INVALID_ARGUMENT', 'Pickup date cannot be in the past.');
      const vehicle = await this.readVehicle(transaction, input.data.vehicleId);
      const config = await this.readConfig(transaction);
      const estimatedPriceSnapshot = this.price(vehicle, config, input.data.startDate, input.data.endDate);
      const result = createRentalRequestResultSchema.parse({ requestId: input.commandRequestId, result: {
        requestId: input.requestId, state: 'requested', startDate: input.data.startDate, endDate: input.data.endDate,
        serviceAreaLabel: input.data.serviceAreaLabel, estimatedPriceSnapshot, vehicleSnapshot: vehicle.vehicleSnapshot,
        version: 1, createdAt: input.now.toISOString(),
      }});
      transaction.create(this.firestore.doc(`rentalRequests/${input.requestId}`), {
        requestId: input.requestId, renterId: input.renterId, ownerId: vehicle.ownerId, vehicleId: vehicle.id,
        startDate: input.data.startDate, endDate: input.data.endDate, serviceAreaLabel: input.data.serviceAreaLabel,
        state: 'requested', version: 1, estimatedPriceSnapshot, vehicleSnapshot: vehicle.vehicleSnapshot,
        createdAt: Timestamp.fromDate(input.now), updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.create(this.firestore.doc(`rentalRequestContacts/${input.requestId}`), {
        requestId: input.requestId, renterId: input.renterId, contactPhone: input.data.contactPhone,
        createdAt: Timestamp.fromDate(input.now), updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: input.renterId, actorType: 'renter', entityId: input.requestId, entityType: 'rentalRequest',
        eventType: 'rental_request.created', fromState: null, toState: 'requested', requestId: input.commandRequestId,
        occurredAt: Timestamp.fromDate(input.now), details: { vehicleId: vehicle.id, startDate: input.data.startDate, endDate: input.data.endDate },
      });
      transaction.create(idempotencyRef, { actorId: input.renterId, commandName: 'createRentalRequest', requestHash: input.requestHash, result, createdAt: Timestamp.fromDate(input.now) });
      return result;
    });
  }

  async approveRequest(input: DecideRentalRequestInput): Promise<ApproveRentalRequestResult> {
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const replay = await transaction.get(idempotencyRef);
      if (replay.exists) {
        const stored = replay.data();
        if (stored?.actorId !== input.actor.uid || stored?.requestHash !== input.requestHash) throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This approval key was already used differently.');
        return approveRentalRequestResultSchema.parse(stored.result);
      }
      const ref = this.firestore.doc(`rentalRequests/${input.requestId}`);
      const snapshot = await transaction.get(ref);
      const parsed = rentalRequestSchema.safeParse(snapshot.data());
      if (!snapshot.exists || !parsed.success) throw new BookingCommandError('NOT_FOUND', 'Rental request was not found.');
      const request = parsed.data;
      if (request.ownerId !== input.actor.uid && !input.actor.isStaff) throw new BookingCommandError('FORBIDDEN', 'You cannot approve this rental request.');
      if (request.state !== 'requested' || request.version !== input.expectedVersion) throw new BookingCommandError('INVALID_STATE_TRANSITION', 'This rental request is no longer awaiting approval.');
      if (request.startDate < dateOnlyInLagos(input.now)) throw new BookingCommandError('FAILED_PRECONDITION', 'The requested pickup date has passed.');
      const vehicle = await this.readVehicle(transaction, request.vehicleId);
      if (vehicle.ownerId !== request.ownerId) throw new BookingCommandError('FAILED_PRECONDITION', 'Vehicle ownership changed.');
      const version = request.version + 1;
      const result = approveRentalRequestResultSchema.parse({ requestId: input.commandRequestId, result: { requestId: request.requestId, state: 'approved', version, approvedAt: input.now.toISOString() } });
      transaction.update(ref, { state: 'approved', version, approvedAt: Timestamp.fromDate(input.now), approvedBy: input.actor.uid, approvedByType: input.actor.isStaff ? 'staff' : 'owner', updatedAt: Timestamp.fromDate(input.now) });
      transaction.create(this.firestore.collection('auditEvents').doc(), { actorId: input.actor.uid, actorType: input.actor.isStaff ? 'staff' : 'owner', entityId: request.requestId, entityType: 'rentalRequest', eventType: 'rental_request.approved', fromState: 'requested', toState: 'approved', requestId: input.commandRequestId, occurredAt: Timestamp.fromDate(input.now) });
      this.writeStaffAudit(transaction, input.actor, 'rental_request.approve', request.requestId, input.now);
      transaction.create(idempotencyRef, { actorId: input.actor.uid, commandName: 'approveRentalRequest', requestHash: input.requestHash, result, createdAt: Timestamp.fromDate(input.now) });
      return result;
    });
  }

  async openPaymentWindow(input: OpenRentalRequestPaymentWindowInput): Promise<OpenRentalRequestPaymentWindowResult> {
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const replay = await transaction.get(idempotencyRef);
      if (replay.exists) {
        const stored = replay.data();
        if (stored?.actorId !== input.actor.uid || stored?.requestHash !== input.requestHash) throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This payment-window key was already used differently.');
        return openRentalRequestPaymentWindowResultSchema.parse(stored.result);
      }
      const requestRef = this.firestore.doc(`rentalRequests/${input.requestId}`);
      const requestSnapshot = await transaction.get(requestRef);
      const parsed = rentalRequestSchema.safeParse(requestSnapshot.data());
      if (!requestSnapshot.exists || !parsed.success) throw new BookingCommandError('NOT_FOUND', 'Rental request was not found.');
      const request = parsed.data;
      if (request.state !== 'approved' || request.version !== input.expectedVersion) throw new BookingCommandError('INVALID_STATE_TRANSITION', 'This request is not ready for concierge payment activation.');
      if (request.startDate < dateOnlyInLagos(input.now)) throw new BookingCommandError('FAILED_PRECONDITION', 'The requested pickup date has passed.');
      const vehicle = await this.readVehicle(transaction, request.vehicleId);
      if (vehicle.ownerId !== request.ownerId) throw new BookingCommandError('FAILED_PRECONDITION', 'Vehicle ownership changed.');
      const config = await this.readConfig(transaction);
      const priceSnapshot = this.price(vehicle, config, request.startDate, request.endDate);
      const sentinelRef = this.firestore.doc(`vehicleAvailability/${vehicle.id}`);
      const sentinelSnapshot = await transaction.get(sentinelRef);
      const availabilityVersion = validSentinelVersion(sentinelSnapshot);
      const candidates = await transaction.get(this.firestore.collection('bookingBlocks').where('vehicleId', '==', vehicle.id).where('startDate', '<', request.endDate));
      for (const document of candidates.docs) {
        const block = blockSchema.safeParse(document.data());
        if (!block.success) throw new BookingCommandError('FAILED_PRECONDITION', 'Availability data is invalid.');
        if (activeBlock(block.data, input.now) && intervalsOverlap(request, block.data)) throw new BookingCommandError('VEHICLE_UNAVAILABLE', 'These dates are no longer available.');
      }
      const version = request.version + 1;
      const result = openRentalRequestPaymentWindowResultSchema.parse({ requestId: input.commandRequestId, result: {
        requestId: request.requestId, state: 'ready_for_payment', version, intentId: input.intentId,
        holdExpiresAt: input.holdExpiresAt.toISOString(), authoritativePriceSnapshot: priceSnapshot, openedAt: input.now.toISOString(),
      }});
      transaction.create(this.firestore.doc(`bookingIntents/${input.intentId}`), {
        intentId: input.intentId, rentalRequestId: request.requestId, renterId: request.renterId, ownerId: request.ownerId,
        vehicleId: request.vehicleId, startDate: request.startDate, endDate: request.endDate, state: 'intent_created',
        priceSnapshot, vehicleSnapshot: request.vehicleSnapshot, createdAt: Timestamp.fromDate(input.now), updatedAt: Timestamp.fromDate(input.now), expiresAt: Timestamp.fromDate(input.holdExpiresAt),
      });
      transaction.create(this.firestore.doc(`bookingBlocks/${input.intentId}`), {
        intentId: input.intentId, rentalRequestId: request.requestId, renterId: request.renterId, ownerId: request.ownerId,
        vehicleId: request.vehicleId, startDate: request.startDate, endDate: request.endDate, state: 'held', version: 1,
        expiresAt: Timestamp.fromDate(input.holdExpiresAt), createdAt: Timestamp.fromDate(input.now), updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.update(requestRef, { state: 'ready_for_payment', version, intentId: input.intentId, authoritativePriceSnapshot: priceSnapshot, holdExpiresAt: Timestamp.fromDate(input.holdExpiresAt), paymentWindowOpenedAt: Timestamp.fromDate(input.now), paymentWindowOpenedBy: input.actor.uid, updatedAt: Timestamp.fromDate(input.now) });
      transaction.set(sentinelRef, { vehicleId: request.vehicleId, version: availabilityVersion + 1, updatedAt: Timestamp.fromDate(input.now) }, { merge: true });
      transaction.create(this.firestore.collection('auditEvents').doc(), { actorId: input.actor.uid, actorType: 'staff', entityId: request.requestId, entityType: 'rentalRequest', eventType: 'rental_request.payment_window_opened', fromState: 'approved', toState: 'ready_for_payment', requestId: input.commandRequestId, occurredAt: Timestamp.fromDate(input.now), details: { intentId: input.intentId, holdExpiresAt: input.holdExpiresAt.toISOString() } });
      this.writeStaffAudit(transaction, input.actor, 'rental_request.open_payment_window', request.requestId, input.now, { intentId: input.intentId });
      transaction.create(idempotencyRef, { actorId: input.actor.uid, commandName: 'openRentalRequestPaymentWindow', requestHash: input.requestHash, result, createdAt: Timestamp.fromDate(input.now) });
      return result;
    });
  }

  async declineRequest(input: DecideRentalRequestInput): Promise<DeclineRentalRequestResult> {
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const replay = await transaction.get(idempotencyRef);
      if (replay.exists) {
        const stored = replay.data();
        if (stored?.actorId !== input.actor.uid || stored?.requestHash !== input.requestHash) throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This decline key was already used differently.');
        return declineRentalRequestResultSchema.parse(stored.result);
      }
      const ref = this.firestore.doc(`rentalRequests/${input.requestId}`);
      const snapshot = await transaction.get(ref);
      const parsed = rentalRequestSchema.safeParse(snapshot.data());
      if (!snapshot.exists || !parsed.success) throw new BookingCommandError('NOT_FOUND', 'Rental request was not found.');
      const request = parsed.data;
      if (request.ownerId !== input.actor.uid && !input.actor.isStaff) throw new BookingCommandError('FORBIDDEN', 'You cannot decline this rental request.');
      if ((request.state !== 'requested' && request.state !== 'approved') || request.version !== input.expectedVersion) throw new BookingCommandError('INVALID_STATE_TRANSITION', 'This rental request cannot be declined now.');
      const version = request.version + 1;
      const result = declineRentalRequestResultSchema.parse({ requestId: input.commandRequestId, result: { requestId: request.requestId, state: 'declined', version, declinedAt: input.now.toISOString() } });
      transaction.update(ref, { state: 'declined', version, declinedAt: Timestamp.fromDate(input.now), declinedBy: input.actor.uid, ...(input.reason ? { declineReason: input.reason } : {}), updatedAt: Timestamp.fromDate(input.now) });
      transaction.create(this.firestore.collection('auditEvents').doc(), { actorId: input.actor.uid, actorType: input.actor.isStaff ? 'staff' : 'owner', entityId: request.requestId, entityType: 'rentalRequest', eventType: 'rental_request.declined', fromState: request.state, toState: 'declined', requestId: input.commandRequestId, occurredAt: Timestamp.fromDate(input.now), ...(input.reason ? { details: { reason: input.reason } } : {}) });
      this.writeStaffAudit(transaction, input.actor, 'rental_request.decline', request.requestId, input.now, input.reason ? { reason: input.reason } : {});
      transaction.create(idempotencyRef, { actorId: input.actor.uid, commandName: 'declineRentalRequest', requestHash: input.requestHash, result, createdAt: Timestamp.fromDate(input.now) });
      return result;
    });
  }

  private async releaseReadyRequest(transaction: Transaction, request: z.infer<typeof rentalRequestSchema>, now: Date, actorId: string, actorType: 'renter' | 'system', commandRequestId: string): Promise<number> {
    if (!request.intentId) throw new BookingCommandError('FAILED_PRECONDITION', 'Payment-window intent is missing.');
    const intentRef = this.firestore.doc(`bookingIntents/${request.intentId}`);
    const blockRef = this.firestore.doc(`bookingBlocks/${request.intentId}`);
    const sentinelRef = this.firestore.doc(`vehicleAvailability/${request.vehicleId}`);
    const [intentSnapshot, blockSnapshot, sentinelSnapshot] = await Promise.all([
      transaction.get(intentRef), transaction.get(blockRef), transaction.get(sentinelRef),
    ]);
    const intent = intentSchema.safeParse(intentSnapshot.data());
    const block = blockSchema.safeParse(blockSnapshot.data());
    if (!intentSnapshot.exists || !intent.success || intent.data.state !== 'intent_created' || intent.data.rentalRequestId !== request.requestId || intent.data.renterId !== request.renterId || intent.data.ownerId !== request.ownerId || intent.data.vehicleId !== request.vehicleId || intent.data.startDate !== request.startDate || intent.data.endDate !== request.endDate) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Payment-window intent is not safely releasable.');
    }
    if (!blockSnapshot.exists || !block.success || block.data.state !== 'held' || block.data.intentId !== request.intentId || block.data.renterId !== request.renterId || block.data.ownerId !== request.ownerId || block.data.vehicleId !== request.vehicleId || block.data.startDate !== request.startDate || block.data.endDate !== request.endDate) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Payment-window availability block is not safely releasable.');
    }
    const availabilityVersion = validSentinelVersion(sentinelSnapshot);
    transaction.delete(blockRef);
    transaction.update(intentRef, { state: 'expired', expiredAt: Timestamp.fromDate(now), updatedAt: Timestamp.fromDate(now) });
    transaction.set(sentinelRef, { vehicleId: request.vehicleId, version: availabilityVersion + 1, updatedAt: Timestamp.fromDate(now) }, { merge: true });
    transaction.create(this.firestore.collection('auditEvents').doc(), { actorId, actorType, entityId: request.requestId, entityType: 'rentalRequest', eventType: 'rental_request.payment_window_released', fromState: 'ready_for_payment', toState: 'payment_window_expired', requestId: commandRequestId, occurredAt: Timestamp.fromDate(now), details: { intentId: request.intentId } });
    return availabilityVersion + 1;
  }

  async releasePaymentHold(input: ReleaseRentalRequestPaymentHoldInput): Promise<ReleaseRentalRequestPaymentHoldResult> {
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.doc(`idempotencyKeys/${input.idempotencyDocumentId}`);
      const replay = await transaction.get(idempotencyRef);
      if (replay.exists) {
        const stored = replay.data();
        if (stored?.actorId !== input.renterId || stored?.requestHash !== input.requestHash) throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This release key was already used differently.');
        return releaseRentalRequestPaymentHoldResultSchema.parse(stored.result);
      }
      const ref = this.firestore.doc(`rentalRequests/${input.requestId}`);
      const snapshot = await transaction.get(ref);
      const parsed = rentalRequestSchema.safeParse(snapshot.data());
      if (!snapshot.exists || !parsed.success) throw new BookingCommandError('NOT_FOUND', 'Rental request was not found.');
      const request = parsed.data;
      if (request.renterId !== input.renterId) throw new BookingCommandError('FORBIDDEN', 'You cannot release this payment window.');
      if (request.state !== 'ready_for_payment') throw new BookingCommandError('INVALID_STATE_TRANSITION', 'This payment window cannot be released now.');
      await this.releaseReadyRequest(transaction, request, input.now, input.renterId, 'renter', input.commandRequestId);
      const version = request.version + 1;
      const result = releaseRentalRequestPaymentHoldResultSchema.parse({ requestId: input.commandRequestId, result: { requestId: request.requestId, state: 'payment_window_expired', version, releasedAt: input.now.toISOString() } });
      transaction.update(ref, { state: 'payment_window_expired', version, releasedAt: Timestamp.fromDate(input.now), holdExpiresAt: FieldValue.delete(), updatedAt: Timestamp.fromDate(input.now) });
      transaction.create(idempotencyRef, { actorId: input.renterId, commandName: 'releaseRentalRequestPaymentHold', requestHash: input.requestHash, result, createdAt: Timestamp.fromDate(input.now) });
      return result;
    });
  }

  async expirePaymentWindows(now: Date): Promise<{ scanned: number; expired: number; protected: number; invalid: number }> {
    const snapshot = await this.firestore.collection('rentalRequests').where('state', '==', 'ready_for_payment').where('holdExpiresAt', '<=', Timestamp.fromDate(now)).limit(100).get();
    let expired = 0; let protectedCount = 0; let invalid = 0;
    for (const document of snapshot.docs) {
      try {
        const outcome = await this.firestore.runTransaction(async (transaction) => {
          const currentSnapshot = await transaction.get(document.ref);
          const parsed = rentalRequestSchema.safeParse(currentSnapshot.data());
          if (!currentSnapshot.exists || !parsed.success || parsed.data.state !== 'ready_for_payment') return 'protected' as const;
          const request = parsed.data;
          if (!request.holdExpiresAt || request.holdExpiresAt.toMillis() > now.getTime()) return 'protected' as const;
          if (!request.intentId) throw new BookingCommandError('FAILED_PRECONDITION', 'Payment-window intent is missing.');
          const intentSnapshot = await transaction.get(this.firestore.doc(`bookingIntents/${request.intentId}`));
          const intent = intentSchema.safeParse(intentSnapshot.data());
          if (!intentSnapshot.exists || !intent.success) throw new BookingCommandError('FAILED_PRECONDITION', 'Payment-window intent is invalid.');
          // Payment initialization moves the intent to checkout_pending before any provider call.
          // Never release inventory underneath an in-flight or completed payment.
          if (intent.data.state !== 'intent_created') return 'protected' as const;
          await this.releaseReadyRequest(transaction, request, now, 'system', 'payment-window-expiry');
          transaction.update(document.ref, { state: 'payment_window_expired', version: request.version + 1, releasedAt: Timestamp.fromDate(now), holdExpiresAt: FieldValue.delete(), updatedAt: Timestamp.fromDate(now) });
          return 'expired' as const;
        });
        if (outcome === 'expired') expired += 1; else protectedCount += 1;
      } catch { invalid += 1; }
    }
    return { scanned: snapshot.size, expired, protected: protectedCount, invalid };
  }
}
