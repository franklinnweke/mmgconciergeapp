import { describe, expect, it } from 'vitest';

import type {
  BlockingInterval,
  BookingAuditEvent,
  BookingNotificationOutbox,
  BookingRepository,
  BookingTransaction,
  NewIntentRecord,
  StoredAvailabilityBlock,
  StoredBookingRecord,
  StoredIdempotency,
  TrustedBookingConfig,
  TrustedVehicle,
} from './booking-repository.js';
import { setVehicleAvailabilityBlock } from './set-vehicle-availability-block-service.js';

function mockRepository(options?: {
  vehicleOwnerId?: string;
  existingBlocks?: BlockingInterval[];
}) {
  const blocks: StoredAvailabilityBlock[] = [];
  const auditEvents: BookingAuditEvent[] = [];
  const idempotencyStore = new Map<string, StoredIdempotency>();
  const vehicleOwnerId = options?.vehicleOwnerId ?? 'owner-1';
  const existingBlocks = options?.existingBlocks ?? [];

  const sampleVehicle: TrustedVehicle = {
    id: 'veh-01',
    ownerId: vehicleOwnerId,
    active: true,
    ownerDailyRateKobo: 35_000_000,
    vehicleSnapshot: {
      displayName: 'Toyota Land Cruiser Prado',
      areaLabel: 'Ikoyi',
      categoryLabel: 'Executive SUV',
    },
  };

  const tx: BookingTransaction = {
    getIdempotency: async (id: string) => idempotencyStore.get(id) ?? null,
    getVehicle: async (id: string) => (id === 'veh-01' ? sampleVehicle : null),
    getBookingConfig: async () => null,
    readAvailabilitySentinel: async () => {},
    writeAvailabilitySentinel: () => {},
    listBlockingIntervals: async () => existingBlocks,
    getAvailabilityBlocksInWindow: async () => blocks,
    createAvailabilityBlock: (block: StoredAvailabilityBlock) => {
      blocks.push(block);
    },
    removeAvailabilityBlock: (vId: string, bId: string) => {
      const idx = blocks.findIndex((b) => b.blockId === bId);
      if (idx >= 0) blocks.splice(idx, 1);
    },
    getAvailabilityBlock: async (id: string) => blocks.find((b) => b.blockId === id) ?? null,
    getIntent: async () => null,
    createIntent: () => {},
    updateIntent: () => {},
    getBooking: async () => null,
    createBooking: () => {},
    updateBooking: () => {},
    createHeldBlock: () => {},
    updateHeldBlockToBooked: () => {},
    releaseHeldBlock: () => {},
    createAuditEvent: (e: BookingAuditEvent) => {
      auditEvents.push(e);
    },
    createNotificationOutbox: () => {},
    saveIdempotency: (id: string, hash: string, result: unknown) => {
      idempotencyStore.set(id, { requestHash: hash, result });
    },
  };

  const repository: BookingRepository = {
    runTransaction: async <T>(work: (t: BookingTransaction) => Promise<T>) => work(tx),
  };

  return {
    repository,
    writes: () => ({ blocks, auditEvents }),
  };
}

describe('setVehicleAvailabilityBlock service', () => {
  const now = new Date('2026-08-18T10:00:00Z');

  const validCommand = (idempotencyKey = 'key_avail_block_0000001') => ({
    schemaVersion: 1 as const,
    idempotencyKey,
    data: {
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-15',
      reason: 'maintenance' as const,
      notes: 'Scheduled brake inspection',
    },
  });

  it('successfully creates an owner availability block when dates are clear', async () => {
    const { repository, writes } = mockRepository();

    const result = await setVehicleAvailabilityBlock(validCommand(), 'owner-1', {
      repository,
      now: () => now,
    });

    expect(result.result.block.vehicleId).toBe('veh-01');
    expect(result.result.block.type).toBe('owner_block');
    expect(result.result.block.reason).toBe('maintenance');

    const { blocks, auditEvents } = writes();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startDate).toBe('2026-09-10');
    expect(blocks[0].endDate).toBe('2026-09-15');
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].eventType).toBe('availability_block.created');
  });

  it('rejects block creation when dates overlap with an active booking hold', async () => {
    const { repository } = mockRepository({
      existingBlocks: [
        {
          startDate: '2026-09-12',
          endDate: '2026-09-14',
          state: 'held',
          expiresAt: new Date('2026-08-18T10:15:00Z'), // active hold
        },
      ],
    });

    await expect(
      setVehicleAvailabilityBlock(validCommand(), 'owner-1', {
        repository,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      safeDetails: { reason: 'availability_conflict' },
    });
  });

  it('rejects block creation when dates overlap with a confirmed booking', async () => {
    const { repository } = mockRepository({
      existingBlocks: [
        {
          startDate: '2026-09-14',
          endDate: '2026-09-18',
          state: 'confirmed',
        },
      ],
    });

    await expect(
      setVehicleAvailabilityBlock(validCommand(), 'owner-1', {
        repository,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      safeDetails: { reason: 'availability_conflict' },
    });
  });

  it('rejects when authenticated user is not the vehicle owner', async () => {
    const { repository } = mockRepository({ vehicleOwnerId: 'owner-other' });

    await expect(
      setVehicleAvailabilityBlock(validCommand(), 'owner-1', {
        repository,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
