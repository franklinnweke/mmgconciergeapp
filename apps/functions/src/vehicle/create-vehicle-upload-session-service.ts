import { createHash, randomUUID } from 'node:crypto';

import {
  CommandError,
  createVehicleUploadSessionCommandSchema,
  createVehicleUploadSessionResultSchema,
  MAX_UPLOAD_BYTES,
  MAX_VEHICLE_DOCUMENTS,
  MAX_VEHICLE_IMAGES,
  type CreateVehicleUploadSessionCommand,
  type CreateVehicleUploadSessionResult,
} from '@mmg/contracts';
import { ownerMayCreateVehicle, ownerMayManageVehicle } from '@mmg/domain';

import type {
  VehicleAuditEvent,
  VehicleRepository,
} from './vehicle-repository.js';

export type CreateVehicleUploadSessionDependencies = {
  repository: VehicleRepository;
  now?: () => Date;
  createRequestId?: () => string;
  createUploadId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function createVehicleUploadSession(
  untrustedCommand: unknown,
  actorUid: string,
  dependencies: CreateVehicleUploadSessionDependencies,
): Promise<CreateVehicleUploadSessionResult> {
  const parsed = createVehicleUploadSessionCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new CommandError('INVALID_ARGUMENT', 'Vehicle upload session data is invalid.');
  }
  const command: CreateVehicleUploadSessionCommand = parsed.data;

  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const uploadId = (dependencies.createUploadId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocumentId = stableHash({
    actorId: actorUid,
    commandName: 'createVehicleUploadSession',
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
      return createVehicleUploadSessionResultSchema.parse(replay.result);
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

    if (vehicle.visibility === 'deleted') {
      throw new CommandError('FAILED_PRECONDITION', 'Cannot upload to a deleted vehicle listing.');
    }

    if (!['draft', 'rejected'].includes(vehicle.moderationStatus)) {
      throw new CommandError(
        'FAILED_PRECONDITION',
        'Vehicle uploads are only allowed while a listing is a draft or requires changes.',
      );
    }

    let storagePath: string;

    if (command.data.purpose === 'listing_image') {
      const existingImages = await transaction.getVehicleImages(command.data.vehicleId);
      const activeCount = existingImages.filter((img) => img.status !== 'rejected').length;
      if (activeCount >= MAX_VEHICLE_IMAGES) {
        throw new CommandError('INVALID_ARGUMENT', `Vehicle image limit reached (maximum ${MAX_VEHICLE_IMAGES}).`, {
          reason: 'image_limit',
        });
      }
      storagePath = `private/vehicle-uploads/${actorUid}/${command.data.vehicleId}/${uploadId}`;
    } else {
      const privateDoc = await transaction.getVehiclePrivate(command.data.vehicleId);
      const docCount = privateDoc?.documentPaths.length ?? 0;
      if (docCount >= MAX_VEHICLE_DOCUMENTS) {
        throw new CommandError('INVALID_ARGUMENT', `Vehicle document limit reached (maximum ${MAX_VEHICLE_DOCUMENTS}).`);
      }
      storagePath = `private/vehicle-documents/${actorUid}/${command.data.vehicleId}/${uploadId}`;
    }

    const auditEvent: VehicleAuditEvent = {
      actorId: actorUid,
      actorType: 'owner',
      entityId: command.data.vehicleId,
      entityType: 'vehicle',
      eventType: 'vehicle.upload_session_created',
      fromState: null,
      toState: null,
      requestId,
      occurredAt: now,
      details: {
        uploadId,
        purpose: command.data.purpose,
        contentType: command.data.contentType,
        byteSize: command.data.byteSize,
      },
    };

    transaction.createAuditEvent(auditEvent);

    const resultPayload: CreateVehicleUploadSessionResult = {
      requestId,
      result: {
        uploadId,
        storagePath,
        purpose: command.data.purpose,
        maxBytes: MAX_UPLOAD_BYTES,
      },
    };

    transaction.saveIdempotency(
      idempotencyDocumentId,
      {
        requestHash,
        commandName: 'createVehicleUploadSession',
        actorId: actorUid,
        result: resultPayload,
      },
      now,
    );

    return resultPayload;
  });
}
