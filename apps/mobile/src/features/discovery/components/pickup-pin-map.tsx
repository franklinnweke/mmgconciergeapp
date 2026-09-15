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
      Animated.spring(pinScale, { toValue: 1.12, useNativeDriver: true }),
      Animated.spring(pinTranslateY, { toValue: -6, useNativeDriver: true }),
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
    if (!isMoving) liftPin();
  }, [isMoving, liftPin]);

  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
      dropPin();
      if (disabled) return;

      const perimeterResult = clampToArrivalPerimeter(
        centerLat,
        centerLng,
        region.latitude,
        region.longitude,
        MAX_ARRIVAL_RADIUS_METERS,
      );

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
      <View style={styles.headerRow}>
        <Text style={styles.instructionText}>
          {isMoving ? 'Positioning pickup point…' : 'Pan the map to adjust the exact pickup point'}
        </Text>
        {hasAdjusted && onReset ? (
          <PressableScale
            accessibilityLabel="Reset pickup point"
            accessibilityRole="button"
            onPress={handleResetPress}
            style={styles.resetButton}
          >
            <Text style={styles.resetText}>Reset pin</Text>
          </PressableScale>
        ) : null}
      </View>

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

        <View pointerEvents="none" style={styles.mapScrim} />

        <View pointerEvents="none" style={styles.pinAnchor}>
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
            <Ionicons color={colors.goldStrong} name="location" size={30} />
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.xs,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  instructionText: {
    color: colors.silver,
    flex: 1,
    fontFamily: typography.body,
    fontSize: 11,
    minWidth: 0,
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
  pinAnchor: {
    alignItems: 'center',
    justifyContent: 'center',
    ...StyleSheet.absoluteFill,
  },
  pinHead: {
    marginTop: -18,
  },
  resetButton: {
    flexShrink: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  resetText: {
    color: colors.goldStrong,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
  },
});
