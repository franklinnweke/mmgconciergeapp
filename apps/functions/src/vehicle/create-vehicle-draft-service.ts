import { createHash, randomUUID } from 'node:crypto';

import {
  CommandError,
  createVehicleDraftCommandSchema,
  createVehicleDraftResultSchema,
  type CreateVehicleDraftCommand,
  type CreateVehicleDraftResult,
} from '@mmg/contracts';
import { ownerMayCreateVehicle, roundToApproxLatLng } from '@mmg/domain';

import type {
  VehicleAuditEvent,
  VehicleRepository,
  VehicleRecord,
  VehiclePrivateRecord,
} from './vehicle-repository.js';

export type CreateVehicleDraftDependencies = {
  repository: VehicleRepository;
  now?: () => Date;
  createRequestId?: () => string;
  createVehicleId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function createVehicleDraft(
  untrustedCommand: unknown,
  actorUid: string,
  dependencies: CreateVehicleDraftDependencies,
): Promise<CreateVehicleDraftResult> {
  const parsed = createVehicleDraftCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new CommandError('INVALID_ARGUMENT', 'Vehicle draft data is invalid.');
  }
  const command: CreateVehicleDraftCommand = parsed.data;

  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const vehicleId = (dependencies.createVehicleId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocumentId = stableHash({
    actorId: actorUid,
    commandName: 'createVehicleDraft',
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
      return createVehicleDraftResultSchema.parse(replay.result);
    }

    const profile = await transaction.getOwnerProfile(actorUid);
    if (!profile || !ownerMayCreateVehicle(profile.verificationStatus)) {
      throw new CommandError(
        'FORBIDDEN',
        'Your owner account must be approved before you can list a vehicle.',
        { reason: 'not_approved_owner' },
      );
    }

    const displayName = command.data.specs
      ? `${command.data.specs.make ?? 'New'} ${command.data.specs.model ?? 'Vehicle'} ${command.data.specs.year ?? ''}`.trim()
      : 'New Vehicle';

    const approxLatLng = command.data.exactBase
      ? roundToApproxLatLng(command.data.exactBase.latitude, command.data.exactBase.longitude)
      : null;

    const vehicleRecord: VehicleRecord = {
      vehicleId,
      ownerId: actorUid,
      displayName,
      make: command.data.specs?.make ?? null,
      model: command.data.specs?.model ?? null,
      year: command.data.specs?.year ?? null,
      colour: command.data.specs?.colour ?? null,
      category: command.data.specs?.category ?? null,
      seats: command.data.specs?.seats ?? null,
      transmission: command.data.specs?.transmission ?? null,
      fuelType: command.data.specs?.fuelType ?? null,
      mileageKm: command.data.specs?.mileageKm ?? null,
      description: command.data.specs?.description ?? null,
      features: command.data.specs?.features ?? [],
      ownerDailyRateKobo: command.data.ownerDailyRateKobo ?? null,
      chauffeurPolicy: 'included' as const,
      deliveryPolicy: 'included' as const,
      areaLabel: command.data.areaLabel ?? null,
      approxLatitude: approxLatLng?.lat ?? null,
      approxLongitude: approxLatLng?.lng ?? null,
      moderationStatus: 'draft' as const,
      visibility: 'paused' as const,
      discoverable: false,
      lastDecisionReason: null,
      pendingRevisionId: null,
      imageCount: 0,
      primaryImagePath: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 1,
    };

    const privateRecord: VehiclePrivateRecord = {
      vehicleId,
      ownerId: actorUid,
      plate: command.data.plate ?? null,
      baseAddress: command.data.baseAddress ?? null,
      exactLatitude: command.data.exactBase?.latitude ?? null,
      exactLongitude: command.data.exactBase?.longitude ?? null,
      placeId: command.data.exactBase?.placeId ?? null,
      documentPaths: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const auditEvent: VehicleAuditEvent = {
      actorId: actorUid,
      actorType: 'owner',
      entityId: vehicleId,
      entityType: 'vehicle',
      eventType: 'vehicle.draft_created',
      fromState: null,
      toState: 'draft',
      requestId,
      occurredAt: now,
    };

    const result = createVehicleDraftResultSchema.parse({
      requestId,
      result: {
        vehicleId,
        moderationStatus: 'draft' as const,
        visibility: 'paused' as const,
        version: 1,
      },
    });

    transaction.setVehicle(vehicleId, vehicleRecord, now);
    transaction.setVehiclePrivate(vehicleId, privateRecord, now);
    transaction.createAuditEvent(auditEvent);
    transaction.saveIdempotency(
      idempotencyDocumentId,
      { requestHash, commandName: 'createVehicleDraft', actorId: actorUid, result },
      now,
    );

    return result;
  });
}