import { beforeEach, describe, expect, it } from 'vitest';

import type {
  AvailabilityAuditEvent,
  BlockingInterval,
  BookingIntentRepository,
  BookingIntentTransaction,
  NewIntentRecord,
  StoredIdempotency,
  StoredOwnerAvailabilityBlock,
  TrustedBookingConfig,
  TrustedVehicle,
} from './create-booking-intent-service.js';
import { BookingCommandError } from './errors.js';
import {
  getOwnerVehicleCalendar,
  getVehicleCalendar,
  removeVehicleAvailabilityBlock,
  setVehicleAvailabilityBlock,
} from './vehicle-availability-service.js';

class InMemoryAvailabilityTransaction implements BookingIntentTransaction {
  vehicle: TrustedVehicle | null = {
    id: 'vehicle-prado-250',
    ownerId: 'owner-one',
    approved: true,
    active: true,
    ownerDailyRateKobo: 38_500_000,
    vehicleSnapshot: {
      displayName: 'Toyota Land Cruiser Prado 250',
      areaLabel: 'Ikoyi',
      categoryLabel: 'Prado Luxury',
      imageKey: 'prado-graphite',
    },
  };
  availabilityVersion = 0;
  blocks: BlockingInterval[] = [];
  ownerBlocks = new Map<string, StoredOwnerAvailabilityBlock>();
  idempotency = new Map<string, StoredIdempotency>();
  auditEvents: AvailabilityAuditEvent[] = [];

  async getIdempotency(documentId: string) { return this.idempotency.get(documentId) ?? null; }
  async getVehicle() { return this.vehicle; }
  async getBookingConfig(): Promise<TrustedBookingConfig | null> { return null; }
  async readAvailabilitySentinel() { return this.availabilityVersion; }
  async listBlockingIntervals() { return this.blocks; }
  async getAvailabilityBlock(blockId: string) { return this.ownerBlocks.get(blockId) ?? null; }
  createOwnerAvailabilityBlock(record: StoredOwnerAvailabilityBlock) {
    this.ownerBlocks.set(record.blockId, record);
    this.blocks.push(record);
  }
  deleteOwnerAvailabilityBlock(blockId: string) {
    this.ownerBlocks.delete(blockId);
    this.blocks = this.blocks.filter((block) => block.blockId !== blockId);
  }
  writeAvailabilitySentinel(_vehicleId: string, _updatedAt: Date, version: number) {
    this.availabilityVersion = version;
  }
  createIntent(_record: NewIntentRecord) {}
  createHeldBlock(_record: NewIntentRecord) {}
  createAuditEvent(_record: NewIntentRecord, _requestId: string) {}
  createAvailabilityAuditEvent(event: AvailabilityAuditEvent) { this.auditEvents.push(event); }
  saveIdempotency(documentId: string, requestHash: string, result: unknown) {
    this.idempotency.set(documentId, { requestHash, result });
  }
}

const readCommand = {
  schemaVersion: 1,
  data: {
    vehicleId: 'vehicle-prado-250',
    windowStartDate: '2026-09-01',
    windowEndDate: '2026-09-06',
  },
} as const;

const setCommand = {
  schemaVersion: 1,
  idempotencyKey: 'availability_block_0001',
  data: {
    vehicleId: 'vehicle-prado-250',
    startDate: '2026-09-02',
    endDate: '2026-09-04',
    reason: 'maintenance',
    notes: 'Scheduled workshop visit',
    expectedAvailabilityVersion: 0,
  },
} as const;

describe('vehicle availability service', () => {
  let transaction: InMemoryAvailabilityTransaction;
  let repository: BookingIntentRepository;

  beforeEach(() => {
    transaction = new InMemoryAvailabilityTransaction();
    repository = { runTransaction: (work) => work(transaction) };
  });

  const dependencies = () => ({
    repository,
    now: () => new Date('2026-08-20T12:00:00.000Z'),
    createId: () => 'owner-block-1',
    createRequestId: () => 'availability-request-1',
  });

  it('returns only coarse availability to renters', async () => {
    transaction.blocks = [{
      blockId: 'private-owner-block',
      ownerId: 'owner-one',
      startDate: '2026-09-02',
      endDate: '2026-09-04',
      state: 'owner_block',
      reason: 'owner_use',
      notes: 'Private family details',
      version: 1,
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      updatedAt: new Date('2026-08-20T10:00:00.000Z'),
    }];

    const result = await getVehicleCalendar(readCommand, dependencies());

    expect(result.days[1]).toEqual({ date: '2026-09-02', available: false });
    expect(JSON.stringify(result)).not.toMatch(/private-owner-block|owner_use|family/i);
  });

  it('returns owner block details but keeps active booking holds reserved', async () => {
    transaction.availabilityVersion = 4;
    transaction.blocks = [
      {
        blockId: 'owner-block-1',
        ownerId: 'owner-one',
        startDate: '2026-09-02',
        endDate: '2026-09-03',
        state: 'owner_block',
        reason: 'maintenance',
        notes: 'Workshop',
        version: 1,
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      },
      {
        blockId: 'intent-private-1',
        ownerId: 'owner-one',
        startDate: '2026-09-04',
        endDate: '2026-09-05',
        state: 'held',
        expiresAt: new Date('2026-08-20T12:15:00.000Z'),
      },
    ];

    const result = await getOwnerVehicleCalendar(readCommand, 'owner-one', dependencies());

    expect(result.availabilityVersion).toBe(4);
    expect(result.days[1]).toMatchObject({ status: 'owner_block', ownerBlockId: 'owner-block-1' });
    expect(result.days[3]).toEqual({ date: '2026-09-04', status: 'reserved' });
    expect(JSON.stringify(result)).not.toContain('intent-private-1');
  });

  it('creates one versioned block, increments the sentinel, audits, and replays idempotently', async () => {
    const first = await setVehicleAvailabilityBlock(setCommand, 'owner-one', dependencies());
    const replay = await setVehicleAvailabilityBlock(setCommand, 'owner-one', dependencies());

    expect(replay).toEqual(first);
    expect(first.result.availabilityVersion).toBe(1);
    expect(transaction.ownerBlocks.size).toBe(1);
    expect(transaction.availabilityVersion).toBe(1);
    expect(transaction.auditEvents).toHaveLength(1);
    expect(transaction.auditEvents[0]).not.toHaveProperty('notes');
  });

  it('rejects stale clients, overlaps, cross-owner access, and client state injection', async () => {
    transaction.availabilityVersion = 2;
    await expect(setVehicleAvailabilityBlock(setCommand, 'owner-one', dependencies()))
      .rejects.toMatchObject<Partial<BookingCommandError>>({
        code: 'FAILED_PRECONDITION',
        safeDetails: { reason: 'stale_version' },
      });

    transaction.availabilityVersion = 0;
    transaction.blocks = [{
      startDate: '2026-09-03',
      endDate: '2026-09-05',
      state: 'confirmed',
    }];
    await expect(setVehicleAvailabilityBlock(setCommand, 'owner-one', dependencies()))
      .rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'VEHICLE_UNAVAILABLE' });

    transaction.blocks = [];
    await expect(setVehicleAvailabilityBlock(setCommand, 'owner-two', dependencies()))
      .rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'FORBIDDEN' });
    await expect(setVehicleAvailabilityBlock({
      ...setCommand,
      data: { ...setCommand.data, state: 'confirmed', renterId: 'renter-one' },
    }, 'owner-one', dependencies())).rejects.toMatchObject<Partial<BookingCommandError>>({
      code: 'INVALID_ARGUMENT',
    });
  });

  it('makes a stale competing owner write lose after the first sentinel increment', async () => {
    await setVehicleAvailabilityBlock(setCommand, 'owner-one', dependencies());
    await expect(setVehicleAvailabilityBlock({
      ...setCommand,
      idempotencyKey: 'availability_block_0002',
      data: {
        ...setCommand.data,
        startDate: '2026-09-05',
        endDate: '2026-09-06',
      },
    }, 'owner-one', dependencies())).rejects.toMatchObject<Partial<BookingCommandError>>({
      code: 'FAILED_PRECONDITION',
      safeDetails: { reason: 'stale_version' },
    });
  });

  it('removes only the owner block at matching aggregate and block versions', async () => {
    await setVehicleAvailabilityBlock(setCommand, 'owner-one', dependencies());
    const removed = await removeVehicleAvailabilityBlock({
      schemaVersion: 1,
      idempotencyKey: 'availability_remove_0001',
      data: {
        vehicleId: 'vehicle-prado-250',
        blockId: 'owner-block-1',
        expectedBlockVersion: 1,
        expectedAvailabilityVersion: 1,
      },
    }, 'owner-one', dependencies());

    expect(removed.result).toEqual({
      vehicleId: 'vehicle-prado-250',
      blockId: 'owner-block-1',
      removed: true,
      availabilityVersion: 2,
    });
    expect(transaction.ownerBlocks.size).toBe(0);
    expect(transaction.auditEvents.map((event) => event.eventType)).toEqual([
      'availability_block.created',
      'availability_block.removed',
    ]);
  });

  it('fails closed for invalid windows and unavailable vehicles', async () => {
    await expect(getVehicleCalendar({
      ...readCommand,
      data: { ...readCommand.data, windowEndDate: readCommand.data.windowStartDate },
    }, dependencies())).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'INVALID_ARGUMENT' });

    transaction.vehicle = null;
    await expect(getVehicleCalendar(readCommand, dependencies()))
      .rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'NOT_FOUND' });
  });
});
