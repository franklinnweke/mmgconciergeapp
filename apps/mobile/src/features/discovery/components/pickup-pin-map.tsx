import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { Image } from 'expo-image';
import { useCallback, useMemo, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { isWithinLagosBBox } from '@mmg/domain';

export type PickupPinMapProps = {
  latitude: number;
  longitude: number;
  initialLatitude?: number;
  initialLongitude?: number;
  onCoordinatesChange(coords: { latitude: number; longitude: number }): void;
  onReset?(): void;
  onDragChange?(isDragging: boolean): void;
};

// At Lagos latitude (~6.5° N), 1 degree of latitude is ~111,000m.
// 1 degree of longitude is ~110,285m.
// At zoom level 17, scale is ~1.18 meters per screen point.
const METERS_PER_POINT = 1.18;
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

export function PickupPinMap({
  latitude,
  longitude,
  initialLatitude,
  initialLongitude,
  onCoordinatesChange,
  onReset,
  onDragChange,
}: PickupPinMapProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [pinScale] = useState(() => new Animated.Value(1));
  const [pinTranslateY] = useState(() => new Animated.Value(0));

  const hasAdjusted =
    initialLatitude !== undefined &&
    initialLongitude !== undefined &&
    (Math.abs(latitude - initialLatitude) > 0.00005 || Math.abs(longitude - initialLongitude) > 0.00005);

  const liftPin = useCallback(() => {
    setIsDragging(true);
    onDragChange?.(true);
    Animated.parallel([
      Animated.spring(pinScale, { toValue: 1.18, useNativeDriver: true }),
      Animated.spring(pinTranslateY, { toValue: -8, useNativeDriver: true }),
    ]).start();
  }, [onDragChange, pinScale, pinTranslateY]);

  const dropPin = useCallback(() => {
    setIsDragging(false);
    onDragChange?.(false);
    Animated.parallel([
      Animated.spring(pinScale, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.spring(pinTranslateY, { toValue: 0, friction: 5, useNativeDriver: true }),
    ]).start();
  }, [onDragChange, pinScale, pinTranslateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3,
        onPanResponderGrant: () => {
          liftPin();
        },
        onPanResponderMove: (_, gestureState) => {
          // Dragging down moves view south, meaning center moves north
          const deltaLat = -(gestureState.dy * METERS_PER_POINT) / METERS_PER_LAT_DEGREE;
          const deltaLng = -(gestureState.dx * METERS_PER_POINT) / METERS_PER_LNG_DEGREE;

          const candidate = clampToLagos(
            latitude + deltaLat * 0.15,
            longitude + deltaLng * 0.15,
          );
          if (isWithinLagosBBox(candidate.latitude, candidate.longitude)) {
            onCoordinatesChange(candidate);
          }
        },
        onPanResponderRelease: () => {
          dropPin();
        },
        onPanResponderTerminate: () => {
          dropPin();
        },
      }),
    [liftPin, dropPin, latitude, longitude, onCoordinatesChange],
  );

  const handleStep = (dirLat: number, dirLng: number) => {
    const deltaLat = (dirLat * MICRO_STEP_METERS) / METERS_PER_LAT_DEGREE;
    const deltaLng = (dirLng * MICRO_STEP_METERS) / METERS_PER_LNG_DEGREE;
    const candidate = clampToLagos(latitude + deltaLat, longitude + deltaLng);
    if (isWithinLagosBBox(candidate.latitude, candidate.longitude)) {
      onCoordinatesChange(candidate);
    }
  };

  const staticMapApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const staticMapUrl = staticMapApiKey
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=17&size=600x260&scale=2&maptype=roadmap&style=element:geometry%7Ccolor:0x1a1a1a&style=element:labels.text.fill%7Ccolor:0x808080&style=element:labels.text.stroke%7Ccolor:0x1a1a1a&style=feature:road%7Celement:geometry%7Ccolor:0x2c2c2c&style=feature:water%7Celement:geometry%7Ccolor:0x0e0e0e&key=${staticMapApiKey}`
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.instructionBadge}>
          <Ionicons color={colors.goldStrong} name="navigate-outline" size={13} />
          <Text style={styles.instructionText}>
            {isDragging ? 'Positioning arrival spot…' : 'Drag map or nudge pin to chauffeur gate'}
          </Text>
        </View>

        {hasAdjusted && onReset ? (
          <PressableScale
            accessibilityLabel="Reset pin to building center"
            accessibilityRole="button"
            onPress={onReset}
            style={styles.resetButton}
          >
            <Ionicons color={colors.goldStrong} name="refresh-outline" size={12} />
            <Text style={styles.resetText}>Reset</Text>
          </PressableScale>
        ) : null}
      </View>

      {/* Map View Container */}
      <View
        accessibilityLabel="Interactive pickup location map. Drag to adjust arrival spot."
        accessibilityRole="adjustable"
        style={styles.mapFrame}
        {...panResponder.panHandlers}
      >
        {staticMapUrl ? (
          <Image
            contentFit="cover"
            source={{ uri: staticMapUrl }}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          /* Luxury Grid Background */
          <View style={styles.gridCanvas}>
            <View style={styles.gridCircleOuter} />
            <View style={styles.gridCircleMid} />
            <View style={styles.gridCircleInner} />
            <View style={styles.gridCrosshairH} />
            <View style={styles.gridCrosshairV} />
          </View>
        )}

        {/* Subtle Scrim */}
        <View style={styles.mapScrim} pointerEvents="none" />

        {/* Center Target Marker */}
        <View pointerEvents="none" style={styles.pinAnchor}>
          <View style={styles.pinTargetRing}>
            <View style={styles.pinTargetDot} />
          </View>

          <Animated.View
            style={[
              styles.pinHead,
              {
                transform: [
                  { translateY: pinTranslateY },
                  { scale: pinScale },
                ],
              },
            ]}
          >
            <Ionicons color={colors.goldStrong} name="location" size={32} />
          </Animated.View>
        </View>

        {/* Micro-Adjustment Controls */}
        <View style={styles.controlsOverlay}>
          <View style={styles.nudgeRow}>
            <PressableScale
              accessibilityLabel="Nudge pin North"
              accessibilityRole="button"
              onPress={() => handleStep(1, 0)}
              style={styles.nudgeButton}
            >
              <Ionicons color={colors.ivory} name="chevron-up" size={16} />
            </PressableScale>
          </View>
          <View style={styles.nudgeMidRow}>
            <PressableScale
              accessibilityLabel="Nudge pin West"
              accessibilityRole="button"
              onPress={() => handleStep(0, -1)}
              style={styles.nudgeButton}
            >
              <Ionicons color={colors.ivory} name="chevron-back" size={16} />
            </PressableScale>
            <View style={styles.nudgeCenterSpacer} />
            <PressableScale
              accessibilityLabel="Nudge pin East"
              accessibilityRole="button"
              onPress={() => handleStep(0, 1)}
              style={styles.nudgeButton}
            >
              <Ionicons color={colors.ivory} name="chevron-forward" size={16} />
            </PressableScale>
          </View>
          <View style={styles.nudgeRow}>
            <PressableScale
              accessibilityLabel="Nudge pin South"
              accessibilityRole="button"
              onPress={() => handleStep(-1, 0)}
              style={styles.nudgeButton}
            >
              <Ionicons color={colors.ivory} name="chevron-down" size={16} />
            </PressableScale>
          </View>
        </View>
      </View>

      {/* Coordinate & Accuracy Footer */}
      <View style={styles.footerRow}>
        <Text style={styles.coordText}>
          {latitude.toFixed(5)}° N, {longitude.toFixed(5)}° E
        </Text>
        {hasAdjusted ? (
          <View style={styles.adjustedTag}>
            <Text style={styles.adjustedTagText}>Exact pin set</Text>
          </View>
        ) : (
          <Text style={styles.unadjustedText}>Default place center</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  adjustedTag: {
    backgroundColor: 'rgba(227, 195, 101, 0.15)',
    borderColor: colors.gold,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  adjustedTagText: {
    color: colors.goldStrong,
    fontFamily: typography.bodyMedium,
    fontSize: 10,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  container: {
    marginVertical: spacing.xs,
  },
  controlsOverlay: {
    alignItems: 'center',
    bottom: spacing.xs,
    position: 'absolute',
    right: spacing.xs,
  },
  coordText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
  },
  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  gridCanvas: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: colors.graphite,
    justifyContent: 'center',
  },
  gridCircleInner: {
    borderColor: 'rgba(247, 241, 231, 0.08)',
    borderRadius: 999,
    borderWidth: 1,
    height: 48,
    position: 'absolute',
    width: 48,
  },
  gridCircleMid: {
    borderColor: 'rgba(247, 241, 231, 0.05)',
    borderRadius: 999,
    borderWidth: 1,
    height: 96,
    position: 'absolute',
    width: 96,
  },
  gridCircleOuter: {
    borderColor: 'rgba(247, 241, 231, 0.03)',
    borderRadius: 999,
    borderWidth: 1,
    height: 160,
    position: 'absolute',
    width: 160,
  },
  gridCrosshairH: {
    backgroundColor: 'rgba(247, 241, 231, 0.06)',
    height: 1,
    position: 'absolute',
    width: '100%',
  },
  gridCrosshairV: {
    backgroundColor: 'rgba(247, 241, 231, 0.06)',
    height: '100%',
    position: 'absolute',
    width: 1,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  instructionBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  instructionText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
  },
  mapFrame: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 140,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  mapScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(4, 4, 4, 0.18)',
  },
  nudgeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(21, 21, 21, 0.85)',
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  nudgeCenterSpacer: {
    width: 8,
  },
  nudgeMidRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginVertical: 1,
  },
  nudgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  pinAnchor: {
    alignItems: 'center',
    justifyContent: 'center',
    ...StyleSheet.absoluteFill,
  },
  pinHead: {
    marginTop: -28,
  },
  pinTargetDot: {
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    height: 4,
    width: 4,
  },
  pinTargetRing: {
    alignItems: 'center',
    borderColor: colors.goldStrong,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    height: 14,
    justifyContent: 'center',
    width: 14,
  },
  resetButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  resetText: {
    color: colors.goldStrong,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
  },
  unadjustedText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
  },
});
