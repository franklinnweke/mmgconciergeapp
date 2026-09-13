import { describe, expect, it } from 'vitest';
import { isWithinLagosBBox } from '@mmg/domain';

describe('PickupPinMap logic and boundary constraints', () => {
  const METERS_PER_LAT_DEGREE = 111_000;
  const METERS_PER_LNG_DEGREE = 110_285;
  const MICRO_STEP_METERS = 15;

  function clampToLagos(lat: number, lng: number): { latitude: number; longitude: number } {
    const clampedLat = Math.min(6.75, Math.max(6.30, lat));
    const clampedLng = Math.min(4.30, Math.max(2.70, lng));
    return {
      latitude: Number(clampedLat.toFixed(6)),
      longitude: Number(clampedLng.toFixed(6)),
    };
  }

  it('clamps coordinates strictly within the Lagos operational envelope', () => {
    // Normal coordinates in VI
    const normal = clampToLagos(6.4269, 3.4285);
    expect(normal.latitude).toBe(6.4269);
    expect(normal.longitude).toBe(3.4285);
    expect(isWithinLagosBBox(normal.latitude, normal.longitude)).toBe(true);

    // North out-of-envelope clamp
    const tooFarNorth = clampToLagos(7.50, 3.4285);
    expect(tooFarNorth.latitude).toBe(6.75);
    expect(isWithinLagosBBox(tooFarNorth.latitude, tooFarNorth.longitude)).toBe(true);

    // South out-of-envelope clamp
    const tooFarSouth = clampToLagos(5.50, 3.4285);
    expect(tooFarSouth.latitude).toBe(6.30);
    expect(isWithinLagosBBox(tooFarSouth.latitude, tooFarSouth.longitude)).toBe(true);

    // East out-of-envelope clamp
    const tooFarEast = clampToLagos(6.4269, 5.00);
    expect(tooFarEast.longitude).toBe(4.30);
    expect(isWithinLagosBBox(tooFarEast.latitude, tooFarEast.longitude)).toBe(true);

    // West out-of-envelope clamp
    const tooFarWest = clampToLagos(6.4269, 2.00);
    expect(tooFarWest.longitude).toBe(2.70);
    expect(isWithinLagosBBox(tooFarWest.latitude, tooFarWest.longitude)).toBe(true);
  });

  it('calculates micro-step adjustments for gate pinpointing', () => {
    const startLat = 6.4269;
    const startLng = 3.4285;

    // Nudge North by 1 step (15 meters)
    const stepNorthLat = startLat + (1 * MICRO_STEP_METERS) / METERS_PER_LAT_DEGREE;
    expect(stepNorthLat).toBeGreaterThan(startLat);
    expect(stepNorthLat - startLat).toBeCloseTo(0.000135, 5);

    // Nudge East by 1 step (15 meters)
    const stepEastLng = startLng + (1 * MICRO_STEP_METERS) / METERS_PER_LNG_DEGREE;
    expect(stepEastLng).toBeGreaterThan(startLng);
    expect(stepEastLng - startLng).toBeCloseTo(0.000136, 5);
  });

  it('detects when pin has been adjusted from initial geocoded place coordinates', () => {
    const initial = { latitude: 6.4269, longitude: 3.4285 };

    const unadjusted = { latitude: 6.4269, longitude: 3.4285 };
    const hasAdjusted1 =
      Math.abs(unadjusted.latitude - initial.latitude) > 0.00005 ||
      Math.abs(unadjusted.longitude - initial.longitude) > 0.00005;
    expect(hasAdjusted1).toBe(false);

    // Adjusted by 25 meters
    const adjusted = { latitude: 6.42715, longitude: 3.4285 };
    const hasAdjusted2 =
      Math.abs(adjusted.latitude - initial.latitude) > 0.00005 ||
      Math.abs(adjusted.longitude - initial.longitude) > 0.00005;
    expect(hasAdjusted2).toBe(true);
  });
});
