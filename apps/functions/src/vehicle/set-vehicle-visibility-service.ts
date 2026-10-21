import { createHash, randomUUID } from 'node:crypto';

import {
  CommandError,
  setVehicleVisibilityCommandSchema,
  setVehicleVisibilityResultSchema,
  type SetVehicleVisibilityCommand,
  type SetVehicleVisibilityResult,
} from '@mmg/contracts';
import {
  canTransitionVehicleVisibility,
  ownerMayCreateVehicle,
  ownerMayManageVehicle,
  resolveVehicleDiscoveryLocation,
} from '@mmg/domain';

import {
  applyPublication,
  contentTypesForImages,
  type PublicationOutcome,
} from './image-promotion.js';
import type {
  VehicleAuditEvent,
  VehicleImageRecord,
  VehiclePrivateRecord,
  VehicleRecord,
  VehicleRepository,
} from './vehicle-repository.js';
import type { VehicleStorageGateway } from './vehicle-storage-gateway.js';
import { isRenterVehicleDetailsReady } from './renter-vehicle-view.js';

/**
 * Owner-driven visibility changes, and the publication that follows them.
 *
 * Same three-step shape as moderation review, for the same reason: the record
 * commits first, the bytes move second, the public paths are recorded third.
 * Pausing or deleting therefore stops serving photos, and activating an approved
 * listing publishes them — which also repairs a listing whose earlier approval
 * committed but whose publication did not.
 */
export type SetVehicleVisibilityDependencies = {
  repository: VehicleRepository;
  storageGateway: VehicleStorageGateway;
  now?: () => Date;
  createRequestId?: () => string;
  onPromotionFailure?: (error: unknown, context: { vehicleId: string; requestId: string }) => void;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function setVehicleVisibility(
  untrustedCommand: unknown,
  actorUid: string,
  dependencies: SetVehicleVisibilityDependencies,
): Promise<SetVehicleVisibilityResult> {
  const parsed = setVehicleVisibilityCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new CommandError('INVALID_ARGUMENT', 'Set vehicle visibility command data is invalid.');
  }
  const command: SetVehicleVisibilityCommand = parsed.data;

  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocumentId = stableHash({
    actorId: actorUid,
    commandName: 'setVehicleVisibility',
    idempotencyKey: command.idempotencyKey,
  });

  type VisibilityOutcome = Omit<PublicationOutcome, 'images'> & {
    payload: SetVehicleVisibilityResult;
    replayed: boolean;
    /** Full records — `VehicleImageRecord` already satisfies `PromotableImage`. */
    images: VehicleImageRecord[];
  };

  // ── Step 1: commit the visibility change ──

  const outcome = await dependencies.repository.runTransaction<VisibilityOutcome>(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocumentId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new CommandError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }
      return {
        payload: setVehicleVisibilityResultSchema.parse(replay.result),
        replayed: true,
        servable: false,
        moderationStatus: '',
        visibility: '',
        images: [],
      };
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

    if (!canTransitionVehicleVisibility(vehicle.visibility, command.data.visibility)) {
      throw new CommandError(
        'FAILED_PRECONDITION',
        `Cannot change visibility from "${vehicle.visibility}" to "${command.data.visibility}".`,
      );
    }

    if (command.data.visibility === 'active' && vehicle.moderationStatus !== 'approved') {
      throw new CommandError(
        'FAILED_PRECONDITION',
        'Only approved vehicles can be activated for discovery.',
      );
    }

    const discoveryLocation = resolveVehicleDiscoveryLocation(vehicle);
    if (command.data.visibility === 'active' && !isRenterVehicleDetailsReady(vehicle)) {
      throw new CommandError('FAILED_PRECONDITION', 'Complete the vehicle details and a valid Lagos base area before activating the listing.', {
        reason: 'listing_incomplete',
      });
    }

    if (command.data.visibility === 'deleted') {
      const privateDoc = await transaction.getVehiclePrivate(command.data.vehicleId);
      if (privateDoc) {
        const tombstonedPrivate: VehiclePrivateRecord = {
          ...privateDoc,
          plate: null,
          baseAddress: null,
          exactLatitude: null,
          exactLongitude: null,
          documentPaths: [],
          updatedAt: now.toISOString(),
        };
        transaction.setVehiclePrivate(command.data.vehicleId, tombstonedPrivate, now);
      }
    }

    // `discoverable` is not granted here. Publication decides it in step 3, once
    // the public objects for this listing actually exist.
    const images = await transaction.getVehicleImages(command.data.vehicleId);
    const servable =
      vehicle.moderationStatus === 'approved' && command.data.visibility === 'active';

    const nextVersion = vehicle.version + 1;
    const updatedVehicle: VehicleRecord = {
      ...vehicle,
      visibility: command.data.visibility,
      approxLatitude: discoveryLocation?.lat ?? vehicle.approxLatitude,
      approxLongitude: discoveryLocation?.lng ?? vehicle.approxLongitude,
      discoverable: false,
      updatedAt: now.toISOString(),
      version: nextVersion,
    };

    transaction.setVehicle(command.data.vehicleId, updatedVehicle, now);

    const auditEvent: VehicleAuditEvent = {
      actorId: actorUid,
      actorType: 'owner',
      entityId: command.data.vehicleId,
      entityType: 'vehicle',
      eventType: 'vehicle.visibility_changed',
      fromState: vehicle.visibility,
      toState: command.data.visibility,
      requestId,
      occurredAt: now,
      details: {
        fromVisibility: vehicle.visibility,
        toVisibility: command.data.visibility,
        servable,
      },
    };

    transaction.createAuditEvent(auditEvent);

    // Reports the discoverability this change is *headed for*, which is what an
    // owner needs to see. Step 3 withholds it if nothing could be published.
    const resultPayload: SetVehicleVisibilityResult = {
      requestId,
      result: {
        vehicleId: command.data.vehicleId,
        visibility: command.data.visibility,
        discoverable: servable,
        version: nextVersion,
      },
    };

    transaction.saveIdempotency(
      idempotencyDocumentId,
      {
        requestHash,
        commandName: 'setVehicleVisibility',
        actorId: actorUid,
        result: resultPayload,
      },
      now,
    );

    return {
      payload: resultPayload,
      replayed: false,
      servable,
      moderationStatus: vehicle.moderationStatus,
      visibility: command.data.visibility,
      images,
    };
  });

  if (outcome.replayed) {
    return outcome.payload;
  }

  // ── Steps 2 and 3: move the bytes, then record where they landed ──
  //
  // Unconditional. A `if (storageGateway)` guard here would turn a missing
  // injection into a silent skip: pausing a listing would leave its photos
  // world-readable and record nothing about it.
  await applyPublication({
    vehicleId: command.data.vehicleId,
    actorId: actorUid,
    actorType: 'owner',
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
