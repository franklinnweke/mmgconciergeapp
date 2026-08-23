import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { InlineNotice, PrimaryAction } from '@/components/ui/mobile-primitives';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';

import { useBookings } from '../booking-context';
import { groupTripsForDisplay, tripStateCopy, type RenterTrip } from '../domain/renter-trip';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lagos',
  }).format(new Date(`${value}T12:00:00+01:00`));
}

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { initializing, syncError, syncState, trips } = useBookings();
  const isPreview = trips.some((trip) => trip.source === 'preview');
  const groups = groupTripsForDisplay(trips);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <BrandWordmark compact withLogo />

        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>Trips</Text>
          <Text style={styles.subtitle}>Your upcoming and previous MMG journeys.</Text>
        </View>

        {isPreview ? (
          <InlineNotice icon="flask-outline">Preview data. Actions do not affect live bookings.</InlineNotice>
        ) : null}
        {syncState === 'offline' || syncError ? (
          <InlineNotice icon="cloud-offline-outline">
            {syncError ?? 'Showing the most recent saved copy. Live updates are unavailable.'}
          </InlineNotice>
        ) : null}

        {initializing ? (
          <View accessibilityLiveRegion="polite" style={styles.loading}>
            <ActivityIndicator color={colors.goldStrong} size="small" />
            <Text style={styles.loadingText}>Loading trips</Text>
          </View>
        ) : groups.length ? (
          groups.map((section) => (
            <View key={section.group} style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionLabel}>{section.label}</Text>
                <Text style={styles.sectionCount}>{section.trips.length}</Text>
              </View>
              <View style={styles.tripList}>
                {section.trips.map((item) => <TripRow key={item.id} trip={item} />)}
              </View>
            </View>
          ))
        ) : (
          <EmptyTrips onExplore={() => router.push('/(renter)/browse')} />
        )}
      </ScrollView>
    </View>
  );
}

function TripRow({ trip }: { trip: RenterTrip }) {
  const router = useRouter();
  const vehicle = trip.vehicleSnapshot;
  const copy = tripStateCopy(trip.state);
  const attention = trip.group === 'intervention';

  return (
    <PressableScale
      accessibilityHint="Opens trip details and available actions"
      accessibilityLabel={`${vehicle.displayName}, ${copy.label}`}
      accessibilityRole="button"
      onPress={() => router.push(`/trip/${trip.id}` as Href)}
    >
      <View style={styles.tripRow}>
        <View style={styles.imageFrame}>
          <Image
            accessibilityLabel={vehicle.displayName}
            contentFit="cover"
            source={resolveVehicleImageSource(vehicle)}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient colors={['transparent', 'rgba(4,4,4,.9)']} style={StyleSheet.absoluteFill} />
          <View style={styles.imageCopy}>
            <Text numberOfLines={2} style={styles.vehicleName}>{vehicle.displayName}</Text>
            <Text style={styles.area}>{vehicle.areaLabel} · Chauffeur included</Text>
          </View>
        </View>

        <View style={styles.tripBody}>
          <View style={styles.tripTopLine}>
            <Text style={[styles.stateText, attention && styles.stateTextAttention]}>{copy.label}</Text>
            <Ionicons color={colors.muted} name="chevron-forward" size={17} />
          </View>
          <Text style={styles.dates}>{formatDate(trip.startDate)} → {formatDate(trip.endDate)}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.total}>{formatNairaFromKobo(trip.priceSnapshot.renterTotalKobo)}</Text>
            <Text style={styles.priceContext}>
              {trip.source === 'preview' ? 'Preview total' : trip.source === 'legacy' ? 'Earlier estimate' : 'Trip total'}
            </Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

function EmptyTrips({ onExplore }: { onExplore: () => void }) {
  return (
    <View style={styles.empty}>
      <Ionicons color={colors.goldStrong} name="calendar-outline" size={24} />
      <Text style={styles.emptyTitle}>No trips yet</Text>
      <Text style={styles.emptyBody}>Choose a car and dates when you are ready to book.</Text>
      <View style={styles.emptyAction}>
        <PrimaryAction icon="arrow-forward" label="Find a car" onPress={onExplore} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  area: {
    color: colors.silver,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: 4,
  },
  content: {
    paddingHorizontal: spacing.md,
  },
  dates: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  empty: {
    alignItems: 'flex-start',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
    paddingTop: spacing.xl,
  },
  emptyAction: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  emptyBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
    maxWidth: 320,
  },
  emptyTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 28,
    letterSpacing: -0.4,
    marginTop: spacing.md,
  },
  imageCopy: {
    bottom: spacing.md,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  imageFrame: {
    backgroundColor: colors.graphiteRaised,
    height: 196,
  },
  intro: {
    marginBottom: spacing.lg,
    marginTop: spacing.xl,
  },
  loading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  loadingText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  priceContext: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
  },
  priceRow: {
    alignItems: 'baseline',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionCount: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  sectionHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionLabel: {
    color: colors.silver,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
  },
  stateText: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
  },
  stateTextAttention: {
    color: colors.danger,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    marginTop: 5,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 32,
    letterSpacing: -0.6,
  },
  total: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 16,
  },
  tripBody: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.md,
  },
  tripList: {
    gap: spacing.lg,
  },
  tripRow: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.lg,
  },
  tripTopLine: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  vehicleName: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 24,
    letterSpacing: -0.3,
  },
});
