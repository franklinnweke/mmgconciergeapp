import { describe, expect, it } from 'vitest';

import {
  confirmBookingCompletionCommandSchema,
  confirmBookingCompletionEnvelopeSchema,
  ownerEarningSchema,
  ownerSettlementStateSchema,
  reportTripEndedCommandSchema,
  reportTripEndedEnvelopeSchema,
  setOwnerSettlementHoldCommandSchema,
  setOwnerSettlementHoldEnvelopeSchema,
} from './earnings.js';

describe('earnings contracts', () => {
  it('validates a valid owner earning record', () => {
    const valid = {
      bookingId: 'booking-test-123',
      ownerId: 'owner-test-456',
      vehicleId: 'vehicle-test-789',
      amountKobo: 41000000,
      currency: 'NGN',
      state: 'pending',
      startDate: '2026-10-05',
      endDate: '2026-10-08',
      vehicleSnapshot: {
        displayName: 'Toyota Land Cruiser Prado 2024',
      },
      createdAt: '2026-10-01T12:00:00.000Z',
      availableAt: null,
      reviewReason: null,
      updatedAt: '2026-10-01T12:00:00.000Z',
      version: 1,
    };

    const parsed = ownerEarningSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid earning state and negative kobo', () => {
    const invalidState = {
      bookingId: 'booking-test-123',
      ownerId: 'owner-test-456',
      vehicleId: 'vehicle-test-789',
      amountKobo: -100,
      currency: 'NGN',
      state: 'non_existent_state',
      startDate: '2026-10-05',
      endDate: '2026-10-08',
      vehicleSnapshot: { displayName: 'Prado' },
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-01T12:00:00.000Z',
      version: 1,
    };

    expect(ownerEarningSchema.safeParse(invalidState).success).toBe(false);
  });

  it('validates owner settlement state schema', () => {
    const valid = {
      ownerId: 'owner-test-456',
      pendingKobo: 41000000,
      availableKobo: 25000000,
      reservedKobo: 0,
      activePayoutId: null,
      settlementHold: false,
      holdReason: null,
      version: 2,
      updatedAt: '2026-10-01T12:00:00.000Z',
    };

    expect(ownerSettlementStateSchema.safeParse(valid).success).toBe(true);
  });

  it('validates report trip ended command and requires idempotencyKey', () => {
    const valid = {
      schemaVersion: 1,
      idempotencyKey: 'idemp-key-test-12345678',
      data: {
        bookingId: 'booking-test-123',
      },
    };
    expect(reportTripEndedCommandSchema.safeParse(valid).success).toBe(true);

    const missingKey = {
      schemaVersion: 1,
      data: {
        bookingId: 'booking-test-123',
      },
    };
    expect(reportTripEndedCommandSchema.safeParse(missingKey).success).toBe(false);
  });

  it('validates confirm booking completion command and requires idempotencyKey', () => {
    const valid = {
      schemaVersion: 1,
      idempotencyKey: 'idemp-key-confirm-12345',
      data: {
        bookingId: 'booking-test-123',
      },
    };
    expect(confirmBookingCompletionCommandSchema.safeParse(valid).success).toBe(true);

    const missingKey = {
      schemaVersion: 1,
      data: {
        bookingId: 'booking-test-123',
      },
    };
    expect(confirmBookingCompletionCommandSchema.safeParse(missingKey).success).toBe(false);
  });

  it('validates set settlement hold command and requires idempotencyKey', () => {
    const valid = {
      schemaVersion: 1,
      idempotencyKey: 'idemp-key-hold-12345678',
      data: {
        ownerId: 'owner-test-456',
        hold: true,
        reason: 'Payment dispute under investigation',
      },
    };
    expect(setOwnerSettlementHoldCommandSchema.safeParse(valid).success).toBe(true);

    const missingKey = {
      schemaVersion: 1,
      data: {
        ownerId: 'owner-test-456',
        hold: true,
      },
    };
    expect(setOwnerSettlementHoldCommandSchema.safeParse(missingKey).success).toBe(false);
  });

  it('validates command result envelopes and rejects missing requestId or result', () => {
    const validReportTripEndedEnvelope = {
      requestId: 'req-report-12345678',
      result: {
        bookingId: 'booking-test-123',
        state: 'completion_pending',
        version: 2,
      },
    };
    expect(reportTripEndedEnvelopeSchema.safeParse(validReportTripEndedEnvelope).success).toBe(true);

    const validConfirmCompletionEnvelope = {
      requestId: 'req-confirm-12345678',
      result: {
        bookingId: 'booking-test-123',
        bookingState: 'completed',
        earningState: 'available',
        amountKobo: 41000000,
        version: 3,
      },
    };
    expect(confirmBookingCompletionEnvelopeSchema.safeParse(validConfirmCompletionEnvelope).success).toBe(true);

    const validSettlementHoldEnvelope = {
      requestId: 'req-hold-1234567890',
      result: {
        ownerId: 'owner-test-456',
        settlementHold: true,
        version: 2,
      },
    };
    expect(setOwnerSettlementHoldEnvelopeSchema.safeParse(validSettlementHoldEnvelope).success).toBe(true);

    // Missing requestId
    expect(
      reportTripEndedEnvelopeSchema.safeParse({
        result: validReportTripEndedEnvelope.result,
      }).success,
    ).toBe(false);

    // Malformed result
    expect(
      confirmBookingCompletionEnvelopeSchema.safeParse({
        requestId: 'req-confirm-12345678',
        result: { bookingId: 'booking-test-123', state: 'unknown' },
      }).success,
    ).toBe(false);
  });
});
