import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radii, spacing, typography } from '@mmg/brand';
import { VehicleSummary } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';

import { vehicleImages } from '../data/vehicle-images';

type FeaturedVehicleCardProps = {
  onPress(): void;
  vehicle: VehicleSummary;
  width: number;
};

export function FeaturedVehicleCard({ onPress, vehicle, width }: FeaturedVehicleCardProps) {
  return (
    <PressableScale
      accessibilityHint="Opens vehicle details"
      accessibilityLabel={`View ${vehicle.displayName}`}
      accessibilityRole="button"
      onPress={onPress}
    >
      <View style={[styles.card, { width }]}>
        <View style={styles.imageFrame}>
          <Image contentFit="cover" source={vehicleImages[vehicle.imageKey]} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['transparent', 'rgba(4,4,4,0.88)']}
            locations={[0.42, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.topRow}>
            <View style={styles.pill}>
              <Ionicons color={colors.ivory} name="navigate" size={12} />
              <Text style={styles.pillText}>{vehicle.distanceKm.toFixed(1)} km</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                {vehicle.category === 'executive_suv' ? 'Executive SUV' : 'Executive sedan'}
              </Text>
            </View>
          </View>
          <View style={styles.imageCopy}>
            <Text numberOfLines={1} style={styles.name}>
              {vehicle.displayName}
            </Text>
            <Text style={styles.meta}>
              {vehicle.areaLabel} · {vehicle.seats} seats
            </Text>
          </View>
        </View>
        <View style={styles.footer}>
          <View>
            <Text style={styles.price}>{formatNairaFromKobo(vehicle.dailyRateKobo)}</Text>
            <Text style={styles.perDay}>per day · chauffeur included</Text>
          </View>
          <View style={styles.bookChip}>
            <Text style={styles.bookText}>View</Text>
            <Ionicons color={colors.black} name="arrow-forward" size={15} />
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  bookChip: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  bookText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  card: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  imageCopy: {
    bottom: spacing.md,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  imageFrame: {
    height: 214,
  },
  meta: {
    color: colors.silver,
    fontFamily: typography.body,
    fontSize: fontSizes.sm,
    marginTop: 4,
  },
  name: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.xl,
    letterSpacing: -0.4,
  },
  perDay: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
    marginTop: 3,
  },
  pill: {
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
  pillText: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
  },
  price: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.md,
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
