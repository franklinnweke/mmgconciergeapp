import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_OWNER_RESPONSE_SLA_MINUTES,
  emitOwnerResponseSlaSignals,
  type OwnerResponseSlaRepository,
} from './owner-response-sla-service.js';

function repository(input: {
  configured?: number | null;
  createdAt?: Date;
  recordResult?: 'created' | 'noop';
} = {}): OwnerResponseSlaRepository {
  return {
    getConfiguredSlaMinutes: vi.fn(async () =>
      input.configured === undefined ? null : input.configured),
    listPaidPendingOwnerBookings: vi.fn(async () => [{
      bookingId: 'booking-sla-001',
      ownerId: 'owner-sla-001',
      renterId: 'renter-sla-001',
      vehicleId: 'vehicle-sla-001',
      state: 'paid_pending_owner' as const,
      createdAt: input.createdAt ?? new Date('2026-09-01T11:00:00.000Z'),
    }]),
    recordExceededSla: vi.fn(async () => input.recordResult ?? 'created'),
  };
}

describe('owner response SLA signals', () => {
  it('uses the architecture default of 30 minutes when no private config exists', async () => {
    const repo = repository();
    const result = await emitOwnerResponseSlaSignals({
      repository: repo,
      now: () => new Date('2026-09-01T11:30:00.000Z'),
    });

    expect(result).toEqual({
      slaMinutes: DEFAULT_OWNER_RESPONSE_SLA_MINUTES,
      scanned: 1,
      alerted: 1,
    });
    expect(repo.recordExceededSla).toHaveBeenCalledWith({
      bookingId: 'booking-sla-001',
      cutoff: new Date('2026-09-01T11:00:00.000Z'),
      slaMinutes: 30,
      now: new Date('2026-09-01T11:30:00.000Z'),
    });
  });

  it('respects an explicit positive private SLA configuration', async () => {
    const repo = repository({ configured: 45 });
    const result = await emitOwnerResponseSlaSignals({
      repository: repo,
      now: () => new Date('2026-09-01T11:45:00.000Z'),
    });
    expect(result.slaMinutes).toBe(45);
    expect(result.alerted).toBe(1);
  });

  it('does not signal a booking that has not yet crossed the SLA cutoff', async () => {
    const repo = repository({
      createdAt: new Date('2026-09-01T11:01:00.000Z'),
    });
    const result = await emitOwnerResponseSlaSignals({
      repository: repo,
      now: () => new Date('2026-09-01T11:30:00.000Z'),
    });

    expect(result.alerted).toBe(0);
    expect(repo.recordExceededSla).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN])('fails closed for malformed configured SLA value %s', async (configured) => {
    const repo = repository({ configured });
    await expect(emitOwnerResponseSlaSignals({ repository: repo })).rejects.toMatchObject({
      code: 'CONFIGURATION_UNAVAILABLE',
    });
    expect(repo.recordExceededSla).not.toHaveBeenCalled();
  });
});
