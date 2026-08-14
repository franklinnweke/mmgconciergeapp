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
    expect(parseJourneyLabel('Today').pickupOffset).toBe(0);
    expect(parseJourneyLabel('Weekend').returnOffset).toBe(5);
    expect(parseJourneyLabel('unknown').label).toBe('Tomorrow');
    expect(parseFleetCategory('executive_suv')).toBe('executive_suv');
    expect(parseFleetCategory('airport')).toBeUndefined();
  });

  it('keeps Today, Tomorrow, and Weekend on distinct Lagos calendar dates', () => {
    const today = journeyDates(parseJourneyLabel('Today'));
    const tomorrow = journeyDates(parseJourneyLabel('Tomorrow'));
    const weekend = journeyDates(parseJourneyLabel('Weekend'));
    expect(today.startDate).not.toBe(tomorrow.startDate);
    expect(tomorrow.startDate).toBe(addDaysToDateOnly(today.startDate, 1));
    expect(weekend.startDate).toBe(addDaysToDateOnly(today.startDate, 3));
    expect(weekend.endDate).toBe(addDaysToDateOnly(today.startDate, 5));
    expect(parseDateOnly('2026-08-15')).toBe('2026-08-15');
    expect(parseDateOnly('15/08/2026')).toBeUndefined();
    expect(cycleJourneyOption(parseJourneyLabel('Today')).label).toBe('Tomorrow');
    expect(cycleJourneyOption(parseJourneyLabel('Weekend')).label).toBe('Today');
  });

  it('orders search results by nearest distance', () => {
    expect(filterPreviewVehicles({}).map((vehicle) => vehicle.distanceKm)).toEqual([3.2, 5.7, 6.1, 8.4]);
  });
});
