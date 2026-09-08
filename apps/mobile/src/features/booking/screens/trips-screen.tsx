import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { type Href, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';

import { useBookings } from '../booking-context';
import { groupTripsForDisplay, tripStateCopy, type RenterTrip } from '../domain/renter-trip';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    timeZone: 'Africa/Lagos',
  }).format(new Date(`${value}T12:00:00+01:00`));
}

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { initializing, syncError, trips } = useBookings();
  const groups = groupTripsForDisplay(trips);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <ScreenHeader showBrand={false} title="Trips" />
      </View>

      {syncError ? (
        <View accessibilityLiveRegion="polite" style={styles.syncNotice}>
          <Ionicons color={colors.goldStrong} name="cloud-offline-outline" size={17} />
          <Text style={styles.syncNoticeText}>{syncError}</Text>
        </View>
      ) : null}

      {initializing ? (
        <View accessibilityLiveRegion="polite" style={styles.loading}>
          <ActivityIndicator color={colors.goldStrong} size="small" />
          <Text style={styles.loadingText}>Loading trips…</Text>
        </View>
      ) : (
        <View style={styles.flex}>
          <View style={styles.scrollFrame}>
            <View style={styles.scrollContent}>
              {groups.length ? (
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
            </View>
          </View>
        </View>
      )}
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
      accessibilityHint="Opens trip details"
      accessibilityLabel={`View ${vehicle.displayName}: ${copy.label}`}
      accessibilityRole="button"
      onPress={() => router.push(`/trip/${trip.id}` as Href)}
    >
      <View style={styles.tripRow}>
        <Image
          accessibilityLabel={vehicle.displayName}
          contentFit="cover"
          source={resolveVehicleImageSource(vehicle)}
          style={styles.vehicleImage}
        />
        <View style={styles.tripBody}>
          <View style={styles.tripHeading}>
            <View style={styles.flex}>
              <Text numberOfLines={1} style={styles.vehicleName}>{vehicle.displayName}</Text>
              <Text style={styles.area}>{vehicle.areaLabel} · Chauffeur included</Text>
            </View>
            <Ionicons color={colors.muted} name="chevron-forward" size={18} />
          </View>

          <Text style={[styles.stateText, attention && styles.stateTextAttention]}>{copy.label}</Text>

          <View style={styles.dateRow}>
            <View style={styles.dateBlock}>
              <Text style={styles.dateLabel}>Pickup</Text>
              <Text style={styles.dateValue}>{formatDate(trip.startDate)}</Text>
            </View>
            <View style={styles.dateDivider} />
            <View style={styles.dateBlock}>
              <Text style={styles.dateLabel}>Return</Text>
              <Text style={styles.dateValue}>{formatDate(trip.endDate)}</Text>
            </View>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{trip.source === 'legacy' ? 'Earlier estimate' : 'Booking total'}</Text>
            <Text style={styles.total}>{formatNairaFromKobo(trip.priceSnapshot.renterTotalKobo)}</Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

function EmptyTrips({ onExplore }: { onExplore: () => void }) {
  return (
    <View style={styles.empty}>
      <Ionicons color={colors.muted} name="calendar-outline" size={28} />
      <Text style={styles.emptyTitle}>No trips yet</Text>
      <Text style={styles.emptyBody}>Choose a car and dates when you are ready to book.</Text>
      <PressableScale accessibilityRole="button" onPress={onExplore}>
        <View style={styles.emptyAction}>
          <Text style={styles.emptyActionText}>Find a car</Text>
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  area: { color: colors.muted, fontFamily: typography.body, fontSize: 12, marginTop: 3 },
  dateBlock: { flex: 1, gap: 3 },
  dateDivider: { backgroundColor: colors.line, height: 32, width: StyleSheet.hairlineWidth },
  dateLabel: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 11 },
  dateRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  dateValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13 },
  empty: { alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.xxl },
  emptyAction: { alignItems: 'center', backgroundColor: colors.ivory, borderRadius: radii.pill, justifyContent: 'center', marginTop: spacing.md, minHeight: 48, paddingHorizontal: spacing.lg },
  emptyActionText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  emptyBody: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, maxWidth: 300 },
  emptyTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 20 },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  loading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  loadingText: { color: colors.muted, fontFamily: typography.body, fontSize: 13 },
  screen: { backgroundColor: colors.black, flex: 1 },
  scrollContent: { gap: spacing.xl, paddingBottom: 120, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  scrollFrame: { flex: 1 },
  section: { gap: spacing.md },
  sectionCount: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 12 },
  sectionHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15 },
  stateText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 12 },
  stateTextAttention: { color: colors.danger },
  syncNotice: { alignItems: 'center', backgroundColor: 'rgba(227,195,101,.08)', flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.lg, padding: spacing.md },
  syncNoticeText: { color: colors.ivory, flex: 1, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  total: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 16 },
  totalLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 12 },
  totalRow: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.md },
  tripBody: { gap: spacing.md, paddingVertical: spacing.md },
  tripHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  tripList: { gap: spacing.xl },
  tripRow: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  vehicleImage: { borderRadius: radii.md, height: 176, width: '100%' },
  vehicleName: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 17 },
});
