import { describe, expect, it } from 'vitest';

import {
  bookingCaseStatusSchema,
  startBookingCaseSourcingCommandSchema,
  startBookingCaseSourcingResultSchema,
} from './booking-case.js';

describe('booking case contracts', () => {
  it('locks the architecture intervention case statuses', () => {
    expect(bookingCaseStatusSchema.options).toEqual([
      'open',
      'sourcing_alternative',
      'awaiting_renter',
      'resolved_alternative',
      'refund_pending',
      'refunded',
      'closed_no_action',
    ]);
  });

  it('keeps start-sourcing input limited to case identity and optimistic version', () => {
    expect(startBookingCaseSourcingCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: 'case-sourcing-command-0001',
      data: { caseId: 'case-123', expectedVersion: 1 },
    }).data).toEqual({ caseId: 'case-123', expectedVersion: 1 });

    expect(() => startBookingCaseSourcingCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: 'case-sourcing-command-0001',
      data: {
        caseId: 'case-123',
        expectedVersion: 1,
        refundAmountKobo: 1,
      },
    })).toThrow();
  });

  it('permits only open to sourcing_alternative for this bounded command', () => {
    expect(startBookingCaseSourcingResultSchema.parse({
      requestId: 'request-123',
      result: {
        caseId: 'case-123',
        fromStatus: 'open',
        toStatus: 'sourcing_alternative',
        version: 2,
        updatedAt: '2026-09-01T12:00:00.000Z',
      },
    }).result.toStatus).toBe('sourcing_alternative');

    expect(() => startBookingCaseSourcingResultSchema.parse({
      requestId: 'request-123',
      result: {
        caseId: 'case-123',
        fromStatus: 'open',
        toStatus: 'refund_pending',
        version: 2,
        updatedAt: '2026-09-01T12:00:00.000Z',
      },
    })).toThrow();
  });
});
