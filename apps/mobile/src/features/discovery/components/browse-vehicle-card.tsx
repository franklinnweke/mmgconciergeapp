import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radii, spacing, typography } from '@mmg/brand';
import { VehicleSummary } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';

import { resolveVehicleImageSource } from '../data/vehicle-images';
import { vehicleEditorialClass } from '../data/lagos-destinations';

type BrowseVehicleCardProps = {
  onPress(): void;
  vehicle: VehicleSummary;
};

export function BrowseVehicleCard({ onPress, vehicle }: BrowseVehicleCardProps) {
  return (
    <PressableScale
      accessibilityHint="Opens vehicle details"
      accessibilityLabel={`View ${vehicle.displayName}`}
      accessibilityRole="button"
      onPress={onPress}
    >
      <View style={styles.card}>
        <View style={styles.imageFrame}>
          <Image
            contentFit="cover"
            source={resolveVehicleImageSource(vehicle)}
            style={StyleSheet.absoluteFill}
            transition={220}
          />
          <LinearGradient
            colors={['transparent', 'rgba(4,4,4,0.88)']}
            locations={[0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.topRow}>
            <View style={styles.availabilityPill}>
              <Text style={styles.availabilityText}>IN FLEET</Text>
            </View>
            <View style={styles.distancePill}>
              <Ionicons color={colors.ivory} name="navigate" size={11} />
              <Text style={styles.distanceText}>{vehicle.distanceKm.toFixed(1)} km</Text>
            </View>
          </View>
          <View style={styles.imageCopy}>
            <Text style={styles.category}>
              {vehicleEditorialClass(vehicle.displayName, vehicle.category).toLocaleUpperCase()}
            </Text>
            <Text numberOfLines={1} style={styles.title}>
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

        <View style={styles.inclusionRow}>
          <View style={styles.inclusion}>
            <Ionicons color={colors.gold} name="checkmark-circle-outline" size={14} />
            <Text style={styles.inclusionText}>Chauffeur</Text>
          </View>
          <View style={styles.inclusion}>
            <Ionicons color={colors.gold} name="checkmark-circle-outline" size={14} />
            <Text style={styles.inclusionText}>Lagos delivery</Text>
          </View>
          <View style={styles.openButton}>
            <Ionicons color={colors.black} name="arrow-forward" size={16} />
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  availabilityDot: {
    backgroundColor: colors.success,
    borderRadius: radii.pill,
    height: 5,
    width: 5,
  },
  availabilityPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,4,4,0.72)',
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  availabilityText: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.7,
  },
  card: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  category: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 1,
    marginBottom: 5,
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  distancePill: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,4,4,0.72)',
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  distanceText: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
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
  inclusion: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  inclusionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    paddingTop: spacing.sm,
  },
  inclusionText: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
  },
  location: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  locationBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  metaDot: {
    backgroundColor: colors.lineStrong,
    borderRadius: radii.pill,
    height: 3,
    marginHorizontal: 2,
    width: 3,
  },
  openButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    height: 34,
    justifyContent: 'center',
    marginLeft: 'auto',
    width: 34,
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
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.xl,
    letterSpacing: -0.4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: spacing.sm,
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
  },
});
