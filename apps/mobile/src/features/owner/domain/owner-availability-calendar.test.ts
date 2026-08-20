import type { OwnerVehicleCalendarDay } from '@mmg/contracts';
import { describe, expect, it } from 'vitest';

import {
  isDateInSelection,
  selectOwnerAvailabilityDate,
  type AvailabilitySelection,
} from './owner-availability-calendar';

const days: OwnerVehicleCalendarDay[] = [
  { date: '2026-09-01', status: 'available' },
  { date: '2026-09-02', status: 'available' },
  { date: '2026-09-03', status: 'reserved' },
  { date: '2026-09-04', status: 'available' },
];

describe('owner availability calendar selection', () => {
  it('creates a half-open one-day or multi-day selection', () => {
    const empty: AvailabilitySelection = { startDate: null, endDate: null };
    const started = selectOwnerAvailabilityDate(empty, '2026-09-01', days);
    const oneDay = selectOwnerAvailabilityDate(started.selection, '2026-09-01', days);
    const twoDays = selectOwnerAvailabilityDate(started.selection, '2026-09-02', days);

    expect(oneDay.selection).toEqual({ startDate: '2026-09-01', endDate: '2026-09-02' });
    expect(twoDays.selection).toEqual({ startDate: '2026-09-01', endDate: '2026-09-03' });
    expect(isDateInSelection('2026-09-02', twoDays.selection)).toBe(true);
    expect(isDateInSelection('2026-09-03', twoDays.selection)).toBe(false);
  });

  it('does not allow a reserved date or a range crossing one', () => {
    const selection = { startDate: '2026-09-01', endDate: null };
    expect(selectOwnerAvailabilityDate(selection, '2026-09-03', days).error).toMatch(/available/);
    expect(selectOwnerAvailabilityDate(selection, '2026-09-04', days).error).toMatch(/includes/);
  });
});
