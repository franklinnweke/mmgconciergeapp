import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { type Region } from 'react-native-maps';

import { PressableScale } from '@/components/pressable-scale';
import { isWithinLagosBBox } from '@mmg/domain';
import {
  calculateDistanceMeters,
  clampToArrivalPerimeter,
  MAX_ARRIVAL_RADIUS_METERS,
  MICRO_STEP_METERS,
  METERS_PER_LAT_DEGREE,
  METERS_PER_LNG_DEGREE,
} from '../domain/arrival-perimeter';

export type PickupPinMapProps = {
  latitude: number;
  longitude: number;
  initialLatitude?: number;
  initialLongitude?: number;
  onCoordinatesChange(coords: { latitude: number; longitude: number }): void;
  onReset?(): void;
  disabled?: boolean;
};

export const LUXURY_DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a1a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#888888' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d4af37' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#757575' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#2c2c2c' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#212121' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9e9e9e' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0d0d0d' }],
  },
];

export function PickupPinMap({
  latitude,
  longitude,
  initialLatitude,
  initialLongitude,
  onCoordinatesChange,
  onReset,
  disabled = false,
}: PickupPinMapProps) {
  const mapRef = useRef<MapView>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [pinScale] = useState(() => new Animated.Value(1));
  const [pinTranslateY] = useState(() => new Animated.Value(0));

  const centerLat = initialLatitude ?? latitude;
  const centerLng = initialLongitude ?? longitude;
  const distanceFromCenter = calculateDistanceMeters(centerLat, centerLng, latitude, longitude);
  const hasAdjusted = distanceFromCenter > 5;

  const liftPin = useCallback(() => {
    setIsMoving(true);
    Animated.parallel([
      Animated.spring(pinScale, { toValue: 1.15, useNativeDriver: true }),
      Animated.spring(pinTranslateY, { toValue: -8, useNativeDriver: true }),
    ]).start();
  }, [pinScale, pinTranslateY]);

  const dropPin = useCallback(() => {
    setIsMoving(false);
    Animated.parallel([
      Animated.spring(pinScale, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.spring(pinTranslateY, { toValue: 0, friction: 5, useNativeDriver: true }),
    ]).start();
  }, [pinScale, pinTranslateY]);

  const handleRegionChange = useCallback(() => {
    if (!isMoving) {
      liftPin();
    }
  }, [isMoving, liftPin]);

  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
      dropPin();
      if (disabled) return;

      // 1. Enforce arrival perimeter bound relative to building center
      const perimeterResult = clampToArrivalPerimeter(
        centerLat,
        centerLng,
        region.latitude,
        region.longitude,
        MAX_ARRIVAL_RADIUS_METERS,
      );

      // 2. Clamp strictly inside Lagos operational bounding box
      const finalLat = Math.min(6.75, Math.max(6.3, perimeterResult.latitude));
      const finalLng = Math.min(4.3, Math.max(2.7, perimeterResult.longitude));

      if (perimeterResult.wasClamped && mapRef.current) {
        mapRef.current.animateToRegion(
          {
            latitude: finalLat,
            longitude: finalLng,
            latitudeDelta: region.latitudeDelta,
            longitudeDelta: region.longitudeDelta,
          },
          250,
        );
      }

      if (isWithinLagosBBox(finalLat, finalLng)) {
        onCoordinatesChange({ latitude: finalLat, longitude: finalLng });
      }
    },
    [centerLat, centerLng, disabled, dropPin, onCoordinatesChange],
  );

  const handleStep = useCallback(
    (dirLat: number, dirLng: number) => {
      if (disabled) return;
      const stepLat = (dirLat * MICRO_STEP_METERS) / METERS_PER_LAT_DEGREE;
      const stepLng = (dirLng * MICRO_STEP_METERS) / METERS_PER_LNG_DEGREE;

      const perimeterResult = clampToArrivalPerimeter(
        centerLat,
        centerLng,
        latitude + stepLat,
        longitude + stepLng,
        MAX_ARRIVAL_RADIUS_METERS,
      );

      if (isWithinLagosBBox(perimeterResult.latitude, perimeterResult.longitude)) {
        onCoordinatesChange({
          latitude: perimeterResult.latitude,
          longitude: perimeterResult.longitude,
        });
        mapRef.current?.animateToRegion(
          {
            latitude: perimeterResult.latitude,
            longitude: perimeterResult.longitude,
            latitudeDelta: 0.003,
            longitudeDelta: 0.003,
          },
          200,
        );
      }
    },
    [centerLat, centerLng, disabled, latitude, longitude, onCoordinatesChange],
  );

  const handleResetPress = useCallback(() => {
    if (disabled || initialLatitude === undefined || initialLongitude === undefined) return;
    mapRef.current?.animateToRegion(
      {
        latitude: initialLatitude,
        longitude: initialLongitude,
        latitudeDelta: 0.003,
        longitudeDelta: 0.003,
      },
      250,
    );
    onCoordinatesChange({ latitude: initialLatitude, longitude: initialLongitude });
    onReset?.();
  }, [disabled, initialLatitude, initialLongitude, onCoordinatesChange, onReset]);

  return (
    <View style={styles.container}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.instructionBadge}>
          <Ionicons color={colors.goldStrong} name="navigate-outline" size={13} />
          <Text style={styles.instructionText}>
            {isMoving ? 'Positioning arrival gate…' : 'Pan map to pinpoint chauffeur gate or lobby'}
          </Text>
        </View>

        {hasAdjusted && onReset ? (
          <PressableScale
            accessibilityLabel="Reset pin to building center"
            accessibilityRole="button"
            onPress={handleResetPress}
            style={styles.resetButton}
          >
            <Ionicons color={colors.goldStrong} name="refresh-outline" size={12} />
            <Text style={styles.resetText}>Reset</Text>
          </PressableScale>
        ) : null}
      </View>

      {/* Native Map Frame with Stationary Center Pin */}
      <View
        accessibilityLabel="Interactive map for exact chauffeur arrival location"
        style={styles.mapFrame}
      >
        <MapView
          customMapStyle={LUXURY_DARK_MAP_STYLE}
          initialRegion={{
            latitude,
            longitude,
            latitudeDelta: 0.003,
            longitudeDelta: 0.003,
          }}
          onRegionChange={handleRegionChange}
          onRegionChangeComplete={handleRegionChangeComplete}
          pitchEnabled={false}
          ref={mapRef}
          rotateEnabled={false}
          scrollEnabled={!disabled}
          showsCompass={false}
          style={StyleSheet.absoluteFill}
          userInterfaceStyle="dark"
          zoomEnabled={!disabled}
        />

        {/* Subtle Map Edge Scrim */}
        <View pointerEvents="none" style={styles.mapScrim} />

        {/* Stationary Center Target Pin */}
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
        {!disabled ? (
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
        ) : null}
      </View>

      {/* Coordinate & Distance Footer */}
      <View style={styles.footerRow}>
        <Text style={styles.coordText}>
          {latitude.toFixed(5)}° N, {longitude.toFixed(5)}° E
        </Text>
        {hasAdjusted ? (
          <View style={styles.adjustedTag}>
            <Text style={styles.adjustedTagText}>
              Gate {distanceFromCenter}m from center
            </Text>
          </View>
        ) : (
          <Text style={styles.unadjustedText}>Default building center</Text>
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
    height: 160,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  mapScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(4, 4, 4, 0.08)',
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
