import { Ionicons } from '@expo/vector-icons';
import { fontSizes, radii, spacing, typography, type ThemeColors } from '@mmg/brand';
import { VehicleSummary } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '../../../components/pressable-scale';
import { useTheme, useThemeStyles } from '../../../core/theme';

import {
  resolveVehicleFallbackImageSource,
  resolveVehicleImageSource,
} from '../data/vehicle-images';

type FeaturedVehicleCardProps = {
  onPress(): void;
  vehicle: VehicleSummary;
  width: number;
};

export function FeaturedVehicleCard({ onPress, vehicle, width }: FeaturedVehicleCardProps) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
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
      <View style={[styles.card, { width }]}>
        <View style={styles.imageFrame}>
          {useFallbackImage && !vehicle.imageKey ? (
            <View style={[StyleSheet.absoluteFill, styles.imageUnavailable]}>
              <Ionicons color={colors.textMuted} name="image-outline" size={30} />
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
            <Text style={styles.perDay}>per day</Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const createStyles = ({ colors }: { colors: ThemeColors }) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
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
      backgroundColor: colors.surfaceRaised,
      height: 214,
    },
    imageUnavailable: {
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
      justifyContent: 'center',
    },
    meta: {
      color: '#E5E2DC',
      fontFamily: typography.body,
      fontSize: fontSizes.sm,
      marginTop: 4,
    },
    name: {
      color: '#F7F1E7',
      fontFamily: typography.display,
      fontSize: fontSizes.xl,
      letterSpacing: -0.4,
    },
    perDay: {
      color: colors.textMuted,
      fontFamily: typography.body,
      fontSize: fontSizes.xs,
      marginTop: 3,
    },
    price: {
      color: colors.textPrimary,
      fontFamily: typography.bodySemiBold,
      fontSize: fontSizes.md,
    },
  });
