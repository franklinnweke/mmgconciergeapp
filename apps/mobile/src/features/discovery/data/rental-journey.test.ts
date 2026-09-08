import { describe, expect, it } from 'vitest';
// @ts-expect-error node:fs type definitions are not included in mobile tsconfig
import { readFileSync } from 'node:fs';
import { addDaysToDateOnly } from './lagos-destinations';
import { adjustRentalDuration, currentAvailability, resolveRentalJourney } from './rental-journey';

describe('rental journey continuity', () => {
  it.each(Array.from({ length: 30 }, (_, index) => index + 1))('supports a %i-day selection without substituting a preset', (days) => {
    const startDate = '2026-12-28';
    const endDate = addDaysToDateOnly(startDate, days);
    const vehicleJourney = resolveRentalJourney(startDate, endDate);
    const reviewJourney = resolveRentalJourney(vehicleJourney.startDate, vehicleJourney.endDate);
    expect(reviewJourney).toEqual({ startDate, endDate, durationDays: days });
  });

  it('allows every integer duration in both directions and clamps at 1 and 30', () => {
    let days = 1;
    for (let expected = 2; expected <= 30; expected += 1) {
      days = adjustRentalDuration(days, 1);
      expect(days).toBe(expected);
    }
    expect(adjustRentalDuration(days, 1)).toBe(30);
    for (let expected = 29; expected >= 1; expected -= 1) {
      days = adjustRentalDuration(days, -1);
      expect(days).toBe(expected);
    }
    expect(adjustRentalDuration(days, -1)).toBe(1);
  });

  it('fails closed to loading when vehicle, dates, or retry changes', () => {
    const key = JSON.stringify(['prado', '2026-12-28', '2027-01-01', 0]);
    const result = { key, value: { status: 'available' as const, error: null } };
    expect(currentAvailability(result, key).status).toBe('available');
    for (const changed of [
      ['another-car', '2026-12-28', '2027-01-01', 0],
      ['prado', '2026-12-29', '2027-01-02', 0],
      ['prado', '2026-12-28', '2027-01-01', 1],
    ]) expect(currentAvailability(result, JSON.stringify(changed))).toEqual({ status: 'loading', error: null });
    expect(currentAvailability(null, key).status).toBe('loading');
    expect(currentAvailability({ key, value: { status: 'error', error: 'Offline' } }, key)).toEqual({ status: 'error', error: 'Offline' });
  });

  // Source-level wiring regression: pure date tests alone cannot catch a screen
  // dropping route parameters. Native interaction acceptance remains separate.
  it('wires Home and Fleet route dates through Vehicle into Booking Review', () => {
    const home = readFileSync(new URL('../screens/discovery-home-screen.tsx', import.meta.url), 'utf8');
    const fleet = readFileSync(new URL('../screens/browse-fleet-screen.tsx', import.meta.url), 'utf8');
    const vehicle = readFileSync(new URL('../screens/vehicle-detail-screen.tsx', import.meta.url), 'utf8');
    const review = readFileSync(new URL('../../booking/screens/booking-review-screen.tsx', import.meta.url), 'utf8');
    expect(home).toContain('startDate: plan.startDate');
    expect(home).toContain('endDate: plan.endDate');
    expect(home).toContain('startDate: journeyPlan.startDate');
    expect(home).toContain('endDate: journeyPlan.endDate');
    expect(fleet).toContain('startDate: routeStartDate');
    expect(fleet).toContain('endDate: routeEndDate');
    expect(fleet).toContain('...selectedJourneyDates');
    expect(vehicle).toContain('resolveRentalJourney(propStartDate, propEndDate)');
    expect(vehicle).toContain('endDate: journey.endDate, startDate: journey.startDate');
    expect(review).toContain('resolveRentalJourney(startDate, endDate)');
  });
});
