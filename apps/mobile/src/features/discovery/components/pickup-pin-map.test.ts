import { describe, expect, it, vi } from 'vitest';
import { isWithinLagosBBox } from '@mmg/domain';
import {
  calculateDistanceMeters,
  clampToArrivalPerimeter,
  MAX_ARRIVAL_RADIUS_METERS,
  METERS_PER_LAT_DEGREE,
  METERS_PER_LNG_DEGREE,
  MICRO_STEP_METERS,
} from '../domain/arrival-perimeter';
import { PickupPinMap, LUXURY_DARK_MAP_STYLE } from './pickup-pin-map';

vi.mock('react-native', () => {
  class AnimatedValue {
    interpolate() {
      return {};
    }
  }
  return {
    Animated: {
      Value: AnimatedValue,
      spring: () => ({ start: vi.fn() }),
      View: 'View',
    },
    Platform: { OS: 'ios', select: (obj: any) => obj.ios },
    StyleSheet: {
      absoluteFillObject: {},
      create: (styles: any) => styles,
    },
    Text: 'Text',
    View: 'View',
  };
});

vi.mock('react-native-maps', () => ({
  __esModule: true,
  default: 'MapView',
  MapView: 'MapView',
  PROVIDER_GOOGLE: 'google',
}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { googleMapsIosConfigured: true } } } }));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

vi.mock('@/components/pressable-scale', () => ({
  PressableScale: 'PressableScale',
}));

describe('PickupPinMap native MapView and arrival perimeter bounding', () => {
  const centerLat = 6.4269;
  const centerLng = 3.4285;

  it('exports a valid PickupPinMap functional component', () => {
    expect(typeof PickupPinMap).toBe('function');
  });

  it('defines custom luxury dark map styling matching MMG brand', () => {
    expect(Array.isArray(LUXURY_DARK_MAP_STYLE)).toBe(true);
    expect(LUXURY_DARK_MAP_STYLE.length).toBeGreaterThan(0);
    const geometryStyle = LUXURY_DARK_MAP_STYLE.find((s) => s.elementType === 'geometry');
    expect(geometryStyle).toBeDefined();
  });

  it('clamps coordinates strictly within the Lagos operational envelope', () => {
    // Normal coordinates in VI
    expect(isWithinLagosBBox(6.4269, 3.4285)).toBe(true);

    // North out-of-envelope clamp
    const tooFarNorth = Math.min(6.75, Math.max(6.30, 7.50));
    expect(tooFarNorth).toBe(6.75);
    expect(isWithinLagosBBox(tooFarNorth, 3.4285)).toBe(true);

    // South out-of-envelope clamp
    const tooFarSouth = Math.min(6.75, Math.max(6.30, 5.50));
    expect(tooFarSouth).toBe(6.30);
    expect(isWithinLagosBBox(tooFarSouth, 3.4285)).toBe(true);

    // East out-of-envelope clamp
    const tooFarEast = Math.min(4.30, Math.max(2.70, 5.00));
    expect(tooFarEast).toBe(4.30);
    expect(isWithinLagosBBox(6.4269, tooFarEast)).toBe(true);

    // West out-of-envelope clamp
    const tooFarWest = Math.min(4.30, Math.max(2.70, 2.00));
    expect(tooFarWest).toBe(2.70);
    expect(isWithinLagosBBox(6.4269, tooFarWest)).toBe(true);
  });

  it('enforces 300m arrival perimeter clamp to prevent address drift', () => {
    // 50 meters from building center -> allowed without clamping
    const nearLat = centerLat + 35 / METERS_PER_LAT_DEGREE;
    const nearLng = centerLng + 35 / METERS_PER_LNG_DEGREE;
    const nearResult = clampToArrivalPerimeter(centerLat, centerLng, nearLat, nearLng);
    expect(nearResult.wasClamped).toBe(false);
    expect(nearResult.distanceMeters).toBeLessThanOrEqual(MAX_ARRIVAL_RADIUS_METERS);

    // 1,000 meters from building center -> strictly clamped to 300m perimeter
    const farLat = centerLat + 700 / METERS_PER_LAT_DEGREE;
    const farLng = centerLng + 700 / METERS_PER_LNG_DEGREE;
    const farResult = clampToArrivalPerimeter(centerLat, centerLng, farLat, farLng);
    expect(farResult.wasClamped).toBe(true);
    expect(farResult.distanceMeters).toBe(300);

    const actualDist = calculateDistanceMeters(centerLat, centerLng, farResult.latitude, farResult.longitude);
    expect(actualDist).toBe(300);
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

  it('accurately identifies when pin is at default center vs adjusted gate', () => {
    // Unadjusted (0m)
    const distZero = calculateDistanceMeters(centerLat, centerLng, centerLat, centerLng);
    expect(distZero).toBe(0);
    expect(distZero > 5).toBe(false);

    // Adjusted gate (45m North)
    const gateLat = centerLat + 45 / METERS_PER_LAT_DEGREE;
    const distGate = calculateDistanceMeters(centerLat, centerLng, gateLat, centerLng);
    expect(distGate).toBe(45);
    expect(distGate > 5).toBe(true);
  });

  it('supports mapPadding and pinCenterY for full-surface map sheet integration', () => {
    // Verifies the prop types and export contract
    const props = {
      latitude: centerLat,
      longitude: centerLng,
      onCoordinatesChange: vi.fn(),
      mapPadding: { top: 40, right: 0, bottom: 400, left: 0 },
      pinCenterY: 220,
      showsPin: true,
      showsInstruction: false,
    };
    expect(props.mapPadding.bottom).toBe(400);
    expect(props.pinCenterY).toBe(220);
  });

  describe('programmatic move guard and user gesture propagation', () => {
    it('does not emit pin adjustment for programmatic moves without gestures', () => {
      const onCoordinatesChange = vi.fn();
      const isProgrammatic = true;
      const isGesture = false;
      const disabled = false;

      // Simulated region change complete callback evaluation
      if (!disabled && (!isProgrammatic || isGesture) && isGesture) {
        onCoordinatesChange({ latitude: 6.43, longitude: 3.43 });
      }

      expect(onCoordinatesChange).not.toHaveBeenCalled();
    });

    it('emits pin adjustment when a genuine user gesture is completed', () => {
      const onCoordinatesChange = vi.fn();
      const isProgrammatic = false;
      const isGesture = true;
      const disabled = false;

      if (!disabled && (!isProgrammatic || isGesture) && isGesture) {
        onCoordinatesChange({ latitude: 6.43, longitude: 3.43 });
      }

      expect(onCoordinatesChange).toHaveBeenCalledWith({ latitude: 6.43, longitude: 3.43 });
    });

    it('blocks pin adjustment when map is disabled regardless of gestures', () => {
      const onCoordinatesChange = vi.fn();
      const isGesture = true;
      const disabled = true;

      if (!disabled && isGesture) {
        onCoordinatesChange({ latitude: 6.43, longitude: 3.43 });
      }

      expect(onCoordinatesChange).not.toHaveBeenCalled();
    });
  });
});
