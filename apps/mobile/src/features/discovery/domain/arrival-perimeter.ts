/**
 * Pickup pin adjustment limit
 *
 * Limits adjustments to a 300m radius around the selected coordinate. This is
 * not a verified property boundary or proof of a reachable entrance. The renter
 * must confirm the final pickup point and may add an entrance note.
 */

// At Lagos latitude (~6.5° N):
// 1° of latitude ≈ 111,000 meters.
// 1° of longitude ≈ 110,285 meters.
export const METERS_PER_LAT_DEGREE = 111_000;
export const METERS_PER_LNG_DEGREE = 110_285;
export const MAX_ARRIVAL_RADIUS_METERS = 300;
export const MICRO_STEP_METERS = 15;

export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = (lat2 - lat1) * METERS_PER_LAT_DEGREE;
  const dLng = (lng2 - lng1) * METERS_PER_LNG_DEGREE;
  return Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
}

export type ClampedPerimeterResult = {
  latitude: number;
  longitude: number;
  distanceMeters: number;
  wasClamped: boolean;
};

export function clampToArrivalPerimeter(
  centerLat: number,
  centerLng: number,
  targetLat: number,
  targetLng: number,
  maxRadiusMeters = MAX_ARRIVAL_RADIUS_METERS,
): ClampedPerimeterResult {
  const dLat = (targetLat - centerLat) * METERS_PER_LAT_DEGREE;
  const dLng = (targetLng - centerLng) * METERS_PER_LNG_DEGREE;
  const distance = Math.sqrt(dLat * dLat + dLng * dLng);

  if (distance <= maxRadiusMeters) {
    return {
      latitude: Number(targetLat.toFixed(6)),
      longitude: Number(targetLng.toFixed(6)),
      distanceMeters: Math.round(distance),
      wasClamped: false,
    };
  }

  const factor = maxRadiusMeters / distance;
  const clampedLat = centerLat + (targetLat - centerLat) * factor;
  const clampedLng = centerLng + (targetLng - centerLng) * factor;

  return {
    latitude: Number(clampedLat.toFixed(6)),
    longitude: Number(clampedLng.toFixed(6)),
    distanceMeters: maxRadiusMeters,
    wasClamped: true,
  };
}
