import { createHash, randomUUID } from 'node:crypto';

import {
  CommandError,
  LAGOS_BBOX,
  reviewVehicleCommandSchema,
  reviewVehicleResultSchema,
  VEHICLE_REVIEW_CHECKLIST_KEYS,
  type ReviewVehicleCommand,
  type ReviewVehicleResult,
} from '@mmg/contracts';
import {
  canTransitionVehicleModeration,
  roundToApproxLatLng,
  vehicleReviewTargetStatus,
} from '@mmg/domain';

import { applyPublication, contentTypesForImages } from './image-promotion.js';
import type {
  VehicleAdminAuditLog,
  VehicleAuditEvent,
  VehicleImageRecord,
  VehiclePrivateRecord,
  VehicleRecord,
  VehicleRepository,
} from './vehicle-repository.js';
import type { VehicleStorageGateway } from './vehicle-storage-gateway.js';

/**
 * Vehicle moderation decisions, and the publication that follows them.
 *
 * The decision and the bytes cannot share a transaction — Cloud Storage is not
 * transactional — so this runs in three steps, in this order for these reasons:
 *
 *   1. Commit the decision, with the listing NOT yet discoverable.
 *   2. Copy approved variants into the public prefix (or delete them on the way
 *      down).
 *   3. Commit the public paths and flip discoverability.
 *
 * Publishing before step 1 would expose photos of a vehicle whose approval might
 * not commit, defeating the moderation gate. Stamping paths before step 2 would
 * leave records naming objects that do not exist. Ordering it this way means the
 * only bad outcome is an approved listing that is not yet live — visibly
 * incomplete rather than quietly wrong.
 *
 * Consequently a storage failure never fails the decision: the moderator's
 * ruling is already durable and reporting it as failed would be false. It is
 * recorded as an audit event and surfaced through `onPromotionFailure`.
 */
export type ReviewVehicleDependencies = {
  repository: VehicleRepository;
  storageGateway: VehicleStorageGateway;
  now?: () => Date;
  createRequestId?: () => string;
  /** Called when the decision committed but publication did not. */
  onPromotionFailure?: (error: unknown, context: { vehicleId: string; requestId: string }) => void;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** What step 1 hands to steps 2 and 3. */
type DecisionOutcome = {
  payload: ReviewVehicleResult;
  replayed: boolean;
  /** approved && active — see `image-promotion.ts` for why it is one flag. */
  servable: boolean;
  moderationStatus: string;
  visibility: string;
  /** Full records — `VehicleImageRecord` already satisfies `PromotableImage`. */
  images: VehicleImageRecord[];
};

export async function reviewVehicle(
  untrustedCommand: unknown,
  actor: { uid: string; role: 'vehicle_admin' | 'super_admin' },
  dependencies: ReviewVehicleDependencies,
): Promise<ReviewVehicleResult> {
  const parsed = reviewVehicleCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new CommandError('INVALID_ARGUMENT', 'Review vehicle command data is invalid.');
  }
  const command: ReviewVehicleCommand = parsed.data;

  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocumentId = stableHash({
    actorId: actor.uid,
    commandName: 'reviewVehicle',
    idempotencyKey: command.idempotencyKey,
  });

  // ── Step 1: commit the decision ──

  const outcome = await dependencies.repository.runTransaction<DecisionOutcome>(
    async (transaction) => {
      const replay = await transaction.getIdempotency(idempotencyDocumentId);
      if (replay) {
        if (replay.requestHash !== requestHash) {
          throw new CommandError(
            'IDEMPOTENCY_CONFLICT',
            'This idempotency key was already used for a different request.',
          );
        }
        return {
          payload: reviewVehicleResultSchema.parse(replay.result),
          replayed: true,
          servable: false,
          moderationStatus: '',
          visibility: '',
          images: [],
        };
      }

      const vehicle = await transaction.getVehicle(command.data.vehicleId);
      if (!vehicle) {
        throw new CommandError('NOT_FOUND', 'Vehicle listing not found.');
      }

      if (vehicle.version !== command.data.expectedVersion) {
        throw new CommandError(
          'FAILED_PRECONDITION',
          'Vehicle was modified by another operation. Please refresh.',
        );
      }

      const targetStatus = vehicleReviewTargetStatus(command.data.decision);
      if (!canTransitionVehicleModeration(vehicle.moderationStatus, targetStatus)) {
        throw new CommandError(
          'FAILED_PRECONDITION',
          `Cannot transition vehicle from "${vehicle.moderationStatus}" to "${targetStatus}".`,
        );
      }

      const privateDoc = await transaction.getVehiclePrivate(command.data.vehicleId);
      if (!privateDoc) {
        throw new CommandError('NOT_FOUND', 'Vehicle private details not found.');
      }

      let nextVisibility = vehicle.visibility;
      let nextLastDecisionReason = vehicle.lastDecisionReason;
      let approxCoords = {
        lat: vehicle.approxLatitude,
        lng: vehicle.approxLongitude,
      };

      if (command.data.decision === 'approve') {
        const checklist = command.data.checklist || {};
        const allChecked = VEHICLE_REVIEW_CHECKLIST_KEYS.every(
          (key) => checklist[key as keyof typeof checklist] === true,
        );
        if (!allChecked) {
          throw new CommandError(
            'FAILED_PRECONDITION',
            'All verification checklist items must be confirmed before approval.',
          );
        }

        if (command.data.exactBaseOverride) {
          const { latitude, longitude, placeId } = command.data.exactBaseOverride;
          if (
            latitude < LAGOS_BBOX.minLatitude ||
            latitude > LAGOS_BBOX.maxLatitude ||
            longitude < LAGOS_BBOX.minLongitude ||
            longitude > LAGOS_BBOX.maxLongitude
          ) {
            throw new CommandError(
              'INVALID_ARGUMENT',
              'Override location is outside Lagos bounds.',
            );
          }
          const rounded = roundToApproxLatLng(latitude, longitude);
          approxCoords = { lat: rounded.lat, lng: rounded.lng };

          const updatedPrivate: VehiclePrivateRecord = {
            ...privateDoc,
            exactLatitude: latitude,
            exactLongitude: longitude,
            placeId: placeId ?? privateDoc.placeId,
            updatedAt: now.toISOString(),
          };
          transaction.setVehiclePrivate(command.data.vehicleId, updatedPrivate, now);
        }
      } else if (command.data.decision === 'reject') {
        if (!command.data.reason) {
          throw new CommandError('INVALID_ARGUMENT', 'Rejection reason is required.');
        }
        nextLastDecisionReason = command.data.reason;
        nextVisibility = 'paused';
      } else if (command.data.decision === 'suspend') {
        if (!command.data.reason) {
          throw new CommandError('INVALID_ARGUMENT', 'Suspension reason is required.');
        }
        nextLastDecisionReason = command.data.reason;
        nextVisibility = 'paused';
      } else if (command.data.decision === 'restore') {
        nextVisibility = 'paused';
      }

      // Image statuses move with the decision. Public paths do not: those are
      // stamped in step 3, once the objects behind them exist.
      const images = await transaction.getVehicleImages(command.data.vehicleId);
      const nextImageStatus =
        targetStatus === 'approved' ? 'approved' : targetStatus === 'rejected' ? 'rejected' : null;

      for (const image of images) {
        if (nextImageStatus && image.status !== nextImageStatus && image.status !== 'rejected') {
          transaction.setVehicleImage(
            command.data.vehicleId,
            image.imageId,
            { ...image, status: nextImageStatus, updatedAt: now.toISOString() },
            now,
          );
        }
      }

      // Never discoverable off the back of step 1 alone — there is nothing
      // public to serve yet. Step 3 grants it once the bytes are in place.
      const nextVersion = vehicle.version + 1;
      const updatedVehicle: VehicleRecord = {
        ...vehicle,
        moderationStatus: targetStatus,
        visibility: nextVisibility,
        discoverable: false,
        lastDecisionReason: nextLastDecisionReason,
        approxLatitude: approxCoords.lat,
        approxLongitude: approxCoords.lng,
        updatedAt: now.toISOString(),
        version: nextVersion,
      };

      transaction.setVehicle(command.data.vehicleId, updatedVehicle, now);

      const beforeHash = stableHash({
        moderationStatus: vehicle.moderationStatus,
        visibility: vehicle.visibility,
        ownerDailyRateKobo: vehicle.ownerDailyRateKobo,
        version: vehicle.version,
      });

      const afterHash = stableHash({
        moderationStatus: targetStatus,
        visibility: nextVisibility,
        ownerDailyRateKobo: vehicle.ownerDailyRateKobo,
        version: nextVersion,
      });

      if (transaction.createAdminAuditLog) {
        const adminLog: VehicleAdminAuditLog = {
          actorId: actor.uid,
          role: actor.role,
          action: `vehicle.decided_${command.data.decision}`,
          target: `vehicles/${command.data.vehicleId}`,
          beforeHash,
          afterHash,
          reason: command.data.reason ?? null,
          requestId,
          createdAt: now,
        };
        transaction.createAdminAuditLog(adminLog, now);
      }

      const auditEvent: VehicleAuditEvent = {
        actorId: actor.uid,
        actorType: actor.role,
        entityId: command.data.vehicleId,
        entityType: 'vehicle',
        eventType: 'vehicle.decided',
        fromState: vehicle.moderationStatus,
        toState: targetStatus,
        requestId,
        occurredAt: now,
        details: {
          decision: command.data.decision,
          reason: command.data.reason ?? null,
        },
      };

      transaction.createAuditEvent(auditEvent);

      const resultPayload: ReviewVehicleResult = {
        requestId,
        result: {
          vehicleId: command.data.vehicleId,
          revisionId: null,
          fromStatus: vehicle.moderationStatus,
          toStatus: targetStatus,
          visibility: nextVisibility,
          decidedAt: now.toISOString(),
          version: nextVersion,
        },
      };

      transaction.saveIdempotency(
        idempotencyDocumentId,
        {
          requestHash,
          commandName: 'reviewVehicle',
          actorId: actor.uid,
          result: resultPayload,
        },
        now,
      );

      return {
        payload: resultPayload,
        replayed: false,
        servable: targetStatus === 'approved' && nextVisibility === 'active',
        moderationStatus: targetStatus,
        visibility: nextVisibility,
        images: images.map((image) => ({
          ...image,
          status: nextImageStatus && image.status !== 'rejected' ? nextImageStatus : image.status,
        })),
      };
    },
  );

  if (outcome.replayed) {
    return outcome.payload;
  }

  // ── Steps 2 and 3: move the bytes, then record where they landed ──

  await applyPublication({
    vehicleId: command.data.vehicleId,
    actorId: actor.uid,
    actorType: actor.role,
    requestId,
    now,
    outcome,
    repository: dependencies.repository,
    storageGateway: dependencies.storageGateway,
    onPromotionFailure: dependencies.onPromotionFailure,
    contentTypesByImageId: contentTypesForImages(outcome.images),
  });

  return outcome.payload;
}
