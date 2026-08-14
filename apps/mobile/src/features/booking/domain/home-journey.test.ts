import { describe, expect, it } from 'vitest';

import { previewRenterTrips } from '../data/preview-renter-trips';
import { firstNameFromDisplayName, greetingForLagos, selectHomeJourney } from './home-journey';
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

describe('home greeting helpers', () => {
  it('uses the first name and a Lagos-aware greeting', () => {
    expect(firstNameFromDisplayName('Preview Guest')).toBe('Preview');
    expect(firstNameFromDisplayName('  ')).toBe('there');
    expect(greetingForLagos(new Date('2026-08-13T08:15:00+01:00'))).toBe('Good morning');
    expect(greetingForLagos(new Date('2026-08-13T14:15:00+01:00'))).toBe('Good afternoon');
    expect(greetingForLagos(new Date('2026-08-13T19:15:00+01:00'))).toBe('Good evening');
  });
});
