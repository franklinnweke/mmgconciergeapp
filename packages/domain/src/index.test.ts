import { describe, expect, it } from 'vitest';

import { calculateBookingQuote, formatNairaFromKobo } from './index';

describe('formatNairaFromKobo', () => {
  it('formats integer kobo as whole Nigerian naira', () => {
    expect(formatNairaFromKobo(385_000_00)).toBe('₦385,000');
  });

  it('rejects fractional kobo', () => {
    expect(() => formatNairaFromKobo(10.5)).toThrow('integer number of kobo');
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
