import { createHash, randomUUID } from 'node:crypto';

import {
  BookingCommandError,
  removeVehicleAvailabilityBlockCommandSchema,
  removeVehicleAvailabilityBlockResultSchema,
  type RemoveVehicleAvailabilityBlockCommand,
  type RemoveVehicleAvailabilityBlockResult,
} from '@mmg/contracts';

import type {
  BookingRepository,
} from './booking-repository.js';

export type RemoveVehicleAvailabilityBlockDependencies = {
  repository: BookingRepository;
  now?: () => Date;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function removeVehicleAvailabilityBlock(
  untrustedCommand: unknown,
  authenticatedOwnerId: string,
  dependencies: RemoveVehicleAvailabilityBlockDependencies,
): Promise<RemoveVehicleAvailabilityBlockResult> {
  if (!authenticatedOwnerId) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to manage vehicle availability.');
  }

  const parsed = removeVehicleAvailabilityBlockCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Remove availability block command is invalid.');
  }

  const command: RemoveVehicleAvailabilityBlockCommand = parsed.data;
  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocId = stableHash({ ownerId: authenticatedOwnerId, idempotencyKey: command.idempotencyKey });

  return dependencies.repository.runTransaction(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new BookingCommandError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }
      return removeVehicleAvailabilityBlockResultSchema.parse(replay.result);
    }

    const vehicle = await transaction.getVehicle(command.data.vehicleId);
    if (!vehicle) {
      throw new BookingCommandError('NOT_FOUND', 'Vehicle listing was not found.');
    }

    if (vehicle.ownerId !== authenticatedOwnerId) {
      throw new BookingCommandError('FORBIDDEN', 'You do not own this vehicle.');
    }

    const block = await transaction.getAvailabilityBlock(command.data.blockId);
    if (!block) {
      throw new BookingCommandError('NOT_FOUND', 'Availability block was not found.');
    }

    if (block.vehicleId !== command.data.vehicleId || block.ownerId !== authenticatedOwnerId) {
      throw new BookingCommandError('FORBIDDEN', 'You do not own this availability block.');
    }

    if (block.type !== 'owner_block') {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        'Cannot remove booking holds or confirmed rental reservations through manual unblock.',
      );
    }

    await transaction.readAvailabilitySentinel(command.data.vehicleId);
    transaction.removeAvailabilityBlock(command.data.vehicleId, command.data.blockId);
    transaction.writeAvailabilitySentinel(command.data.vehicleId, now);

    transaction.createAuditEvent({
      actorId: authenticatedOwnerId,
      actorType: 'owner',
      entityId: command.data.blockId,
      entityType: 'availabilityBlock',
      eventType: 'availability_block.removed',
      fromState: 'owner_block',
      toState: 'available',
      requestId,
      occurredAt: now,
      details: {
        vehicleId: command.data.vehicleId,
        blockId: command.data.blockId,
      },
    });

    const response: RemoveVehicleAvailabilityBlockResult = {
      requestId,
      result: {
        vehicleId: command.data.vehicleId,
        blockId: command.data.blockId,
        removed: true,
      },
    };

    transaction.saveIdempotency(idempotencyDocId, requestHash, response, now);
    return response;
  });
}
