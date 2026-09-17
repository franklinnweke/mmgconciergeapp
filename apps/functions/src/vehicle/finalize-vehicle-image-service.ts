import { createHash, randomUUID } from 'node:crypto';

import {
  CommandError,
  finalizeVehicleImageCommandSchema,
  finalizeVehicleImageResultSchema,
  MAX_UPLOAD_BYTES,
  MAX_VEHICLE_IMAGES,
  type FinalizeVehicleImageCommand,
  type FinalizeVehicleImageResult,
  type VehicleImageVariant,
} from '@mmg/contracts';
import { ownerMayCreateVehicle, ownerMayManageVehicle } from '@mmg/domain';

import { sniffMagicBytes } from '../owner/storage-validation.js';
import {
  assertUsableSourceImage,
  privateVariantPath,
  resolvePrimaryImagePath,
  sourceUploadPath,
  VEHICLE_VARIANT_SPECS,
  type ImageProcessor,
  type InspectedImage,
  type RenderedVariant,
} from './image-processing.js';
import type {
  VehicleAuditEvent,
  VehicleImageRecord,
  VehicleImageVariantRecord,
  VehicleRecord,
  VehicleRepository,
} from './vehicle-repository.js';
import { PRIVATE_CACHE_CONTROL, type VehicleStorageGateway } from './vehicle-storage-gateway.js';

export type FinalizeVehicleImageDependencies = {
  repository: VehicleRepository;
  storageGateway: VehicleStorageGateway;
  imageProcessor: ImageProcessor;
  now?: () => Date;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function finalizeVehicleImage(
  untrustedCommand: unknown,
  actorUid: string,
  dependencies: FinalizeVehicleImageDependencies,
): Promise<FinalizeVehicleImageResult> {
  const parsed = finalizeVehicleImageCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new CommandError('INVALID_ARGUMENT', 'Finalize vehicle image data is invalid.');
  }
  const command: FinalizeVehicleImageCommand = parsed.data;

  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocumentId = stableHash({
    actorId: actorUid,
    commandName: 'finalizeVehicleImage',
    idempotencyKey: command.idempotencyKey,
  });

  const earlyReplay = await dependencies.repository.runTransaction((transaction) =>
    transaction.getIdempotency(idempotencyDocumentId),
  );
  if (earlyReplay) {
    if (earlyReplay.requestHash !== requestHash) {
      throw new CommandError(
        'IDEMPOTENCY_CONFLICT',
        'This idempotency key was already used for a different request.',
      );
    }
    return finalizeVehicleImageResultSchema.parse(earlyReplay.result);
  }

  // Fail closed before expensive image work. The final transaction repeats these
  // checks so a listing cannot change moderation state while processing and still
  // have new owner-controlled bytes attached.
  await dependencies.repository.runTransaction(async (transaction) => {
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
      throw new CommandError('FAILED_PRECONDITION', 'Cannot add images to a deleted vehicle listing.');
    }
    if (!['draft', 'rejected'].includes(vehicle.moderationStatus)) {
      throw new CommandError(
        'FAILED_PRECONDITION',
        'Vehicle images can only be changed while a listing is a draft or requires changes.',
      );
    }
  });

  const imageId = command.data.uploadId;
  const storagePath = sourceUploadPath(actorUid, command.data.vehicleId, command.data.uploadId);
  const { inspected, rendered } = await processUpload(storagePath, dependencies);

  const variantRecords: Record<string, VehicleImageVariantRecord> = {};
  const variantPaths: Record<string, string> = {};

  for (const variant of rendered) {
    const path = privateVariantPath(actorUid, command.data.vehicleId, imageId, variant.variant);
    await dependencies.storageGateway.writeObject(path, variant.bytes, {
      contentType: variant.contentType,
      cacheControl: PRIVATE_CACHE_CONTROL,
      metadata: {
        ownerId: actorUid,
        vehicleId: command.data.vehicleId,
        imageId,
        variant: variant.variant,
        purpose: 'vehicle-image-variant',
      },
    });
    variantPaths[variant.variant] = path;
    variantRecords[variant.variant] = {
      path,
      width: variant.width,
      height: variant.height,
      byteSize: variant.byteSize,
      contentType: variant.contentType,
    };
  }

  return dependencies.repository.runTransaction(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocumentId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new CommandError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }
      return finalizeVehicleImageResultSchema.parse(replay.result);
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
      throw new CommandError('FAILED_PRECONDITION', 'Cannot add images to a deleted vehicle listing.');
    }

    if (!['draft', 'rejected'].includes(vehicle.moderationStatus)) {
      throw new CommandError(
        'FAILED_PRECONDITION',
        'Vehicle images can only be changed while a listing is a draft or requires changes.',
      );
    }

    const existingImages = await transaction.getVehicleImages(command.data.vehicleId);
    const isUpdate = existingImages.some((image) => image.imageId === imageId);
    const activeImages = existingImages.filter((image) => image.status !== 'rejected');
    if (!isUpdate && activeImages.length >= MAX_VEHICLE_IMAGES) {
      throw new CommandError('INVALID_ARGUMENT', `Vehicle image limit reached (maximum ${MAX_VEHICLE_IMAGES}).`, {
        reason: 'image_limit',
      });
    }

    const previous = existingImages.find((image) => image.imageId === imageId);

    const imageRecord: VehicleImageRecord = {
      imageId,
      vehicleId: command.data.vehicleId,
      ownerId: actorUid,
      order: command.data.order,
      status: 'processed',
      width: inspected.width,
      height: inspected.height,
      originalUploadId: command.data.uploadId,
      variantPaths,
      processing: {
        sourceFormat: inspected.format,
        sourceByteSize: inspected.sourceByteSize,
        sourceHadExif: inspected.hasExif,
        sourceGps: inspected.gps,
        metadataStripped: true,
        variants: variantRecords,
      },
      publicVariantPaths: null,
      promotedAt: null,
      createdAt: previous?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
    };

    transaction.setVehicleImage(command.data.vehicleId, imageId, imageRecord, now);

    const allImages = [
      ...existingImages.filter((image) => image.imageId !== imageId),
      imageRecord,
    ];
    const usableImages = allImages.filter((image) => image.status !== 'rejected');

    const updatedVehicle: VehicleRecord = {
      ...vehicle,
      imageCount: usableImages.length,
      primaryImagePath: resolvePrimaryImagePath(usableImages),
      updatedAt: now.toISOString(),
      version: vehicle.version + 1,
    };

    transaction.setVehicle(command.data.vehicleId, updatedVehicle, now);

    const auditEvent: VehicleAuditEvent = {
      actorId: actorUid,
      actorType: 'owner',
      entityId: command.data.vehicleId,
      entityType: 'vehicleImage',
      eventType: 'vehicle.image_finalized',
      fromState: previous?.status ?? null,
      toState: 'processed',
      requestId,
      occurredAt: now,
      details: {
        imageId,
        order: command.data.order,
        sourceFormat: inspected.format,
        sourceWidth: inspected.width,
        sourceHeight: inspected.height,
        sourceHadExif: inspected.hasExif,
        sourceGps: inspected.gps,
        metadataStripped: true,
        variantsWritten: rendered.map((variant) => variant.variant),
      },
    };

    transaction.createAuditEvent(auditEvent);

    const resultPayload: FinalizeVehicleImageResult = {
      requestId,
      result: {
        imageId,
        order: command.data.order,
        status: 'processed',
        width: inspected.width,
        height: inspected.height,
      },
    };

    transaction.saveIdempotency(
      idempotencyDocumentId,
      {
        requestHash,
        commandName: 'finalizeVehicleImage',
        actorId: actorUid,
        result: resultPayload,
      },
      now,
    );

    return resultPayload;
  });
}

type ProcessedUpload = {
  inspected: InspectedImage & { sourceByteSize: number };
  rendered: readonly RenderedVariant[];
};

async function processUpload(
  storagePath: string,
  dependencies: FinalizeVehicleImageDependencies,
): Promise<ProcessedUpload> {
  const metadata = await dependencies.storageGateway.getObjectMetadata(storagePath);
  if (!metadata) {
    throw new CommandError('NOT_FOUND', 'Uploaded image not found in storage.', {
      reason: 'upload_invalid',
    });
  }

  if (metadata.size <= 0 || metadata.size > MAX_UPLOAD_BYTES) {
    throw new CommandError(
      'INVALID_ARGUMENT',
      `Image file must be between 1 byte and ${MAX_UPLOAD_BYTES} bytes.`,
      { reason: 'upload_invalid' },
    );
  }

  const bytes = await dependencies.storageGateway.downloadObject(storagePath);
  if (!bytes || bytes.byteLength === 0) {
    throw new CommandError('INVALID_ARGUMENT', 'Could not read image bytes.', {
      reason: 'upload_invalid',
    });
  }

  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new CommandError(
      'INVALID_ARGUMENT',
      `Image file must be between 1 byte and ${MAX_UPLOAD_BYTES} bytes.`,
      { reason: 'upload_invalid' },
    );
  }

  const detectedMime = sniffMagicBytes(bytes.subarray(0, 32));
  if (!detectedMime || detectedMime === 'application/pdf') {
    throw new CommandError(
      'INVALID_ARGUMENT',
      'Only JPEG, PNG, and WebP images are permitted for vehicle listings.',
      { reason: 'upload_invalid' },
    );
  }

  const inspected = await dependencies.imageProcessor.inspect(bytes);
  assertUsableSourceImage(inspected);

  const rendered: RenderedVariant[] = [];
  for (const spec of VEHICLE_VARIANT_SPECS) {
    rendered.push(await dependencies.imageProcessor.render(bytes, spec));
  }

  assertEveryVariantRendered(rendered);

  return {
    inspected: { ...inspected, sourceByteSize: bytes.byteLength },
    rendered,
  };
}

function assertEveryVariantRendered(rendered: readonly RenderedVariant[]): void {
  const produced = new Set<VehicleImageVariant>(rendered.map((variant) => variant.variant));
  const missing = VEHICLE_VARIANT_SPECS.filter((spec) => !produced.has(spec.variant));

  if (missing.length > 0) {
    throw new CommandError(
      'INTERNAL',
      'That image could not be fully processed. Please try uploading it again.',
      { reason: 'upload_invalid' },
    );
  }
}
