import { createHash, randomUUID } from 'node:crypto';

import {
  BookingCommandError,
  setVehicleAvailabilityBlockCommandSchema,
  setVehicleAvailabilityBlockResultSchema,
  type SetVehicleAvailabilityBlockCommand,
  type SetVehicleAvailabilityBlockResult,
} from '@mmg/contracts';
import {
  calculateChargedDays,
  dateOnlyToEpochDay,
  intervalsOverlap,
} from '@mmg/domain';

import type {
  BookingRepository,
  StoredAvailabilityBlock,
} from './booking-repository.js';
import { isActiveBlockingInterval } from './create-booking-intent-service.js';

export type SetVehicleAvailabilityBlockDependencies = {
  repository: BookingRepository;
  now?: () => Date;
  createId?: () => string;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function dateOnlyInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export async function setVehicleAvailabilityBlock(
  untrustedCommand: unknown,
  authenticatedOwnerId: string,
  dependencies: SetVehicleAvailabilityBlockDependencies,
): Promise<SetVehicleAvailabilityBlockResult> {
  if (!authenticatedOwnerId) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to manage vehicle availability.');
  }

  const parsed = setVehicleAvailabilityBlockCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Availability block command is invalid.');
  }

  const command: SetVehicleAvailabilityBlockCommand = parsed.data;
  const now = (dependencies.now ?? (() => new Date()))();

  try {
    calculateChargedDays(command.data.startDate, command.data.endDate);
  } catch {
    throw new BookingCommandError(
      'INVALID_ARGUMENT',
      'Availability block end date must be after the start date and within 365 days.',
    );
  }

  if (command.data.startDate < dateOnlyInTimeZone(now, 'Africa/Lagos')) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Availability block start date cannot be in the past.');
  }

  const createId = dependencies.createId ?? randomUUID;
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
      return setVehicleAvailabilityBlockResultSchema.parse(replay.result);
    }

    const vehicle = await transaction.getVehicle(command.data.vehicleId);
    if (!vehicle) {
      throw new BookingCommandError('NOT_FOUND', 'Vehicle listing was not found.');
    }

    if (vehicle.ownerId !== authenticatedOwnerId) {
      throw new BookingCommandError('FORBIDDEN', 'You do not own this vehicle.');
    }

    await transaction.readAvailabilitySentinel(command.data.vehicleId);

    const existingBlocks = await transaction.listBlockingIntervals(
      command.data.vehicleId,
      command.data.endDate,
    );

    const candidateInterval = {
      startDate: command.data.startDate,
      endDate: command.data.endDate,
    };

    // Check conflict against active booking holds or paid/confirmed bookings
    for (const block of existingBlocks) {
      if (!isActiveBlockingInterval(block, now)) continue;
      // If block is a hold or paid/confirmed booking, it cannot be overridden by owner block
      if (block.state === 'held' || block.state === 'paid' || block.state === 'confirmed') {
        if (intervalsOverlap(candidateInterval, block)) {
          throw new BookingCommandError(
            'FAILED_PRECONDITION',
            'Cannot block availability because these dates overlap with an active booking hold or confirmed journey.',
            { reason: 'availability_conflict' },
          );
        }
      }
    }

    const blockId = createId();
    const createdAt = now;
    const updatedAt = now;

    const record: StoredAvailabilityBlock = {
      blockId,
      vehicleId: command.data.vehicleId,
      ownerId: authenticatedOwnerId,
      startDate: command.data.startDate,
      endDate: command.data.endDate,
      type: 'owner_block',
      reason: command.data.reason,
      notes: command.data.notes,
      createdAt,
      updatedAt,
    };

    transaction.createAvailabilityBlock(record);
    transaction.writeAvailabilitySentinel(command.data.vehicleId, now);

    transaction.createAuditEvent({
      actorId: authenticatedOwnerId,
      actorType: 'owner',
      entityId: blockId,
      entityType: 'availabilityBlock',
      eventType: 'availability_block.created',
      fromState: null,
      toState: 'owner_block',
      requestId,
      occurredAt: now,
      details: {
        vehicleId: command.data.vehicleId,
        startDate: command.data.startDate,
        endDate: command.data.endDate,
        reason: command.data.reason,
      },
    });

    const response: SetVehicleAvailabilityBlockResult = {
      requestId,
      result: {
        block: {
          blockId,
          vehicleId: command.data.vehicleId,
          ownerId: authenticatedOwnerId,
          startDate: command.data.startDate,
          endDate: command.data.endDate,
          type: 'owner_block',
          reason: command.data.reason,
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        },
      },
    };

    transaction.saveIdempotency(idempotencyDocId, requestHash, response, now);
    return response;
  });
}
