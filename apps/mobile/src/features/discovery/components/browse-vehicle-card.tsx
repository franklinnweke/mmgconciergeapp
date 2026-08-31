import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radii, spacing, typography } from '@mmg/brand';
import { VehicleSummary } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';

import {
  resolveVehicleFallbackImageSource,
  resolveVehicleImageSource,
} from '../data/vehicle-images';

type BrowseVehicleCardProps = {
  onPress(): void;
  vehicle: VehicleSummary;
};

export function BrowseVehicleCard({ onPress, vehicle }: BrowseVehicleCardProps) {
  const imageIdentity = [
    vehicle.id,
    vehicle.imageUrl,
    vehicle.primaryImageUrl,
    vehicle.imageUrls?.[0],
    vehicle.imageKey,
  ].join('|');
  const [failedImageIdentity, setFailedImageIdentity] = useState<string | null>(null);
  const useFallbackImage = failedImageIdentity === imageIdentity;

  return (
    <PressableScale
      accessibilityHint="Opens vehicle details"
      accessibilityLabel={`View ${vehicle.displayName}`}
      accessibilityRole="button"
      onPress={onPress}
    >
      <View style={styles.card}>
        <View style={styles.imageFrame}>
          {useFallbackImage && !vehicle.imageKey ? (
            <View style={[StyleSheet.absoluteFill, styles.imageUnavailable]}>
              <Ionicons color={colors.muted} name="image-outline" size={30} />
            </View>
          ) : (
            <Image
              contentFit="cover"
              onError={() => setFailedImageIdentity(imageIdentity)}
              source={
                useFallbackImage
                  ? resolveVehicleFallbackImageSource(vehicle)
                  : resolveVehicleImageSource(vehicle)
              }
              style={StyleSheet.absoluteFill}
              transition={180}
            />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(4,4,4,0.88)']}
            locations={[0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.imageCopy}>
            <Text numberOfLines={2} style={styles.title}>
              {vehicle.displayName}
            </Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <View style={styles.locationBlock}>
            <Ionicons color={colors.goldStrong} name="location-outline" size={15} />
            <Text style={styles.location}>{vehicle.areaLabel}</Text>
            <View style={styles.metaDot} />
            <Text style={styles.seats}>{vehicle.seats} seats</Text>
          </View>
          <View style={styles.priceBlock}>
            <Text style={styles.price}>{formatNairaFromKobo(vehicle.dailyRateKobo)}</Text>
            <Text style={styles.perDay}> / day</Text>
          </View>
        </View>

        <View style={styles.serviceRow}>
          <Text style={styles.serviceText}>Chauffeur · Lagos delivery included</Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  imageCopy: {
    bottom: spacing.md,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  imageFrame: {
    backgroundColor: colors.graphiteRaised,
    height: 220,
  },
  imageUnavailable: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    justifyContent: 'center',
  },
  location: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  locationBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 5,
  },
  metaDot: {
    backgroundColor: colors.lineStrong,
    borderRadius: radii.pill,
    height: 3,
    marginHorizontal: 2,
    width: 3,
  },
  perDay: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
  },
  price: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
  },
  priceBlock: {
    alignItems: 'baseline',
    flexDirection: 'row',
  },
  seats: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.sm,
  },
  serviceRow: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  serviceText: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.xl,
    letterSpacing: -0.4,
  },
});
