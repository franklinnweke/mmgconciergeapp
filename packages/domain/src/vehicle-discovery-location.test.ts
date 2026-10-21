import { LAGOS_AREA_LABELS } from '@mmg/contracts';
import { describe, expect, it } from 'vitest';

import { LAGOS_AREA_CENTROIDS, resolveVehicleDiscoveryLocation, roundToApproxLatLng } from './index';

describe('resolveVehicleDiscoveryLocation', () => {
  it.each(LAGOS_AREA_LABELS)('uses the selected %s area centre when no coordinates exist', (areaLabel) => {
    const centre = LAGOS_AREA_CENTROIDS[areaLabel];
    expect(resolveVehicleDiscoveryLocation({ areaLabel, approxLatitude: null, approxLongitude: null }))
      .toEqual(roundToApproxLatLng(centre.lat, centre.lng));
    expect(resolveVehicleDiscoveryLocation({ areaLabel }))
      .toEqual(roundToApproxLatLng(centre.lat, centre.lng));
  });

  it('preserves an existing valid approximate pair', () => {
    expect(resolveVehicleDiscoveryLocation({ areaLabel: 'Ikoyi', approxLatitude: 6.45, approxLongitude: 3.43 }))
      .toEqual({ lat: 6.45, lng: 3.43 });
  });

  it.each([null, undefined, '', 'Unknown area', '__proto__', 'constructor'])('does not guess a location for area %s', (areaLabel) => {
    expect(resolveVehicleDiscoveryLocation({ areaLabel })).toBeNull();
  });

  it.each([
    { approxLatitude: 6.45, approxLongitude: null },
    { approxLatitude: null, approxLongitude: 3.43 },
    { approxLatitude: '6.45', approxLongitude: '3.43' },
    { approxLatitude: NaN, approxLongitude: 3.43 },
    { approxLatitude: 6.45, approxLongitude: Infinity },
    { approxLatitude: 0, approxLongitude: 0 },
    { approxLatitude: 51.5, approxLongitude: -0.1 },
  ])('rejects malformed or out-of-service coordinates rather than masking them', (coordinates) => {
    expect(resolveVehicleDiscoveryLocation({ areaLabel: 'Ikoyi', ...coordinates })).toBeNull();
  });
});
