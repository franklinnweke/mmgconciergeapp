import { describe, expect, it } from 'vitest';
import {
  calculateDistanceMeters,
  clampToArrivalPerimeter,
  MAX_ARRIVAL_RADIUS_METERS,
  METERS_PER_LAT_DEGREE,
  METERS_PER_LNG_DEGREE,
  MICRO_STEP_METERS,
} from './arrival-perimeter';

describe('Arrival Perimeter Domain Logic', () => {
  const centerLat = 6.4269; // Eko Hotel, VI
  const centerLng = 3.4285;

  it('calculates accurate distance between coordinates in Lagos', () => {
    // 0 meters at same location
    expect(calculateDistanceMeters(centerLat, centerLng, centerLat, centerLng)).toBe(0);

    // 15 meters North
    const deltaLat15m = MICRO_STEP_METERS / METERS_PER_LAT_DEGREE;
    const distNorth = calculateDistanceMeters(centerLat, centerLng, centerLat + deltaLat15m, centerLng);
    expect(distNorth).toBe(15);

    // 15 meters East
    const deltaLng15m = MICRO_STEP_METERS / METERS_PER_LNG_DEGREE;
    const distEast = calculateDistanceMeters(centerLat, centerLng, centerLat, centerLng + deltaLng15m);
    expect(distEast).toBe(15);
  });

  it('permits pin adjustments within the 300m property perimeter', () => {
    // 50m North-East
    const dLat = 35 / METERS_PER_LAT_DEGREE;
    const dLng = 35 / METERS_PER_LNG_DEGREE;
    const targetLat = centerLat + dLat;
    const targetLng = centerLng + dLng;

    const result = clampToArrivalPerimeter(centerLat, centerLng, targetLat, targetLng);
    expect(result.wasClamped).toBe(false);
    expect(result.distanceMeters).toBeLessThanOrEqual(MAX_ARRIVAL_RADIUS_METERS);
    expect(result.latitude).toBeCloseTo(targetLat, 5);
    expect(result.longitude).toBeCloseTo(targetLng, 5);
  });

  it('strictly clamps pin adjustments exceeding the 300m property perimeter', () => {
    // Attempt to drag 1,200m North-East (to another district)
    const farLat = centerLat + 800 / METERS_PER_LAT_DEGREE;
    const farLng = centerLng + 800 / METERS_PER_LNG_DEGREE;

    const result = clampToArrivalPerimeter(centerLat, centerLng, farLat, farLng);
    expect(result.wasClamped).toBe(true);
    expect(result.distanceMeters).toBe(MAX_ARRIVAL_RADIUS_METERS);

    // Verify clamped point is exactly on the 300m perimeter from center
    const actualDist = calculateDistanceMeters(centerLat, centerLng, result.latitude, result.longitude);
    expect(actualDist).toBe(MAX_ARRIVAL_RADIUS_METERS);

    // Verify direction is preserved (ratio of dLat to dLng remains identical)
    const originalRatio = (farLat - centerLat) / (farLng - centerLng);
    const clampedRatio = (result.latitude - centerLat) / (result.longitude - centerLng);
    expect(clampedRatio).toBeCloseTo(originalRatio, 3);
  });

  it('handles exact boundary edge cases at 300 meters', () => {
    const edgeLat = centerLat + MAX_ARRIVAL_RADIUS_METERS / METERS_PER_LAT_DEGREE;
    const result = clampToArrivalPerimeter(centerLat, centerLng, edgeLat, centerLng);
    expect(result.wasClamped).toBe(false);
    expect(result.distanceMeters).toBe(MAX_ARRIVAL_RADIUS_METERS);
    expect(result.latitude).toBeCloseTo(edgeLat, 5);
  });
});
