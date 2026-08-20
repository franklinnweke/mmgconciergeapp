import { describe, expect, it } from 'vitest';

import { previewRenterTrips } from '../data/preview-renter-trips';
import { firstNameFromDisplayName, selectHomeJourney } from './home-journey';
import type { RenterTrip } from './renter-trip';

function withGroup(trip: RenterTrip, group: RenterTrip['group'], updatedAt = trip.updatedAt): RenterTrip {
  return { ...trip, group, updatedAt };
}

describe('selectHomeJourney', () => {
  it('surfaces intervention before active or upcoming trips', () => {
    const selected = selectHomeJourney(previewRenterTrips);
    expect(selected?.id).toBe('preview-intervention');
    expect(selected?.group).toBe('intervention');
  });

  it('ignores past journeys and prefers the newest active trip', () => {
    const selected = selectHomeJourney([
      withGroup(previewRenterTrips[5], 'past'),
      withGroup(previewRenterTrips[3], 'upcoming', '2026-08-13T11:00:00.000Z'),
      withGroup(previewRenterTrips[0], 'active', '2026-08-13T10:00:00.000Z'),
      withGroup(previewRenterTrips[1], 'active', '2026-08-13T12:00:00.000Z'),
    ]);
    expect(selected?.id).toBe('preview-in-progress');
  });

  it('returns null when only past journeys exist', () => {
    expect(selectHomeJourney([withGroup(previewRenterTrips[5], 'past')])).toBeNull();
  });
});

describe('home identity helpers', () => {
  it('uses the first name when available', () => {
    expect(firstNameFromDisplayName('Preview Guest')).toBe('Preview');
    expect(firstNameFromDisplayName('  ')).toBe('there');
  });
});
