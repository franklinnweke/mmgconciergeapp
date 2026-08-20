import { createHash, randomUUID } from 'node:crypto';

import {
  createBookingIntentCommandSchema,
  createBookingIntentResultSchema,
  type CreateBookingIntentCommand,
  type CreateBookingIntentResult,
  type PriceSnapshot,
  type RenterVehicleSnapshot,
} from '@mmg/contracts';
import {
  calculateAuthoritativePrice,
  calculateChargedDays,
  intervalsOverlap,
} from '@mmg/domain';

import { BookingCommandError } from './errors.js';

export type TrustedVehicle = {
  id: string;
  ownerId: string;
  approved: boolean;
  active: boolean;
  ownerDailyRateKobo: number;
  vehicleSnapshot: RenterVehicleSnapshot;
};

export type TrustedBookingConfig = {
  deliveryFeeKobo: number;
  serviceFeeBps: number;
  serviceFeeFixedKobo: number;
  ownerCommissionBps: number;
  configVersion: string;
  termsVersion: string;
  cancellationPolicyVersion: string;
};

export type BlockingInterval = {
  blockId?: string;
  ownerId?: string;
  startDate: string;
  endDate: string;
  state: 'held' | 'paid' | 'confirmed' | 'owner_block';
  reason?: 'maintenance' | 'owner_use' | 'offline' | 'other';
  notes?: string;
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
  expiresAt?: Date;
};

export type StoredIdempotency = {
  requestHash: string;
  result: unknown;
};

export type NewIntentRecord = {
  intentId: string;
  renterId: string;
  ownerId: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  state: 'intent_created';
  priceSnapshot: PriceSnapshot;
  vehicleSnapshot: RenterVehicleSnapshot;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
};

export type StoredOwnerAvailabilityBlock = {
  blockId: string;
  vehicleId: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  state: 'owner_block';
  reason: 'maintenance' | 'owner_use' | 'offline' | 'other';
  notes?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AvailabilityAuditEvent = {
  actorId: string;
  entityId: string;
  eventType: 'availability_block.created' | 'availability_block.removed';
  fromState: 'owner_block' | null;
  toState: 'owner_block' | 'available';
  requestId: string;
  occurredAt: Date;
  vehicleId: string;
  startDate: string;
  endDate: string;
  reason?: StoredOwnerAvailabilityBlock['reason'];
};

export interface BookingIntentTransaction {
  getIdempotency(documentId: string): Promise<StoredIdempotency | null>;
  getVehicle(vehicleId: string): Promise<TrustedVehicle | null>;
  getBookingConfig(): Promise<TrustedBookingConfig | null>;
  readAvailabilitySentinel(vehicleId: string): Promise<number>;
  listBlockingIntervals(vehicleId: string, exclusiveEndDate: string): Promise<readonly BlockingInterval[]>;
  getAvailabilityBlock(blockId: string): Promise<StoredOwnerAvailabilityBlock | null>;
  createOwnerAvailabilityBlock(record: StoredOwnerAvailabilityBlock): void;
  deleteOwnerAvailabilityBlock(blockId: string): void;
  writeAvailabilitySentinel(vehicleId: string, updatedAt: Date, version: number): void;
  createIntent(record: NewIntentRecord): void;
  createHeldBlock(record: NewIntentRecord): void;
  createAuditEvent(record: NewIntentRecord, requestId: string): void;
  createAvailabilityAuditEvent(event: AvailabilityAuditEvent): void;
  saveIdempotency(documentId: string, requestHash: string, result: unknown, createdAt: Date): void;
}

export interface BookingIntentRepository {
  runTransaction<T>(work: (transaction: BookingIntentTransaction) => Promise<T>): Promise<T>;
}

export type CreateBookingIntentDependencies = {
  repository: BookingIntentRepository;
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

export function isActiveBlockingInterval(block: BlockingInterval, now: Date): boolean {
  if (block.state !== 'held') return true;
  return Boolean(block.expiresAt && block.expiresAt.getTime() > now.getTime());
}

export async function createBookingIntent(
  untrustedCommand: unknown,
  renterId: string,
  dependencies: CreateBookingIntentDependencies,
): Promise<CreateBookingIntentResult> {
  if (!renterId) throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to create a booking intent.');

  const parsed = createBookingIntentCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Booking request is invalid.');
  }
  const command: CreateBookingIntentCommand = parsed.data;
  let chargedDays: number;
  try {
    chargedDays = calculateChargedDays(command.data.startDate, command.data.endDate);
  } catch {
    throw new BookingCommandError(
      'INVALID_ARGUMENT',
      'Booking end date must be after the start date and within 365 days.',
    );
  }
  const now = (dependencies.now ?? (() => new Date()))();
  if (command.data.startDate < dateOnlyInTimeZone(now, 'Africa/Lagos')) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Booking start date cannot be in the past.');
  }
  const createId = dependencies.createId ?? randomUUID;
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocumentId = stableHash({ renterId, idempotencyKey: command.idempotencyKey });

  return dependencies.repository.runTransaction(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocumentId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new BookingCommandError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }
      return createBookingIntentResultSchema.parse(replay.result);
    }

    const vehicle = await transaction.getVehicle(command.data.vehicleId);
    if (!vehicle?.active) throw new BookingCommandError('NOT_FOUND', 'Vehicle is not available.');
    const config = await transaction.getBookingConfig();
    if (!config) {
      throw new BookingCommandError('CONFIGURATION_UNAVAILABLE', 'Booking configuration is unavailable.');
    }

    const availabilityVersion = await transaction.readAvailabilitySentinel(vehicle.id);
    const blocks = await transaction.listBlockingIntervals(vehicle.id, command.data.endDate);
    if (blocks.some((block) => isActiveBlockingInterval(block, now) && intervalsOverlap(command.data, block))) {
      throw new BookingCommandError('VEHICLE_UNAVAILABLE', 'Vehicle is no longer available for these dates.');
    }

    let priceSnapshot: PriceSnapshot;
    try {
      priceSnapshot = calculateAuthoritativePrice({
        ownerDailyRateKobo: vehicle.ownerDailyRateKobo,
        chargedDays,
        ...config,
      });
    } catch {
      throw new BookingCommandError('FAILED_PRECONDITION', 'The authoritative booking price is invalid.');
    }

    const intentId = createId();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
    const record: NewIntentRecord = {
      intentId,
      renterId,
      ownerId: vehicle.ownerId,
      vehicleId: vehicle.id,
      startDate: command.data.startDate,
      endDate: command.data.endDate,
      state: 'intent_created',
      priceSnapshot,
      vehicleSnapshot: vehicle.vehicleSnapshot,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };
    const result = createBookingIntentResultSchema.parse({
      requestId,
      result: {
        intentId,
        state: 'intent_created',
        startDate: record.startDate,
        endDate: record.endDate,
        expiresAt: expiresAt.toISOString(),
        priceSnapshot,
        vehicleSnapshot: record.vehicleSnapshot,
      },
    });

    transaction.writeAvailabilitySentinel(vehicle.id, now, availabilityVersion + 1);
    transaction.createIntent(record);
    transaction.createHeldBlock(record);
    transaction.createAuditEvent(record, requestId);
    transaction.saveIdempotency(idempotencyDocumentId, requestHash, result, now);
    return result;
  });
}
