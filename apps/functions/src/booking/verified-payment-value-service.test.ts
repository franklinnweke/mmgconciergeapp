import { describe, expect, it, vi } from 'vitest';

import { BookingCommandError } from './errors.js';
import {
  deliverVerifiedPaymentValue,
  type VerifiedPaymentValueRepository,
} from './verified-payment-value-service.js';

function createRepository(
  result: Awaited<ReturnType<VerifiedPaymentValueRepository['consumeVerifiedPayment']>> = {
    eventId: 'event-123',
    paymentId: 'payment-123',
    intentId: 'intent-123',
    outcome: 'paid_pending_owner',
    paymentState: 'succeeded',
    intentState: 'paid',
    bookingId: 'booking-generated',
  },
): VerifiedPaymentValueRepository {
  return {
    consumeVerifiedPayment: vi.fn().mockResolvedValue(result),
  };
}

describe('deliverVerifiedPaymentValue', () => {
  it('passes only the persisted event ID, stable server IDs, and server time to the repository', async () => {
    const repository = createRepository();
    const ids = ['booking-generated', 'case-generated', 'outbox-generated'];
    const result = await deliverVerifiedPaymentValue('event-123', {
      repository,
      now: () => new Date('2026-09-01T04:30:00.000Z'),
      createId: () => ids.shift()!,
      createRequestId: () => 'request-generated',
    });

    expect(result.outcome).toBe('paid_pending_owner');
    expect(repository.consumeVerifiedPayment).toHaveBeenCalledTimes(1);
    expect(repository.consumeVerifiedPayment).toHaveBeenCalledWith({
      eventId: 'event-123',
      ids: {
        bookingId: 'booking-generated',
        caseId: 'case-generated',
        outboxEventId: 'outbox-generated',
        requestId: 'request-generated',
      },
      now: new Date('2026-09-01T04:30:00.000Z'),
    });
  });

  it('accepts a trusted paid-conflict result without inventing a booking', async () => {
    const repository = createRepository({
      eventId: 'event-456',
      paymentId: 'payment-456',
      intentId: 'intent-456',
      outcome: 'paid_conflict',
      paymentState: 'succeeded',
      intentState: 'paid_conflict',
      caseId: 'case-456',
    });

    await expect(deliverVerifiedPaymentValue('event-456', {
      repository,
      createId: () => 'unused-id',
      createRequestId: () => 'request-456',
    })).resolves.toMatchObject({
      outcome: 'paid_conflict',
      caseId: 'case-456',
    });
  });

  it('rejects malformed event IDs before the repository can run', async () => {
    const repository = createRepository();

    await expect(deliverVerifiedPaymentValue('', { repository })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    } satisfies Partial<BookingCommandError>);
    expect(repository.consumeVerifiedPayment).not.toHaveBeenCalled();
  });

  it('fails closed if a repository returns a non-canonical value transition', async () => {
    const repository = {
      consumeVerifiedPayment: vi.fn().mockResolvedValue({
        eventId: 'event-123',
        paymentId: 'payment-123',
        intentId: 'intent-123',
        outcome: 'paid_pending_owner',
        paymentState: 'succeeded',
        intentState: 'paid',
        bookingId: 'booking-123',
        bookingState: 'confirmed',
      }),
    } as unknown as VerifiedPaymentValueRepository;

    await expect(deliverVerifiedPaymentValue('event-123', { repository })).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
    } satisfies Partial<BookingCommandError>);
  });
});
