import { createHash, randomUUID } from 'node:crypto';

import {
  CommandError,
  createVehicleDraftDataSchema,
  idempotencyKeySchema,
  schemaVersionSchema,
} from '@mmg/contracts';
import {
  ownerMayCreateVehicle,
  ownerMayManageVehicle,
  roundToApproxLatLng,
} from '@mmg/domain';
import { z } from 'zod';

import { resolvePrimaryImagePath } from './image-processing.js';
import type {
  VehicleAuditEvent,
  VehicleRecord,
  VehicleRepository,
} from './vehicle-repository.js';

const updateVehicleDraftDataSchema = createVehicleDraftDataSchema.extend({
  vehicleId: z.string().trim().min(1).max(128),
  expectedVersion: z.number().int().positive(),
  reuseRejectedImages: z.boolean().optional(),
}).strict();

const updateVehicleDraftCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: updateVehicleDraftDataSchema,
}).strict();

const updateVehicleDraftResultSchema = z.object({
  requestId: z.string().trim().min(1).max(128),
  result: z.object({
    vehicleId: z.string().trim().min(1).max(128),
    moderationStatus: z.enum(['draft', 'rejected']),
    version: z.number().int().positive(),
    imageCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export type UpdateVehicleDraftData = z.infer<typeof updateVehicleDraftDataSchema>;
export type UpdateVehicleDraftResult = z.infer<typeof updateVehicleDraftResultSchema>;

export type UpdateVehicleDraftDependencies = {
  repository: VehicleRepository;
  now?: () => Date;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function updateVehicleDraft(
  untrustedCommand: unknown,
  actorUid: string,
  dependencies: UpdateVehicleDraftDependencies,
): Promise<UpdateVehicleDraftResult> {
  const parsed = updateVehicleDraftCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new CommandError('INVALID_ARGUMENT', 'Vehicle update data is invalid.');
  }
  const command = parsed.data;
  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocumentId = stableHash({
    actorId: actorUid,
    commandName: 'updateVehicleDraft',
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
      return updateVehicleDraftResultSchema.parse(replay.result);
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
        { reason: 'stale_version' },
      );
    }
    if (!['draft', 'rejected'].includes(vehicle.moderationStatus)) {
      throw new CommandError(
        'FAILED_PRECONDITION',
        'Only draft or rejected listings can be edited by the owner.',
        { reason: 'listing_not_editable' },
      );
    }
    if (vehicle.visibility === 'deleted') {
      throw new CommandError('FAILED_PRECONDITION', 'Deleted vehicle listings cannot be edited.');
    }

    const privateDoc = await transaction.getVehiclePrivate(command.data.vehicleId);
    if (!privateDoc) {
      throw new CommandError('NOT_FOUND', 'Vehicle private details not found.');
    }

    const specs = command.data.specs;
    const make = specs?.make ?? vehicle.make;
    const model = specs?.model ?? vehicle.model;
    const year = specs?.year ?? vehicle.year;
    const colour = specs?.colour ?? vehicle.colour;
    const category = specs?.category ?? vehicle.category;
    const seats = specs?.seats ?? vehicle.seats;
    const transmission = specs?.transmission ?? vehicle.transmission;
    const fuelType = specs?.fuelType ?? vehicle.fuelType;
    const mileageKm = specs?.mileageKm ?? vehicle.mileageKm;
    const description = specs?.description ?? vehicle.description;
    const features = specs?.features ?? vehicle.features;

    const displayName = `${make ?? 'New'} ${model ?? 'Vehicle'}${year ? ` ${year}` : ''}`.trim();

    const roundedBase = command.data.exactBase
      ? roundToApproxLatLng(
          command.data.exactBase.latitude,
          command.data.exactBase.longitude,
        )
      : null;

    const images = await transaction.getVehicleImages(command.data.vehicleId);
    const reuseRejectedImages =
      vehicle.moderationStatus === 'rejected' && command.data.reuseRejectedImages === true;

    const nextImages = images.map((image) => {
      if (!reuseRejectedImages || image.status !== 'rejected') return image;
      const restored = {
        ...image,
        status: 'processed' as const,
        publicVariantPaths: null,
        promotedAt: null,
        updatedAt: now.toISOString(),
      };
      transaction.setVehicleImage(command.data.vehicleId, image.imageId, restored, now);
      return restored;
    });

    const usableImages = nextImages.filter((image) => image.status !== 'rejected');
    const nextVersion = vehicle.version + 1;
    const updatedVehicle: VehicleRecord = {
      ...vehicle,
      displayName,
      make,
      model,
      year,
      colour,
      category,
      seats,
      transmission,
      fuelType,
      mileageKm,
      description,
      features,
      ownerDailyRateKobo: command.data.ownerDailyRateKobo ?? vehicle.ownerDailyRateKobo,
      areaLabel: command.data.areaLabel ?? vehicle.areaLabel,
      approxLatitude: roundedBase?.lat ?? vehicle.approxLatitude,
      approxLongitude: roundedBase?.lng ?? vehicle.approxLongitude,
      visibility: 'paused',
      discoverable: false,
      pendingRevisionId: null,
      imageCount: usableImages.length,
      primaryImagePath: resolvePrimaryImagePath(usableImages),
      updatedAt: now.toISOString(),
      version: nextVersion,
    };

    const updatedPrivate = {
      ...privateDoc,
      plate: command.data.plate ?? privateDoc.plate,
      baseAddress: command.data.baseAddress ?? privateDoc.baseAddress,
      exactLatitude: command.data.exactBase?.latitude ?? privateDoc.exactLatitude,
      exactLongitude: command.data.exactBase?.longitude ?? privateDoc.exactLongitude,
      placeId: command.data.exactBase?.placeId ?? privateDoc.placeId,
      updatedAt: now.toISOString(),
    };

    transaction.setVehicle(command.data.vehicleId, updatedVehicle, now);
    transaction.setVehiclePrivate(command.data.vehicleId, updatedPrivate, now);

    const auditEvent: VehicleAuditEvent = {
      actorId: actorUid,
      actorType: 'owner',
      entityId: command.data.vehicleId,
      entityType: 'vehicle',
      eventType: 'vehicle.draft_updated',
      fromState: vehicle.moderationStatus,
      toState: vehicle.moderationStatus,
      requestId,
      occurredAt: now,
      details: {
        version: nextVersion,
        reuseRejectedImages,
      },
    };
    transaction.createAuditEvent(auditEvent);

    const result = updateVehicleDraftResultSchema.parse({
      requestId,
      result: {
        vehicleId: command.data.vehicleId,
        moderationStatus: vehicle.moderationStatus,
        version: nextVersion,
        imageCount: usableImages.length,
      },
    });

    transaction.saveIdempotency(
      idempotencyDocumentId,
      {
        requestHash,
        commandName: 'updateVehicleDraft',
        actorId: actorUid,
        result,
      },
      now,
    );

    return result;
  });
}
