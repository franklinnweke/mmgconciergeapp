import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@mmg/brand';
import { isWithinLagosBBox } from '@mmg/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import MapView, { type Region } from 'react-native-maps';

import { PressableScale } from '@/components/pressable-scale';
import {
  calculateDistanceMeters,
  clampToArrivalPerimeter,
  MAX_ARRIVAL_RADIUS_METERS,
} from '../domain/arrival-perimeter';
import { shouldPropagateRegionChange } from '../domain/pickup-location-sheet-state';

export type PickupPinMapProps = {
  latitude: number;
  longitude: number;
  initialLatitude?: number;
  initialLongitude?: number;
  onCoordinatesChange(coords: { latitude: number; longitude: number }): void;
  onReset?(): void;
  disabled?: boolean;
  mapPadding?: { top: number; right: number; bottom: number; left: number };
  pinCenterY?: number;
  showsPin?: boolean;
  showsInstruction?: boolean;
  style?: StyleProp<ViewStyle>;
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
  mapPadding,
  pinCenterY,
  showsPin = true,
  showsInstruction = false,
  style,
}: PickupPinMapProps) {
  const mapRef = useRef<MapView>(null);
  const lastReportedCoords = useRef<{ lat: number; lng: number }>({ lat: latitude, lng: longitude });
  const isProgrammaticMove = useRef(false);
  const isUserInteracting = useRef(false);
  const programmaticTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isMoving, setIsMoving] = useState(false);
  const [pinScale] = useState(() => new Animated.Value(1));
  const [pinTranslateY] = useState(() => new Animated.Value(0));

  const centerLat = initialLatitude ?? latitude;
  const centerLng = initialLongitude ?? longitude;
  const distanceFromCenter = calculateDistanceMeters(centerLat, centerLng, latitude, longitude);
  const hasAdjusted = distanceFromCenter > 5;

  useEffect(() => {
    return () => {
      if (programmaticTimer.current) clearTimeout(programmaticTimer.current);
    };
  }, []);

  // Camera re-centering when target coordinates change externally
  useEffect(() => {
    const latDiff = Math.abs(latitude - lastReportedCoords.current.lat);
    const lngDiff = Math.abs(longitude - lastReportedCoords.current.lng);
    if (latDiff > 0.00005 || lngDiff > 0.00005) {
      lastReportedCoords.current = { lat: latitude, lng: longitude };
      isProgrammaticMove.current = true;
      isUserInteracting.current = false;
      if (programmaticTimer.current) clearTimeout(programmaticTimer.current);
      programmaticTimer.current = setTimeout(() => {
        isProgrammaticMove.current = false;
      }, 500);
      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: 0.003,
          longitudeDelta: 0.003,
        },
        300,
      );
    }
  }, [latitude, longitude]);

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

  const handleRegionChange = useCallback(
    (_region?: Region, details?: { isGesture?: boolean }) => {
      if (details?.isGesture === true) {
        isUserInteracting.current = true;
        isProgrammaticMove.current = false;
        if (programmaticTimer.current) clearTimeout(programmaticTimer.current);
      }
      if (isProgrammaticMove.current && !isUserInteracting.current) {
        return;
      }
      if (!isMoving) liftPin();
    },
    [isMoving, liftPin],
  );

  const handleRegionChangeComplete = useCallback(
    (region: Region, details?: { isGesture?: boolean }) => {
      dropPin();

      const isProgrammatic = isProgrammaticMove.current;
      const isGesture = details?.isGesture ?? isUserInteracting.current;

      isProgrammaticMove.current = false;
      isUserInteracting.current = false;
      if (programmaticTimer.current) clearTimeout(programmaticTimer.current);

      const shouldPropagate = shouldPropagateRegionChange({
        disabled,
        isProgrammatic,
        isUserGesture: isGesture,
      });

      if (!shouldPropagate) return;

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
        isProgrammaticMove.current = true;
        if (programmaticTimer.current) clearTimeout(programmaticTimer.current);
        programmaticTimer.current = setTimeout(() => {
          isProgrammaticMove.current = false;
        }, 450);
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
        lastReportedCoords.current = { lat: finalLat, lng: finalLng };
        onCoordinatesChange({ latitude: finalLat, longitude: finalLng });
      }
    },
    [centerLat, centerLng, disabled, dropPin, onCoordinatesChange],
  );

  const handleResetPress = useCallback(() => {
    if (disabled || initialLatitude === undefined || initialLongitude === undefined) return;
    isProgrammaticMove.current = true;
    isUserInteracting.current = false;
    if (programmaticTimer.current) clearTimeout(programmaticTimer.current);
    programmaticTimer.current = setTimeout(() => {
      isProgrammaticMove.current = false;
    }, 500);
    mapRef.current?.animateToRegion(
      {
        latitude: initialLatitude,
        longitude: initialLongitude,
        latitudeDelta: 0.003,
        longitudeDelta: 0.003,
      },
      250,
    );
    lastReportedCoords.current = { lat: initialLatitude, lng: initialLongitude };
    onCoordinatesChange({ latitude: initialLatitude, longitude: initialLongitude });
    onReset?.();
  }, [disabled, initialLatitude, initialLongitude, onCoordinatesChange, onReset]);

  return (
    <View style={[styles.container, style]}>
      {showsInstruction ? (
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
      ) : null}

      <View
        accessibilityLabel="Interactive map for exact chauffeur arrival location"
        onTouchStart={() => {
          if (!disabled) {
            isUserInteracting.current = true;
            isProgrammaticMove.current = false;
            if (programmaticTimer.current) clearTimeout(programmaticTimer.current);
          }
        }}
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
          mapPadding={mapPadding}
          onPanDrag={() => {
            if (!disabled) {
              isUserInteracting.current = true;
              isProgrammaticMove.current = false;
              if (programmaticTimer.current) clearTimeout(programmaticTimer.current);
            }
          }}
          onRegionChange={handleRegionChange}
          onRegionChangeComplete={handleRegionChangeComplete}
          onRegionChangeStart={(_region, details) => {
            if (!disabled) {
              if (details?.isGesture === true) {
                isUserInteracting.current = true;
                isProgrammaticMove.current = false;
                if (programmaticTimer.current) clearTimeout(programmaticTimer.current);
              }
            }
          }}
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

        {showsPin ? (
          <View
            pointerEvents="none"
            style={
              pinCenterY !== undefined
                ? [styles.pinPositionedAnchor, { top: pinCenterY }]
                : styles.pinAnchor
            }
          >
            <View style={styles.pinDot} />
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
              <Ionicons color={colors.goldStrong} name="location" size={34} />
            </Animated.View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
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
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.graphite,
    overflow: 'hidden',
  },
  mapScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(4, 4, 4, 0.06)',
  },
  pinAnchor: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinPositionedAnchor: {
    alignItems: 'center',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  pinDot: {
    backgroundColor: 'rgba(212, 175, 55, 0.4)',
    borderRadius: 3,
    height: 6,
    position: 'absolute',
    top: 0,
    width: 6,
  },
  pinHead: {
    // Aligns the tip of the 34px icon with the anchor point
    marginTop: -32,
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
