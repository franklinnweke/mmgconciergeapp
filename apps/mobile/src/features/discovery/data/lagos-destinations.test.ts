import { describe, expect, it } from 'vitest';

import { filterPreviewVehicles } from './preview-discovery-gateway';
import {
  addDaysToDateOnly,
  cycleJourneyOption,
  journeyDates,
  parseDateOnly,
  parseFleetCategory,
  parseJourneyLabel,
  vehicleAreaForPickup,
} from './lagos-destinations';

describe('Lagos destination helpers', () => {
  it('keeps vehicle-area filters for districts and treats airport as a destination only', () => {
    expect(vehicleAreaForPickup('Victoria Island')).toBe('Victoria Island');
    expect(vehicleAreaForPickup('MMA International Airport')).toBeUndefined();
    expect(vehicleAreaForPickup('Eko Atlantic')).toBeUndefined();
    expect(vehicleAreaForPickup('All Lagos')).toBeUndefined();
  });

  it('parses home reservation params into fleet filters', () => {
    const today = parseJourneyLabel('Today');
    expect(today.kind).toBe('offset');
    if (today.kind === 'offset') expect(today.pickupOffset).toBe(0);
    expect(parseJourneyLabel('unknown').label).toBe('Tomorrow');
    expect(parseFleetCategory('executive_suv')).toBe('executive_suv');
    expect(parseFleetCategory('airport')).toBeUndefined();
  });

  it('keeps Today and Tomorrow on distinct Lagos calendar dates', () => {
    const now = new Date('2026-08-14T12:00:00+01:00');
    const today = journeyDates(parseJourneyLabel('Today'), now);
    const tomorrow = journeyDates(parseJourneyLabel('Tomorrow'), now);
    expect(today.startDate).not.toBe(tomorrow.startDate);
    expect(tomorrow.startDate).toBe(addDaysToDateOnly(today.startDate, 1));
    expect(parseDateOnly('2026-08-15')).toBe('2026-08-15');
    expect(parseDateOnly('15/08/2026')).toBeUndefined();
    expect(cycleJourneyOption(parseJourneyLabel('Today')).label).toBe('Tomorrow');
    expect(cycleJourneyOption(parseJourneyLabel('Weekend')).label).toBe('Today');
  });

  it('resolves Weekend to the next complete Saturday-to-Monday Lagos window', () => {
    const weekend = parseJourneyLabel('Weekend');

    expect(journeyDates(weekend, new Date('2026-08-14T12:00:00+01:00'))).toEqual({
      endDate: '2026-08-17',
      startDate: '2026-08-15',
    });
    expect(journeyDates(weekend, new Date('2026-08-15T12:00:00+01:00'))).toEqual({
      endDate: '2026-08-17',
      startDate: '2026-08-15',
    });
    expect(journeyDates(weekend, new Date('2026-08-16T12:00:00+01:00'))).toEqual({
      endDate: '2026-08-24',
      startDate: '2026-08-22',
    });
  });

  it('orders search results by nearest distance', () => {
    expect(filterPreviewVehicles({}).map((vehicle) => vehicle.distanceKm)).toEqual([3.2, 5.7, 6.1, 8.4]);
  });
});
