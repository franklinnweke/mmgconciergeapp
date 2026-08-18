import { createHash, randomUUID } from 'node:crypto';

import {
  CommandError,
  LAGOS_BBOX,
  MAX_OWNER_DAILY_RATE_KOBO,
  MIN_OWNER_DAILY_RATE_KOBO,
  nigerianPlateSchema,
  submitVehicleForReviewCommandSchema,
  submitVehicleForReviewResultSchema,
  type SubmitVehicleForReviewCommand,
  type SubmitVehicleForReviewResult,
} from '@mmg/contracts';
import {
  canTransitionVehicleModeration,
  ownerMayCreateVehicle,
  ownerMayManageVehicle,
} from '@mmg/domain';

import type {
  VehicleAuditEvent,
  VehicleNotificationOutbox,
  VehicleRecord,
  VehicleRepository,
} from './vehicle-repository.js';

export type SubmitVehicleForReviewDependencies = {
  repository: VehicleRepository;
  now?: () => Date;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function submitVehicleForReview(
  untrustedCommand: unknown,
  actorUid: string,
  dependencies: SubmitVehicleForReviewDependencies,
): Promise<SubmitVehicleForReviewResult> {
  const parsed = submitVehicleForReviewCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new CommandError('INVALID_ARGUMENT', 'Submit vehicle command data is invalid.');
  }
  const command: SubmitVehicleForReviewCommand = parsed.data;

  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocumentId = stableHash({
    actorId: actorUid,
    commandName: 'submitVehicleForReview',
    idempotencyKey: command.idempotencyKey,
  });

  return dependencies.repository.runTransaction(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocumentId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new CommandError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }
      return submitVehicleForReviewResultSchema.parse(replay.result);
    }

    const profile = await transaction.getOwnerProfile(actorUid);
    if (!profile || !ownerMayCreateVehicle(profile.verificationStatus)) {
      throw new CommandError(
        'FORBIDDEN',
        'Your owner account must be approved before managing vehicles.',
        { reason: 'not_approved_owner' },
      );
    }

    const vehicle = await transaction.getVehicle(command.data.vehicleId);
    if (!vehicle) {
      throw new CommandError('NOT_FOUND', 'Vehicle listing not found.');
    }

    if (!ownerMayManageVehicle(vehicle.ownerId, actorUid)) {
      throw new CommandError('FORBIDDEN', 'You can only manage your own vehicles.', {
        reason: 'not_vehicle_owner',
      });
    }

    if (vehicle.version !== command.data.expectedVersion) {
      throw new CommandError(
        'FAILED_PRECONDITION',
        'Vehicle was modified by another operation. Please refresh.',
      );
    }

    if (!canTransitionVehicleModeration(vehicle.moderationStatus, 'pending_review')) {
      throw new CommandError(
        'FAILED_PRECONDITION',
        `Cannot submit vehicle for review from status "${vehicle.moderationStatus}".`,
      );
    }

    const privateDoc = await transaction.getVehiclePrivate(command.data.vehicleId);
    if (!privateDoc) {
      throw new CommandError('NOT_FOUND', 'Vehicle private details not found.');
    }

    // ── Completeness validation ──
    const hasBasicSpecs =
      Boolean(vehicle.make) &&
      Boolean(vehicle.model) &&
      vehicle.year !== null &&
      Boolean(vehicle.colour) &&
      Boolean(vehicle.category) &&
      vehicle.seats !== null;

    const hasValidDescription =
      typeof vehicle.description === 'string' &&
      vehicle.description.trim().length >= 40 &&
      vehicle.description.trim().length <= 2000;

    const hasValidRate =
      vehicle.ownerDailyRateKobo !== null &&
      vehicle.ownerDailyRateKobo >= MIN_OWNER_DAILY_RATE_KOBO &&
      vehicle.ownerDailyRateKobo <= MAX_OWNER_DAILY_RATE_KOBO;

    const hasValidArea = Boolean(vehicle.areaLabel);

    const hasValidPlate =
      typeof privateDoc.plate === 'string' &&
      nigerianPlateSchema.safeParse(privateDoc.plate).success;

    const baseAddress = privateDoc.baseAddress as Record<string, unknown> | null;
    const hasValidAddress =
      typeof baseAddress?.line1 === 'string' &&
      baseAddress.line1.trim().length >= 5 &&
      typeof baseAddress?.city === 'string';

    const hasValidCoords =
      privateDoc.exactLatitude === null && privateDoc.exactLongitude === null
        ? true
        : privateDoc.exactLatitude !== null &&
          privateDoc.exactLongitude !== null &&
          privateDoc.exactLatitude >= LAGOS_BBOX.minLatitude &&
          privateDoc.exactLatitude <= LAGOS_BBOX.maxLatitude &&
          privateDoc.exactLongitude >= LAGOS_BBOX.minLongitude &&
          privateDoc.exactLongitude <= LAGOS_BBOX.maxLongitude;

    const images = await transaction.getVehicleImages(command.data.vehicleId);
    const hasValidImages =
      images.length >= 1 &&
      images.length <= 20 &&
      images.every((img) => img.status === 'processed');

    if (
      !hasBasicSpecs ||
      !hasValidDescription ||
      !hasValidRate ||
      !hasValidArea ||
      !hasValidPlate ||
      !hasValidAddress ||
      !hasValidCoords ||
      !hasValidImages
    ) {
      throw new CommandError(
        'FAILED_PRECONDITION',
        'Complete all required vehicle details, images, and Lagos base location before submitting.',
        { reason: 'listing_incomplete' },
      );
    }

    const nextVersion = vehicle.version + 1;
    const updatedVehicle: VehicleRecord = {
      ...vehicle,
      moderationStatus: 'pending_review',
      updatedAt: now.toISOString(),
      version: nextVersion,
    };

    transaction.setVehicle(command.data.vehicleId, updatedVehicle, now);

    const auditEvent: VehicleAuditEvent = {
      actorId: actorUid,
      actorType: 'owner',
      entityId: command.data.vehicleId,
      entityType: 'vehicle',
      eventType: 'vehicle.submitted',
      fromState: vehicle.moderationStatus,
      toState: 'pending_review',
      requestId,
      occurredAt: now,
    };

    transaction.createAuditEvent(auditEvent);

    if (transaction.createNotificationOutbox) {
      const outboxRecord: VehicleNotificationOutbox = {
        eventType: 'vehicle.submitted',
        ownerId: actorUid,
        status: 'unavailable',
        reason: 'fcm_not_in_sequence_2_3',
        createdAt: now,
      };
      transaction.createNotificationOutbox(outboxRecord, now);
    }

    const resultPayload: SubmitVehicleForReviewResult = {
      requestId,
      result: {
        vehicleId: command.data.vehicleId,
        moderationStatus: 'pending_review',
        submittedAt: now.toISOString(),
        version: nextVersion,
      },
    };

    transaction.saveIdempotency(
      idempotencyDocumentId,
      {
        requestHash,
        commandName: 'submitVehicleForReview',
        actorId: actorUid,
        result: resultPayload,
      },
      now,
    );

    return resultPayload;
  });
}
