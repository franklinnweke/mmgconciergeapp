import { colors, fontSizes, radii, spacing, typography } from '@mmg/brand';
import { VehicleSummary } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';

import { resolveVehicleImageSource } from '../data/vehicle-images';

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
          <Image contentFit="cover" source={resolveVehicleImageSource(vehicle)} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['transparent', 'rgba(4,4,4,0.88)']}
            locations={[0.42, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.imageCopy}>
            <Text numberOfLines={2} style={styles.name}>
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
  price: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.md,
  },
});
