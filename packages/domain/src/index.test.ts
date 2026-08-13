import { describe, expect, it } from 'vitest';

import {
  calculateAuthoritativePrice,
  calculateBookingQuote,
  calculateChargedDays,
  canTransitionBookingIntent,
  canTransitionPaidBooking,
  dateOnlyToEpochDay,
  formatNairaFromKobo,
  intervalsOverlap,
  roundBasisPointsHalfUp,
} from './index';

describe('formatNairaFromKobo', () => {
  it('formats integer kobo as whole Nigerian naira', () => {
    expect(formatNairaFromKobo(385_000_00)).toBe('₦385,000');
  });

  it('rejects fractional kobo', () => {
    expect(() => formatNairaFromKobo(10.5)).toThrow('integer number of kobo');
  });
});

describe('date-only booking arithmetic', () => {
  it('uses exclusive calendar dates without local-time or DST arithmetic', () => {
    expect(calculateChargedDays('2026-03-28', '2026-03-31')).toBe(3);
    expect(calculateChargedDays('2026-12-31', '2027-01-02')).toBe(2);
  });

  it('rejects impossible, reversed, same-day, and overlong ranges', () => {
    expect(() => dateOnlyToEpochDay('2026-02-29')).toThrow('real calendar');
    expect(() => calculateChargedDays('2026-09-04', '2026-09-01')).toThrow();
    expect(() => calculateChargedDays('2026-09-01', '2026-09-01')).toThrow();
    expect(() => calculateChargedDays('2026-01-01', '2027-01-02')).toThrow();
  });
});

describe('authoritative pricing', () => {
  it('rounds percentage components to nearest kobo, half up', () => {
    expect(roundBasisPointsHalfUp(101, 500)).toBe(5);
    expect(roundBasisPointsHalfUp(110, 500)).toBe(6);
  });

  it('calculates renter total and owner earnings from server configuration', () => {
    expect(calculateAuthoritativePrice({
      ownerDailyRateKobo: 38_500_000,
      chargedDays: 2,
      deliveryFeeKobo: 0,
      serviceFeeBps: 800,
      serviceFeeFixedKobo: 0,
      ownerCommissionBps: 1_500,
      configVersion: 'pricing-v1',
      termsVersion: 'terms-v1',
      cancellationPolicyVersion: 'cancel-v1',
    })).toMatchObject({
      baseRentalKobo: 77_000_000,
      serviceFeeKobo: 6_160_000,
      ownerCommissionKobo: 11_550_000,
      ownerEarningsKobo: 65_450_000,
      renterTotalKobo: 83_160_000,
    });
  });

  it('fails before unsafe-integer multiplication or addition', () => {
    expect(() => calculateAuthoritativePrice({
      ownerDailyRateKobo: Number.MAX_SAFE_INTEGER,
      chargedDays: 2,
      deliveryFeeKobo: 0,
      serviceFeeBps: 0,
      serviceFeeFixedKobo: 0,
      ownerCommissionBps: 0,
      configVersion: 'v1',
      termsVersion: 'v1',
      cancellationPolicyVersion: 'v1',
    })).toThrow('safe integer');
  });
});

describe('availability and state machines', () => {
  it('treats touching exclusive intervals as available and overlap as unavailable', () => {
    expect(intervalsOverlap(
      { startDate: '2026-09-01', endDate: '2026-09-03' },
      { startDate: '2026-09-03', endDate: '2026-09-05' },
    )).toBe(false);
    expect(intervalsOverlap(
      { startDate: '2026-09-01', endDate: '2026-09-04' },
      { startDate: '2026-09-03', endDate: '2026-09-05' },
    )).toBe(true);
  });

  it('rejects illegal shortcuts and unpaid confirmation', () => {
    expect(canTransitionBookingIntent('intent_created', 'paid')).toBe(false);
    expect(canTransitionBookingIntent('checkout_pending', 'paid')).toBe(true);
    expect(canTransitionPaidBooking('paid_pending_owner', 'confirmed')).toBe(true);
    expect(canTransitionPaidBooking('cancelled', 'confirmed')).toBe(false);
  });
});

describe('calculateBookingQuote', () => {
  it('adds the eight-percent service and protection fee', () => {
    expect(calculateBookingQuote(385_000_00, 2)).toEqual({
      durationDays: 2,
      rentalKobo: 770_000_00,
      serviceFeeKobo: 61_600_00,
      totalKobo: 831_600_00,
    });
  });

  it('rejects invalid booking durations', () => {
    expect(() => calculateBookingQuote(385_000_00, 0)).toThrow('positive whole number');
  });
});
