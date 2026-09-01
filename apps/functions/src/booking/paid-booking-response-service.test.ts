import { describe, expect, it } from 'vitest';

import {
  confirmBooking,
  rejectBooking,
  type PaidBookingAuditEvent,
  type PaidBookingCase,
  type PaidBookingOutboxEvent,
  type PaidBookingResponseRepository,
  type PaidBookingResponseTransaction,
  type StoredPaidBooking,
  type StoredPaidBookingBlock,
  type StoredPaidBookingIdempotency,
} from './paid-booking-response-service.js';

const now = new Date('2026-09-01T12:00:00.000Z');

function booking(overrides: Partial<StoredPaidBooking> = {}): StoredPaidBooking {
  return {
    bookingId: 'booking-prado-001',
    intentId: 'intent-prado-001',
    renterId: 'renter-001',
    ownerId: 'owner-001',
    vehicleId: 'vehicle-prado-001',
    startDate: '2026-09-10',
    endDate: '2026-09-13',
    state: 'paid_pending_owner',
    version: 1,
    blockId: 'intent-prado-001',
    ...overrides,
  };
}

function paidBlock(overrides: Partial<StoredPaidBookingBlock> = {}): StoredPaidBookingBlock {
  return {
    blockId: 'intent-prado-001',
    bookingId: 'booking-prado-001',
    intentId: 'intent-prado-001',
    renterId: 'renter-001',
    ownerId: 'owner-001',
    vehicleId: 'vehicle-prado-001',
    startDate: '2026-09-10',
    endDate: '2026-09-13',
    state: 'paid',
    ...overrides,
  };
}

function harness(seed = booking()) {
  const bookings = new Map([[seed.bookingId, seed]]);
  const blocks = new Map<string, StoredPaidBookingBlock>([[seed.blockId, paidBlock({
    blockId: seed.blockId,
    bookingId: seed.bookingId,
    intentId: seed.intentId,
    renterId: seed.renterId,
    ownerId: seed.ownerId,
    vehicleId: seed.vehicleId,
    startDate: seed.startDate,
    endDate: seed.endDate,
  })]]);
  const idempotency = new Map<string, StoredPaidBookingIdempotency>();
  const cases: PaidBookingCase[] = [];
  const auditEvents: PaidBookingAuditEvent[] = [];
  const outbox: PaidBookingOutboxEvent[] = [];
  let availabilityVersion = 8;

  const transaction: PaidBookingResponseTransaction = {
    getIdempotency: async (id) => idempotency.get(id) ?? null,
    getBooking: async (id) => bookings.get(id) ?? null,
    getBookingBlock: async (id) => blocks.get(id) ?? null,
    readAvailabilitySentinel: async () => availabilityVersion,
    updateBooking: (id, patch) => {
      const current = bookings.get(id)!;
      bookings.set(id, {
        ...current,
        state: patch.state,
        version: patch.version,
      });
    },
    updateBookingBlock: (id, state) => {
      const current = blocks.get(id)!;
      blocks.set(id, { ...current, state });
    },
    deleteBookingBlock: (id) => {
      blocks.delete(id);
    },
    writeAvailabilitySentinel: (_vehicleId, version) => {
      availabilityVersion = version;
    },
    createBookingCase: (record) => cases.push(record),
    createAuditEvent: (event) => auditEvents.push(event),
    createOutboxEvent: (event) => outbox.push(event),
    saveIdempotency: (id, record) => {
      idempotency.set(id, { requestHash: record.requestHash, result: record.result });
    },
  };
  const repository: PaidBookingResponseRepository = {
    runTransaction: async (work) => work(transaction),
  };
  return {
    repository,
    bookings,
    blocks,
    cases,
    auditEvents,
    outbox,
    availabilityVersion: () => availabilityVersion,
  };
}

function confirmCommand(idempotencyKey = 'confirm-booking-prado-001', expectedVersion = 1) {
  return {
    schemaVersion: 1 as const,
    idempotencyKey,
    data: { bookingId: 'booking-prado-001', expectedVersion },
  };
}

function rejectCommand(idempotencyKey = 'reject-booking-prado-001', expectedVersion = 1) {
  return {
    schemaVersion: 1 as const,
    idempotencyKey,
    data: {
      bookingId: 'booking-prado-001',
      expectedVersion,
      reason: 'The assigned chauffeur is no longer available.',
    },
  };
}

const owner = { uid: 'owner-001', isSuperAdmin: false };

describe('paid booking owner responses', () => {
  it('confirms only an exact R4 paid block and advances the sentinel once', async () => {
    const state = harness();
    const result = await confirmBooking(confirmCommand(), owner, {
      repository: state.repository,
      now: () => now,
      createId: () => 'outbox-confirm-001',
      createRequestId: () => 'request-confirm-001',
    });

    expect(result.result).toMatchObject({ toState: 'confirmed', version: 2 });
    expect(state.bookings.get('booking-prado-001')).toMatchObject({ state: 'confirmed', version: 2 });
    expect(state.blocks.get('intent-prado-001')?.state).toBe('confirmed');
    expect(state.availabilityVersion()).toBe(9);
    expect(state.auditEvents).toHaveLength(1);
    expect(state.outbox).toHaveLength(1);
  });

  it('rejects into intervention, releases the exact paid block, and opens a case without a refund', async () => {
    const state = harness();
    const ids = ['case-owner-rejection-001', 'outbox-reject-001'];
    const result = await rejectBooking(rejectCommand(), owner, {
      repository: state.repository,
      now: () => now,
      createId: () => ids.shift()!,
      createRequestId: () => 'request-reject-001',
    });

    expect(result.result).toMatchObject({
      caseId: 'case-owner-rejection-001',
      toState: 'intervention_required',
      version: 2,
    });
    expect(state.bookings.get('booking-prado-001')).toMatchObject({
      state: 'intervention_required',
      version: 2,
    });
    expect(state.blocks.has('intent-prado-001')).toBe(false);
    expect(state.availabilityVersion()).toBe(9);
    expect(state.cases[0]).toMatchObject({
      type: 'owner_rejection',
      status: 'open',
      ownerReason: rejectCommand().data.reason,
    });
    expect(state.auditEvents.map((event) => event.eventType)).toEqual([
      'booking.owner_rejected',
      'booking.case_opened',
    ]);
    expect(JSON.stringify(state.bookings.get('booking-prado-001'))).not.toContain('refund');
  });

  it('allows a super admin but not another owner to respond', async () => {
    const denied = harness();
    await expect(confirmBooking(confirmCommand(), {
      uid: 'owner-elsewhere',
      isSuperAdmin: false,
    }, { repository: denied.repository, now: () => now })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      safeDetails: { reason: 'not_vehicle_owner' },
    });

    const allowed = harness();
    await expect(confirmBooking(confirmCommand(), {
      uid: 'super-admin-001',
      isSuperAdmin: true,
    }, { repository: allowed.repository, now: () => now })).resolves.toMatchObject({
      result: { toState: 'confirmed' },
    });
    expect(allowed.auditEvents[0]?.actorType).toBe('admin');
  });

  it('fails stale versions before changing booking state', async () => {
    const state = harness();
    await expect(confirmBooking(confirmCommand('confirm-stale-version-001', 2), owner, {
      repository: state.repository,
      now: () => now,
    })).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      safeDetails: { reason: 'stale_version' },
    });
    expect(state.bookings.get('booking-prado-001')?.state).toBe('paid_pending_owner');
  });

  it.each(['confirmed', 'intervention_required', 'cancelled', 'refund_pending'] as const)(
    'never treats %s as a confirmable paid booking',
    async (stateName) => {
      const state = harness(booking({ state: stateName }));
      await expect(confirmBooking(confirmCommand(), owner, {
        repository: state.repository,
        now: () => now,
      })).rejects.toMatchObject({
        code: 'FAILED_PRECONDITION',
        safeDetails: { reason: 'not_paid' },
      });
    },
  );

  it('fails closed when the paid block is missing', async () => {
    const state = harness();
    state.blocks.clear();
    await expect(confirmBooking(confirmCommand(), owner, {
      repository: state.repository,
      now: () => now,
    })).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      safeDetails: { reason: 'paid_block_missing' },
    });
    expect(state.bookings.get('booking-prado-001')?.state).toBe('paid_pending_owner');
    expect(state.auditEvents).toHaveLength(0);
    expect(state.outbox).toHaveLength(0);
  });

  it.each([
    ['confirmed block', { state: 'confirmed' as const }],
    ['other booking', { bookingId: 'booking-other-001' }],
    ['other intent', { intentId: 'intent-other-001' }],
    ['other renter', { renterId: 'renter-other-001' }],
    ['other owner', { ownerId: 'owner-other-001' }],
    ['other vehicle', { vehicleId: 'vehicle-other-001' }],
    ['other dates', { startDate: '2026-09-11' }],
  ])('fails closed for %s mismatch', async (_label, patch) => {
    const state = harness();
    state.blocks.set('intent-prado-001', paidBlock(patch));
    await expect(rejectBooking(rejectCommand(), owner, {
      repository: state.repository,
      now: () => now,
    })).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      safeDetails: { reason: 'paid_block_mismatch' },
    });
    expect(state.cases).toHaveLength(0);
    expect(state.bookings.get('booking-prado-001')?.state).toBe('paid_pending_owner');
  });

  it('replays the same command without advancing twice and rejects changed payload reuse', async () => {
    const state = harness();
    const first = await confirmBooking(confirmCommand(), owner, {
      repository: state.repository,
      now: () => now,
      createRequestId: () => 'request-confirm-replay-001',
    });
    const replay = await confirmBooking(confirmCommand(), owner, {
      repository: state.repository,
      now: () => new Date('2026-09-01T12:05:00.000Z'),
    });
    expect(replay).toEqual(first);
    expect(state.auditEvents).toHaveLength(1);
    expect(state.availabilityVersion()).toBe(9);

    await expect(confirmBooking(confirmCommand('confirm-booking-prado-001', 2), owner, {
      repository: state.repository,
      now: () => now,
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('rejects short reasons before opening an intervention case', async () => {
    const state = harness();
    await expect(rejectBooking({
      ...rejectCommand(),
      data: { ...rejectCommand().data, reason: 'No driver' },
    }, owner, { repository: state.repository, now: () => now })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(state.cases).toHaveLength(0);
  });
});
