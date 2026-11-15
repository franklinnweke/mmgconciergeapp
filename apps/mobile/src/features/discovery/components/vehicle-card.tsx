import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, typography, type ThemeColors } from '@mmg/brand';
import { VehicleSummary } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '../../../components/pressable-scale';
import { useTheme, useThemeStyles } from '../../../core/theme';

import { resolveVehicleImageSource } from '../data/vehicle-images';

type VehicleCardProps = {
  vehicle: VehicleSummary;
};

export function VehicleCard({ vehicle }: VehicleCardProps) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);

  return (
    <PressableScale accessibilityLabel={`View ${vehicle.displayName}`} accessibilityRole="button">
      <View style={styles.card}>
        <View style={styles.imageFrame}>
          <Image
            contentFit="cover"
            source={resolveVehicleImageSource(vehicle)}
            style={StyleSheet.absoluteFill}
            transition={280}
          />
          <View style={styles.distancePill}>
            <Ionicons color="#F7F1E7" name="navigate" size={11} />
            <Text style={styles.distanceText}>{vehicle.distanceKm.toFixed(1)} km</Text>
          </View>
        </View>

        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text numberOfLines={2} style={styles.title}>
              {vehicle.displayName}
            </Text>
            <Text style={styles.meta}>
              {vehicle.areaLabel} · {vehicle.seats} seats
            </Text>
          </View>
          <View style={styles.arrow}>
            <Ionicons color={colors.textPrimary} name="arrow-up-outline" size={16} style={styles.arrowIcon} />
          </View>
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatNairaFromKobo(vehicle.dailyRateKobo)}</Text>
          <Text style={styles.perDay}> / day</Text>
          <View style={styles.includedSpacer} />
          <Text style={styles.included}>Chauffeur included</Text>
        </View>
      </View>
    </PressableScale>
  );
}

const createStyles = ({ colors }: { colors: ThemeColors }) =>
  StyleSheet.create({
    arrow: {
      alignItems: 'center',
      borderColor: colors.borderStrong,
      borderRadius: radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
      height: 34,
      justifyContent: 'center',
      width: 34,
    },
    arrowIcon: {
      transform: [{ rotate: '45deg' }],
    },
    card: {
      width: 310,
    },
    distancePill: {
      alignItems: 'center',
      backgroundColor: 'rgba(4, 4, 4, 0.76)',
      borderColor: 'rgba(247, 241, 231, 0.12)',
      borderRadius: radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 5,
      left: spacing.sm,
      paddingHorizontal: 10,
      paddingVertical: 7,
      position: 'absolute',
      top: spacing.sm,
    },
    distanceText: {
      color: '#F7F1E7',
      fontFamily: typography.bodyMedium,
      fontSize: 11,
    },
    imageFrame: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radii.lg,
      height: 205,
      overflow: 'hidden',
    },
    included: {
      color: colors.primary,
      fontFamily: typography.bodyMedium,
      fontSize: 11,
    },
    includedSpacer: {
      flex: 1,
    },
    meta: {
      color: colors.textMuted,
      fontFamily: typography.body,
      fontSize: 11,
      marginTop: 4,
    },
    perDay: {
      color: colors.textMuted,
      fontFamily: typography.body,
      fontSize: 11,
    },
    price: {
      color: colors.textSecondary,
      fontFamily: typography.bodySemiBold,
      fontSize: 13,
    },
    priceRow: {
      alignItems: 'baseline',
      flexDirection: 'row',
      marginTop: spacing.sm,
    },
    title: {
      color: colors.textPrimary,
      fontFamily: typography.bodySemiBold,
      fontSize: 16,
    },
    titleBlock: {
      flex: 1,
    },
    titleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
  });
