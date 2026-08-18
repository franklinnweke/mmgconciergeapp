import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radii, spacing, typography } from '@mmg/brand';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { tripStateCopy, type RenterTrip } from '@/features/booking/domain/renter-trip';

import { resolveVehicleImageSource } from '../data/vehicle-images';

type LiveJourneyCardProps = {
  onPress(): void;
  trip: RenterTrip;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lagos',
    weekday: 'short',
  }).format(new Date(`${value}T12:00:00+01:00`));
}

export function LiveJourneyCard({ onPress, trip }: LiveJourneyCardProps) {
  const copy = tripStateCopy(trip.state);
  const vehicle = trip.vehicleSnapshot;
  const image = resolveVehicleImageSource(vehicle);
  const attention = trip.group === 'intervention';

  return (
    <PressableScale
      accessibilityHint="Opens this journey"
      accessibilityLabel={`${copy.label}. ${vehicle.displayName}`}
      accessibilityRole="button"
      onPress={onPress}
    >
      <View style={[styles.card, attention && styles.cardAttention]}>
        <Image accessibilityLabel={vehicle.displayName} contentFit="cover" source={image} style={styles.image} />
        <View style={styles.copy}>
          <View style={[styles.pill, attention && styles.pillAttention]}>
            <View style={[styles.dot, attention && styles.dotAttention]} />
            <Text style={styles.pillText}>{copy.label}</Text>
          </View>
          <Text numberOfLines={1} style={styles.name}>
            {vehicle.displayName}
          </Text>
          <Text style={styles.dates}>
            {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
          </Text>
        </View>
        <Ionicons color={colors.goldStrong} name="chevron-forward" size={18} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 88,
    padding: spacing.sm,
  },
  cardAttention: {
    borderColor: 'rgba(209,133,120,0.45)',
  },
  copy: { flex: 1 },
  dates: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  dot: {
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    height: 6,
    width: 6,
  },
  dotAttention: { backgroundColor: colors.danger },
  image: {
    borderRadius: radii.sm,
    height: 64,
    width: 64,
  },
  name: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
    marginTop: 4,
  },
  pill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
  },
  pillAttention: {},
  pillText: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.6,
  },
});
