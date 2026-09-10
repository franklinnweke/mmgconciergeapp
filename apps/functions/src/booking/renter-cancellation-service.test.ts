import { describe, expect, it, vi } from 'vitest';

import type { RenterCancellationRepository } from './renter-cancellation-service.js';
import {
  cancelPaidBooking,
  cancelRentalRequest,
  quoteBookingCancellation,
} from './renter-cancellation-service.js';

function command(idempotencyKey: string, data: Record<string, unknown>) {
  return { schemaVersion: 1, idempotencyKey, data };
}

function repository(): RenterCancellationRepository {
  return {
    cancelRentalRequest: vi.fn(async (input) => ({
      requestId: input.requestId,
      state: 'cancelled_by_renter' as const,
      version: input.expectedVersion + 1,
      cancelledAt: input.now.toISOString(),
      inventoryReleased: false,
    })),
    quoteBookingCancellation: vi.fn(async (input) => ({
      quote: {
        bookingId: input.bookingId,
        bookingState: 'confirmed' as const,
        bookingVersion: 4,
        startDate: '2026-10-20',
        amountPaidKobo: 120_000_000,
        currency: 'NGN' as const,
        cancellationPolicyVersion: 'policy-v1',
        financialOutcome: 'manual_review_required' as const,
        estimatedRefundKobo: null,
        estimatedCancellationFeeKobo: null,
        selfServiceAllowed: true,
        inventoryAction: 'release_on_confirmation' as const,
        consequenceText: 'Payment is captured and refund value requires manual policy review.',
      },
    })),
    cancelPaidBooking: vi.fn(async (input) => ({
      requestId: input.commandRequestId,
      result: {
        bookingId: input.bookingId,
        state: 'refund_pending' as const,
        version: input.expectedVersion + 1,
        caseId: input.caseId,
        cancelledAt: input.now.toISOString(),
        cancellationPolicyVersion: 'policy-v1',
        amountPaidKobo: 120_000_000,
        financialOutcome: 'manual_review_required' as const,
        inventoryReleased: true,
      },
    })),
    resolvePendingCancellations: vi.fn(async () => ({ scanned: 0, resolved: 0, protected: 0, invalid: 0 })),
  };
}

describe('renter cancellation service', () => {
  it('passes renter request version and stable command metadata to the repository', async () => {
    const repo = repository();
    const now = new Date('2026-09-10T16:00:00.000Z');
    const result = await cancelRentalRequest(
      command('cancel-request-one', { requestId: 'request-one', expectedVersion: 3 }),
      'renter-one',
      { repository: repo, now: () => now, createRequestId: () => 'command-one' },
    );

    expect(result.state).toBe('cancelled_by_renter');
    expect(repo.cancelRentalRequest).toHaveBeenCalledWith(expect.objectContaining({
      renterId: 'renter-one',
      requestId: 'request-one',
      expectedVersion: 3,
      commandRequestId: 'command-one',
      now,
    }));
  });

  it('returns a paid cancellation quote without inventing refund or fee values', async () => {
    const repo = repository();
    const result = await quoteBookingCancellation(
      { schemaVersion: 1, data: { bookingId: 'booking-one' } },
      'renter-one',
      { repository: repo, now: () => new Date('2026-09-10T16:00:00.000Z') },
    );

    expect(result.quote).toMatchObject({
      bookingId: 'booking-one',
      bookingVersion: 4,
      financialOutcome: 'manual_review_required',
      estimatedRefundKobo: null,
      estimatedCancellationFeeKobo: null,
    });
  });

  it('uses the quoted booking version as the optimistic-lock input for paid cancellation', async () => {
    const repo = repository();
    const result = await cancelPaidBooking(
      command('cancel-booking-one', { bookingId: 'booking-one', expectedVersion: 4 }),
      'renter-one',
      {
        repository: repo,
        now: () => new Date('2026-09-10T16:00:00.000Z'),
        createCaseId: () => 'case-one',
        createRequestId: () => 'command-two',
      },
    );

    expect(result.result).toMatchObject({
      bookingId: 'booking-one',
      state: 'refund_pending',
      caseId: 'case-one',
      inventoryReleased: true,
    });
    expect(repo.cancelPaidBooking).toHaveBeenCalledWith(expect.objectContaining({
      renterId: 'renter-one',
      bookingId: 'booking-one',
      expectedVersion: 4,
      caseId: 'case-one',
      commandRequestId: 'command-two',
    }));
  });

  it('fails closed on malformed cancellation commands', async () => {
    const repo = repository();
    await expect(cancelRentalRequest(
      command('bad-request', { requestId: 'request-one', expectedVersion: 0 }),
      'renter-one',
      { repository: repo },
    )).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    await expect(cancelPaidBooking(
      command('bad-booking', { bookingId: 'booking-one', expectedVersion: 0 }),
      'renter-one',
      { repository: repo },
    )).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});
