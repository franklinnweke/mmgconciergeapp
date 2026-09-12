import { describe, expect, it } from 'vitest';

import { previewRenterTrips } from '../data/preview-renter-trips';
import { groupTripsForDisplay, renterTripGroupCopy } from '../domain/renter-trip';

describe('trips screen grouping', () => {
  it('labels groups accurately and keeps active, upcoming, intervention, and past scannable', () => {
    const sections = groupTripsForDisplay(previewRenterTrips);
    expect(sections.map((section) => section.label)).toEqual([
      'Active requests',
      'Upcoming',
      'Needs attention',
      'Past',
    ]);
    expect(renterTripGroupCopy.active).toBe('Active requests');
    expect(sections.find((section) => section.group === 'active')?.trips.map((trip) => trip.state))
      .toEqual(expect.arrayContaining(['checkout_pending', 'in_progress', 'paid_pending_owner']));
    expect(sections.find((section) => section.group === 'upcoming')?.trips.map((trip) => trip.state)).toEqual(['confirmed']);
    expect(sections.find((section) => section.group === 'intervention')?.trips.map((trip) => trip.state))
      .toEqual(['intervention_required']);
    expect(sections.find((section) => section.group === 'past')?.trips.map((trip) => trip.state)).toEqual(['refunded']);
    expect(sections.every((section) => section.trips.length > 0)).toBe(true);
  });
});
