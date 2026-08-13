import type { CreateBookingIntentResult } from '@mmg/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createBookingIntent,
  type BlockingInterval,
  type BookingIntentRepository,
  type BookingIntentTransaction,
  type NewIntentRecord,
  type StoredIdempotency,
  type TrustedBookingConfig,
  type TrustedVehicle,
} from './create-booking-intent-service.js';
import { BookingCommandError } from './errors.js';

const command = {
  schemaVersion: 1,
  idempotencyKey: 'booking_01JABCDEFGHIJK',
  data: {
    vehicleId: 'vehicle-one',
    startDate: '2026-09-01',
    endDate: '2026-09-04',
  },
} as const;

class InMemoryTransaction implements BookingIntentTransaction {
  vehicle: TrustedVehicle | null = {
    id: 'vehicle-one',
    ownerId: 'owner-one',
    active: true,
    ownerDailyRateKobo: 38_500_000,
    vehicleSnapshot: {
      displayName: 'Pearl Executive SUV',
      areaLabel: 'Victoria Island',
      categoryLabel: 'Executive SUV',
      imageKey: 'pearl-suv',
    },
  };
  config: TrustedBookingConfig | null = {
    deliveryFeeKobo: 0,
    serviceFeeBps: 800,
    serviceFeeFixedKobo: 0,
    ownerCommissionBps: 1_500,
    configVersion: 'pricing-v1',
    termsVersion: 'terms-v1',
    cancellationPolicyVersion: 'cancel-v1',
  };
  blocks: BlockingInterval[] = [];
  idempotency = new Map<string, StoredIdempotency>();
  intents: NewIntentRecord[] = [];
  heldBlocks: NewIntentRecord[] = [];
  sentinelReads = 0;
  sentinelWrites = 0;
  auditWrites = 0;

  async getIdempotency(documentId: string) { return this.idempotency.get(documentId) ?? null; }
  async getVehicle() { return this.vehicle; }
  async getBookingConfig() { return this.config; }
  async readAvailabilitySentinel() { this.sentinelReads += 1; }
  async listBlockingIntervals() { return this.blocks; }
  writeAvailabilitySentinel() { this.sentinelWrites += 1; }
  createIntent(record: NewIntentRecord) { this.intents.push(record); }
  createHeldBlock(record: NewIntentRecord) { this.heldBlocks.push(record); }
  createAuditEvent() { this.auditWrites += 1; }
  saveIdempotency(documentId: string, requestHash: string, result: CreateBookingIntentResult) {
    this.idempotency.set(documentId, { requestHash, result });
  }
}

describe('createBookingIntent service', () => {
  let transaction: InMemoryTransaction;
  let repository: BookingIntentRepository;
  let nextId: number;

  beforeEach(() => {
    transaction = new InMemoryTransaction();
    repository = { runTransaction: (work) => work(transaction) };
    nextId = 0;
  });

  const execute = (input: unknown = command, renterId = 'renter-one') =>
    createBookingIntent(input, renterId, {
      repository,
      now: () => new Date('2026-08-13T12:00:00.000Z'),
      createId: () => `intent-${++nextId}`,
      createRequestId: () => `request-${nextId + 1}`,
    });

  it('creates one authoritative intent, held block, sentinel write, audit, and price snapshot', async () => {
    const result = await execute();
    expect(result.result).toMatchObject({
      intentId: 'intent-1',
      state: 'intent_created',
      expiresAt: '2026-08-13T12:15:00.000Z',
      priceSnapshot: {
        chargedDays: 3,
        baseRentalKobo: 115_500_000,
        renterTotalKobo: 124_740_000,
      },
      vehicleSnapshot: {
        displayName: 'Pearl Executive SUV',
      },
    });
    expect(transaction.intents).toHaveLength(1);
    expect(transaction.heldBlocks).toHaveLength(1);
    expect(transaction.sentinelReads).toBe(1);
    expect(transaction.sentinelWrites).toBe(1);
    expect(transaction.auditWrites).toBe(1);
  });

  it('replays the same actor, key, and payload without duplicate writes', async () => {
    const first = await execute();
    const second = await execute();
    expect(second).toEqual(first);
    expect(transaction.intents).toHaveLength(1);
  });

  it('rejects reusing an idempotency key with a different payload', async () => {
    await execute();
    await expect(execute({
      ...command,
      data: { ...command.data, endDate: '2026-09-05' },
    })).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('rejects an overlapping block but permits a touching exclusive interval', async () => {
    transaction.blocks = [{ startDate: '2026-09-03', endDate: '2026-09-05', state: 'held', expiresAt: new Date('2026-08-13T12:15:00.000Z') }];
    await expect(execute()).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'VEHICLE_UNAVAILABLE' });

    transaction.blocks = [{ startDate: '2026-09-04', endDate: '2026-09-05', state: 'confirmed' }];
    await expect(execute()).resolves.toMatchObject({ result: { state: 'intent_created' } });
  });

  it('releases expired holds but keeps active and paid intervals blocking', async () => {
    transaction.blocks = [{
      startDate: '2026-09-03', endDate: '2026-09-05', state: 'held',
      expiresAt: new Date('2026-08-13T11:59:59.000Z'),
    }];
    await expect(execute()).resolves.toMatchObject({ result: { state: 'intent_created' } });

    transaction.intents = [];
    transaction.idempotency.clear();
    transaction.blocks = [{ startDate: '2026-09-03', endDate: '2026-09-05', state: 'paid' }];
    await expect(execute({ ...command, idempotencyKey: 'booking_01JABCDEFGHIJK_PAID' }))
      .rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'VEHICLE_UNAVAILABLE' });
  });

  it('rejects a booking start date before the current Lagos calendar day', async () => {
    await expect(execute({
      ...command,
      idempotencyKey: 'booking_01JABCDEFGHIJK_PAST',
      data: { ...command.data, startDate: '2020-01-01', endDate: '2020-01-04' },
    })).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'INVALID_ARGUMENT' });
  });

  it('fails closed for missing, inactive, or mispriced authoritative records', async () => {
    transaction.vehicle = null;
    await expect(execute()).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'NOT_FOUND' });

    transaction.vehicle = {
      id: 'vehicle-one', ownerId: 'owner-one', active: false, ownerDailyRateKobo: 1,
      vehicleSnapshot: new InMemoryTransaction().vehicle!.vehicleSnapshot,
    };
    await expect(execute()).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'NOT_FOUND' });

    transaction.vehicle.active = true;
    transaction.config = null;
    await expect(execute()).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'CONFIGURATION_UNAVAILABLE' });

    transaction.config = new InMemoryTransaction().config;
    transaction.vehicle.ownerDailyRateKobo = Number.MAX_SAFE_INTEGER;
    await expect(execute()).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'FAILED_PRECONDITION' });
  });

  it('rejects unauthenticated actors and client-supplied prices or status', async () => {
    await expect(execute(command, '')).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'UNAUTHENTICATED' });
    await expect(execute({
      ...command,
      data: { ...command.data, renterTotalKobo: 1, state: 'paid' },
    })).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'INVALID_ARGUMENT' });
    await expect(execute({
      ...command,
      idempotencyKey: 'booking_01JABCDEFGHIJK_D',
      data: { ...command.data, endDate: command.data.startDate },
    })).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'INVALID_ARGUMENT' });
  });
});
