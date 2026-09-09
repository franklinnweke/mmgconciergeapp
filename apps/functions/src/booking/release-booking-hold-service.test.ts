import { beforeEach, describe, expect, it } from 'vitest';

import {
  releaseBookingHold,
  type BookingHoldReleaseRepository,
  type ReleaseBookingHoldInput,
} from './release-booking-hold-service.js';
import { BookingCommandError } from './errors.js';

class InMemoryHoldReleaseRepository implements BookingHoldReleaseRepository {
  intents = new Map<string, {
    renterId: string;
    vehicleId: string;
    state: string;
  }>();
  blocks = new Set<string>();
  released = new Map<string, { renterId: string; releasedAt: string }>();
  idempotency = new Map<string, { requestHash: string; result: unknown }>();
  sentinelVersions = new Map<string, number>();
  auditEvents: Array<{
    eventType: string;
    entityId: string;
    actorId: string;
    fromState: string;
    toState: string;
  }> = [];

  async releaseHold(input: ReleaseBookingHoldInput) {
    // 1. Check idempotency
    const existingIdempotency = this.idempotency.get(input.idempotencyDocumentId);
    if (existingIdempotency) {
      if (existingIdempotency.requestHash !== input.requestHash) {
        throw new BookingCommandError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }
      return existingIdempotency.result as any;
    }

    // 2. Check released hold for idempotent retry
    const existingRelease = this.released.get(input.intentId);
    if (existingRelease) {
      if (existingRelease.renterId !== input.renterId) {
        throw new BookingCommandError('FORBIDDEN', 'You cannot release this booking hold.');
      }
      return {
        requestId: input.requestId,
        result: {
          intentId: input.intentId,
          released: true as const,
          releasedAt: existingRelease.releasedAt,
        },
      };
    }

    // 3. Read intent
    const intent = this.intents.get(input.intentId);
    if (!intent) {
      throw new BookingCommandError('NOT_FOUND', 'Booking intent was not found.');
    }
    if (intent.renterId !== input.renterId) {
      throw new BookingCommandError('FORBIDDEN', 'You cannot release this booking hold.');
    }
    if (intent.state !== 'intent_created') {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        'Only active unpaid date holds can be released.',
      );
    }

    // 4. Remove block
    this.blocks.delete(input.intentId);

    // 5. Update sentinel
    const currentVersion = this.sentinelVersions.get(intent.vehicleId) ?? 0;
    this.sentinelVersions.set(intent.vehicleId, currentVersion + 1);

    // 6. Delete intent
    this.intents.delete(input.intentId);

    // 7. Save released record
    const releasedAtIso = input.now.toISOString();
    this.released.set(input.intentId, {
      renterId: input.renterId,
      releasedAt: releasedAtIso,
    });

    // 8. Save audit event
    this.auditEvents.push({
      actorId: input.renterId,
      eventType: 'booking_hold.released',
      entityId: input.intentId,
      fromState: 'intent_created',
      toState: 'released',
    });

    const result = {
      requestId: input.requestId,
      result: {
        intentId: input.intentId,
        released: true as const,
        releasedAt: releasedAtIso,
      },
    };

    this.idempotency.set(input.idempotencyDocumentId, {
      requestHash: input.requestHash,
      result,
    });

    return result;
  }
}

describe('releaseBookingHold domain service', () => {
  let repository: InMemoryHoldReleaseRepository;

  beforeEach(() => {
    repository = new InMemoryHoldReleaseRepository();
    repository.intents.set('intent-1', {
      renterId: 'renter-one',
      vehicleId: 'vehicle-one',
      state: 'intent_created',
    });
    repository.blocks.add('intent-1');
  });

  const execute = (
    command: unknown = { schemaVersion: 1, idempotencyKey: 'release_key_0123456789', data: { intentId: 'intent-1' } },
    renterId = 'renter-one',
  ) =>
    releaseBookingHold(command, renterId, {
      repository,
      now: () => new Date('2026-09-09T14:00:00.000Z'),
      createRequestId: () => 'req-test-1',
    });

  it('allows a renter to release their own intent_created hold', async () => {
    const response = await execute();
    expect(response).toEqual({
      requestId: 'req-test-1',
      result: {
        intentId: 'intent-1',
        released: true,
        releasedAt: '2026-09-09T14:00:00.000Z',
      },
    });

    expect(repository.intents.has('intent-1')).toBe(false);
    expect(repository.blocks.has('intent-1')).toBe(false);
    expect(repository.sentinelVersions.get('vehicle-one')).toBe(1);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.auditEvents[0]).toMatchObject({
      actorId: 'renter-one',
      eventType: 'booking_hold.released',
      fromState: 'intent_created',
      toState: 'released',
    });
  });

  it('safely handles missing or expired block when intent is released', async () => {
    repository.blocks.delete('intent-1'); // Block was already removed/expired
    const response = await execute();
    expect(response.result.released).toBe(true);
    expect(repository.intents.has('intent-1')).toBe(false);
    expect(repository.sentinelVersions.get('vehicle-one')).toBe(1);
  });

  it('rejects another renter attempting to release the hold with FORBIDDEN', async () => {
    await expect(execute(undefined, 'renter-two')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    // State remains intact
    expect(repository.intents.has('intent-1')).toBe(true);
    expect(repository.blocks.has('intent-1')).toBe(true);
  });

  it('rejects an intent in checkout_pending with FAILED_PRECONDITION', async () => {
    repository.intents.set('intent-1', {
      renterId: 'renter-one',
      vehicleId: 'vehicle-one',
      state: 'checkout_pending',
    });

    await expect(execute()).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
    });
  });

  it('rejects paid and other non-intent_created states', async () => {
    for (const state of ['paid', 'paid_conflict', 'confirmed', 'cancelled']) {
      repository.intents.set('intent-1', {
        renterId: 'renter-one',
        vehicleId: 'vehicle-one',
        state,
      });

      await expect(execute()).rejects.toMatchObject({
        code: 'FAILED_PRECONDITION',
      });
    }
  });

  it('is idempotent on repeated release requests', async () => {
    const first = await execute();
    expect(first.result.released).toBe(true);

    // Second call with same intent and renter
    const second = await execute();
    expect(second.result.released).toBe(true);
    expect(second.result.intentId).toBe('intent-1');
  });

  it('rejects release if intent does not exist', async () => {
    repository.intents.delete('intent-1');
    await expect(execute()).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('accepts concise { intentId } format directly', async () => {
    const response = await releaseBookingHold({ intentId: 'intent-1' }, 'renter-one', {
      repository,
      now: () => new Date('2026-09-09T14:00:00.000Z'),
      createRequestId: () => 'req-concise-1',
    });
    expect(response.result.released).toBe(true);
  });
});
