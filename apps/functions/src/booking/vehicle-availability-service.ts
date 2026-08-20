import { createHash, randomUUID } from 'node:crypto';

import {
  getOwnerVehicleCalendarResultSchema,
  getVehicleCalendarCommandSchema,
  getVehicleCalendarResultSchema,
  removeVehicleAvailabilityBlockCommandSchema,
  removeVehicleAvailabilityBlockResultSchema,
  setVehicleAvailabilityBlockCommandSchema,
  setVehicleAvailabilityBlockResultSchema,
  type GetOwnerVehicleCalendarResult,
  type GetVehicleCalendarResult,
  type RemoveVehicleAvailabilityBlockResult,
  type SetVehicleAvailabilityBlockResult,
} from '@mmg/contracts';
import {
  calculateChargedDays,
  intervalsOverlap,
  projectOwnerVehicleCalendar,
  projectRenterVehicleCalendar,
} from '@mmg/domain';

import {
  isActiveBlockingInterval,
  type BookingIntentRepository,
  type StoredOwnerAvailabilityBlock,
} from './create-booking-intent-service.js';
import { BookingCommandError } from './errors.js';

type ReadDependencies = {
  repository: BookingIntentRepository;
  now?: () => Date;
};

type WriteDependencies = ReadDependencies & {
  createId?: () => string;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function lagosDateOnly(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Africa/Lagos',
    year: 'numeric',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function validateWindow(startDate: string, endDate: string): void {
  try {
    calculateChargedDays(startDate, endDate);
  } catch {
    throw new BookingCommandError(
      'INVALID_ARGUMENT',
      'Calendar end date must be after the start date and within 365 days.',
    );
  }
}

export async function getVehicleCalendar(
  untrustedCommand: unknown,
  dependencies: ReadDependencies,
): Promise<GetVehicleCalendarResult> {
  const parsed = getVehicleCalendarCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Vehicle calendar request is invalid.');
  }
  const { vehicleId, windowStartDate, windowEndDate } = parsed.data.data;
  validateWindow(windowStartDate, windowEndDate);
  const now = (dependencies.now ?? (() => new Date()))();

  return dependencies.repository.runTransaction(async (transaction) => {
    const vehicle = await transaction.getVehicle(vehicleId);
    if (!vehicle?.active) {
      throw new BookingCommandError('NOT_FOUND', 'Vehicle is not available.');
    }
    const blocks = await transaction.listBlockingIntervals(vehicleId, windowEndDate);
    return getVehicleCalendarResultSchema.parse({
      vehicleId,
      windowStartDate,
      windowEndDate,
      days: projectRenterVehicleCalendar(windowStartDate, windowEndDate, blocks.map((block) => ({
        blockId: block.blockId,
        startDate: block.startDate,
        endDate: block.endDate,
        kind: block.state === 'owner_block' ? 'owner_block' : block.state === 'held' ? 'held' : 'booked',
        reason: block.reason,
        expiresAt: block.expiresAt,
      })), now),
    });
  });
}

export async function getOwnerVehicleCalendar(
  untrustedCommand: unknown,
  authenticatedOwnerId: string,
  dependencies: ReadDependencies,
): Promise<GetOwnerVehicleCalendarResult> {
  if (!authenticatedOwnerId) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to manage vehicle availability.');
  }
  const parsed = getVehicleCalendarCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Owner calendar request is invalid.');
  }
  const { vehicleId, windowStartDate, windowEndDate } = parsed.data.data;
  validateWindow(windowStartDate, windowEndDate);
  const now = (dependencies.now ?? (() => new Date()))();

  return dependencies.repository.runTransaction(async (transaction) => {
    const vehicle = await transaction.getVehicle(vehicleId);
    if (!vehicle || vehicle.ownerId !== authenticatedOwnerId) {
      throw new BookingCommandError('FORBIDDEN', 'You do not own this vehicle.', {
        reason: 'not_vehicle_owner',
      });
    }
    if (!vehicle.approved) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Vehicle approval is required.');
    }
    const availabilityVersion = await transaction.readAvailabilitySentinel(vehicleId);
    const blocks = await transaction.listBlockingIntervals(vehicleId, windowEndDate);
    const overlappingBlocks = blocks.filter((block) => block.endDate > windowStartDate);
    const ownerBlocks = overlappingBlocks.filter((block) => block.state === 'owner_block');

    for (const block of ownerBlocks) {
      if (
        !block.blockId ||
        !block.reason ||
        !block.version ||
        !block.createdAt ||
        !block.updatedAt
      ) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          'Availability data is invalid. Calendar cannot be shown safely.',
        );
      }
    }

    return getOwnerVehicleCalendarResultSchema.parse({
      vehicleId,
      windowStartDate,
      windowEndDate,
      availabilityVersion,
      days: projectOwnerVehicleCalendar(windowStartDate, windowEndDate, overlappingBlocks.map((block) => ({
        blockId: block.blockId,
        startDate: block.startDate,
        endDate: block.endDate,
        kind: block.state === 'owner_block' ? 'owner_block' : block.state === 'held' ? 'held' : 'booked',
        reason: block.reason,
        expiresAt: block.expiresAt,
      })), now),
      ownerBlocks: ownerBlocks.map((block) => ({
        blockId: block.blockId,
        vehicleId,
        startDate: block.startDate,
        endDate: block.endDate,
        reason: block.reason,
        notes: block.notes ?? null,
        version: block.version,
        createdAt: block.createdAt?.toISOString(),
        updatedAt: block.updatedAt?.toISOString(),
      })),
    });
  });
}

export async function setVehicleAvailabilityBlock(
  untrustedCommand: unknown,
  authenticatedOwnerId: string,
  dependencies: WriteDependencies,
): Promise<SetVehicleAvailabilityBlockResult> {
  if (!authenticatedOwnerId) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to manage vehicle availability.');
  }
  const parsed = setVehicleAvailabilityBlockCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Availability block request is invalid.');
  }
  const command = parsed.data;
  const now = (dependencies.now ?? (() => new Date()))();
  const data = command.data;
  validateWindow(data.startDate, data.endDate);
  if (data.startDate < lagosDateOnly(now)) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Availability block cannot start in the past.');
  }
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const blockId = (dependencies.createId ?? randomUUID)();
  const requestHash = stableHash(data);
  const idempotencyDocumentId = stableHash({
    ownerId: authenticatedOwnerId,
    idempotencyKey: command.idempotencyKey,
  });

  return dependencies.repository.runTransaction(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocumentId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'Idempotency key was reused.');
      }
      return setVehicleAvailabilityBlockResultSchema.parse(replay.result);
    }
    const vehicle = await transaction.getVehicle(data.vehicleId);
    if (!vehicle || vehicle.ownerId !== authenticatedOwnerId) {
      throw new BookingCommandError('FORBIDDEN', 'You do not own this vehicle.', {
        reason: 'not_vehicle_owner',
      });
    }
    if (!vehicle.approved) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Vehicle approval is required.');
    }
    const availabilityVersion = await transaction.readAvailabilitySentinel(data.vehicleId);
    if (availabilityVersion !== data.expectedAvailabilityVersion) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Vehicle calendar changed. Refresh and retry.', {
        reason: 'stale_version',
      });
    }
    const blocks = await transaction.listBlockingIntervals(data.vehicleId, data.endDate);
    if (blocks.some((block) =>
      isActiveBlockingInterval(block, now) && intervalsOverlap(data, block))) {
      throw new BookingCommandError('VEHICLE_UNAVAILABLE', 'Dates overlap existing availability.', {
        reason: 'dates_overlap',
      });
    }
    const record: StoredOwnerAvailabilityBlock = {
      blockId,
      vehicleId: data.vehicleId,
      ownerId: authenticatedOwnerId,
      startDate: data.startDate,
      endDate: data.endDate,
      state: 'owner_block',
      reason: data.reason,
      notes: data.notes,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const nextAvailabilityVersion = availabilityVersion + 1;
    const result = setVehicleAvailabilityBlockResultSchema.parse({
      requestId,
      result: {
        block: {
          blockId,
          vehicleId: data.vehicleId,
          startDate: data.startDate,
          endDate: data.endDate,
          reason: data.reason,
          notes: data.notes ?? null,
          version: 1,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
        availabilityVersion: nextAvailabilityVersion,
      },
    });
    transaction.createOwnerAvailabilityBlock(record);
    transaction.writeAvailabilitySentinel(data.vehicleId, now, nextAvailabilityVersion);
    transaction.createAvailabilityAuditEvent({
      actorId: authenticatedOwnerId,
      entityId: blockId,
      eventType: 'availability_block.created',
      fromState: null,
      toState: 'owner_block',
      requestId,
      occurredAt: now,
      vehicleId: data.vehicleId,
      startDate: data.startDate,
      endDate: data.endDate,
      reason: data.reason,
    });
    transaction.saveIdempotency(idempotencyDocumentId, requestHash, result, now);
    return result;
  });
}

export async function removeVehicleAvailabilityBlock(
  untrustedCommand: unknown,
  authenticatedOwnerId: string,
  dependencies: WriteDependencies,
): Promise<RemoveVehicleAvailabilityBlockResult> {
  if (!authenticatedOwnerId) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to manage vehicle availability.');
  }
  const parsed = removeVehicleAvailabilityBlockCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Remove availability block request is invalid.');
  }
  const command = parsed.data;
  const data = command.data;
  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(data);
  const idempotencyDocumentId = stableHash({
    ownerId: authenticatedOwnerId,
    idempotencyKey: command.idempotencyKey,
  });

  return dependencies.repository.runTransaction(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocumentId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'Idempotency key was reused.');
      }
      return removeVehicleAvailabilityBlockResultSchema.parse(replay.result);
    }
    const vehicle = await transaction.getVehicle(data.vehicleId);
    if (!vehicle || vehicle.ownerId !== authenticatedOwnerId) {
      throw new BookingCommandError('FORBIDDEN', 'You do not own this vehicle.', {
        reason: 'not_vehicle_owner',
      });
    }
    if (!vehicle.approved) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Vehicle approval is required.');
    }
    const availabilityVersion = await transaction.readAvailabilitySentinel(data.vehicleId);
    if (availabilityVersion !== data.expectedAvailabilityVersion) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Vehicle calendar changed. Refresh and retry.', {
        reason: 'stale_version',
      });
    }
    const block = await transaction.getAvailabilityBlock(data.blockId);
    if (!block || block.vehicleId !== data.vehicleId || block.ownerId !== authenticatedOwnerId) {
      throw new BookingCommandError('NOT_FOUND', 'Owner availability block was not found.');
    }
    if (block.version !== data.expectedBlockVersion) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Availability block changed. Refresh and retry.', {
        reason: 'stale_version',
      });
    }
    const nextAvailabilityVersion = availabilityVersion + 1;
    const result = removeVehicleAvailabilityBlockResultSchema.parse({
      requestId,
      result: {
        vehicleId: data.vehicleId,
        blockId: data.blockId,
        removed: true,
        availabilityVersion: nextAvailabilityVersion,
      },
    });
    transaction.deleteOwnerAvailabilityBlock(block.blockId);
    transaction.writeAvailabilitySentinel(data.vehicleId, now, nextAvailabilityVersion);
    transaction.createAvailabilityAuditEvent({
      actorId: authenticatedOwnerId,
      entityId: block.blockId,
      eventType: 'availability_block.removed',
      fromState: 'owner_block',
      toState: 'available',
      requestId,
      occurredAt: now,
      vehicleId: block.vehicleId,
      startDate: block.startDate,
      endDate: block.endDate,
      reason: block.reason,
    });
    transaction.saveIdempotency(idempotencyDocumentId, requestHash, result, now);
    return result;
  });
}
