import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { VehicleSummary } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image, type ImageSource } from 'expo-image';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { createDiscoveryGateway } from '@/features/discovery/data/firestore-discovery-gateway';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';

import { useBookings } from '../booking-context';
import { groupTripsForDisplay, tripStateCopy, type RenterTrip } from '../domain/renter-trip';

const sectionTitles = {
  active: 'Active',
  upcoming: 'Upcoming',
  intervention: 'Needs attention',
  past: 'Past',
} as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lagos',
  }).format(new Date(`${value}T12:00:00+01:00`));
}

function snapshotHasCanonicalImage(trip: RenterTrip): boolean {
  // Trips deliberately does not trust fixture image keys. A persisted public URL
  // is an immutable booking snapshot; otherwise we resolve the current safe
  // renter-visible vehicle or render a neutral placeholder.
  return Boolean(trip.vehicleSnapshot.imageUrl);
}

function isGenericSnapshotName(value: string): boolean {
  return value === 'Booked vehicle' || value === 'Requested vehicle';
}

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { initializing, syncError, trips } = useBookings();
  const groups = groupTripsForDisplay(trips);
  const discoveryGateway = useMemo(() => createDiscoveryGateway(), []);
  const [resolvedVehicles, setResolvedVehicles] = useState<Record<string, VehicleSummary | null>>({});

  const unresolvedVehicleIds = useMemo(
    () => [...new Set(
      trips
        .filter((trip) => !snapshotHasCanonicalImage(trip))
        .map((trip) => trip.vehicleId),
    )].sort(),
    [trips],
  );

  useEffect(() => {
    if (!unresolvedVehicleIds.length) return;
    let active = true;

    void Promise.all(
      unresolvedVehicleIds.map(async (vehicleId) => {
        try {
          return [vehicleId, await discoveryGateway.getVehicleById(vehicleId)] as const;
        } catch {
          return [vehicleId, null] as const;
        }
      }),
    ).then((entries) => {
      if (!active) return;
      setResolvedVehicles((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });

    return () => {
      active = false;
    };
  }, [discoveryGateway, unresolvedVehicleIds]);

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
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 108 }]}
          showsVerticalScrollIndicator={false}
        >
          {groups.length ? (
            groups.map((section) => (
              <View key={section.group} style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionLabel}>{sectionTitles[section.group]}</Text>
                </View>
                <View style={styles.tripList}>
                  {section.trips.map((item) => (
                    <TripRow
                      fallbackVehicle={resolvedVehicles[item.vehicleId] ?? null}
                      key={item.id}
                      trip={item}
                    />
                  ))}
                </View>
              </View>
            ))
          ) : (
            <EmptyTrips onExplore={() => router.push('/(renter)/browse')} />
          )}
        </ScrollView>
      )}
    </View>
  );
}

function TripRow({
  fallbackVehicle,
  trip,
}: {
  fallbackVehicle: VehicleSummary | null;
  trip: RenterTrip;
}) {
  const router = useRouter();
  const vehicle = trip.vehicleSnapshot;
  const copy = tripStateCopy(trip.state);
  const attention = trip.group === 'intervention';
  const positive = trip.state === 'confirmed' || trip.state === 'in_progress' || trip.state === 'completed';

  let imageSource: ImageSource | null = null;
  if (vehicle.imageUrl) {
    imageSource = resolveVehicleImageSource({ imageUrl: vehicle.imageUrl });
  } else if (fallbackVehicle) {
    imageSource = resolveVehicleImageSource(fallbackVehicle);
  }

  const displayName = isGenericSnapshotName(vehicle.displayName) && fallbackVehicle
    ? fallbackVehicle.displayName
    : vehicle.displayName;
  const areaLabel = vehicle.areaLabel === 'Lagos' && fallbackVehicle
    ? fallbackVehicle.areaLabel
    : vehicle.areaLabel;

  return (
    <PressableScale
      accessibilityHint="Opens trip details"
      accessibilityLabel={`View ${displayName}: ${copy.label}`}
      accessibilityRole="button"
      onPress={() => router.push(`/trip/${trip.id}` as Href)}
    >
      <View style={styles.tripRow}>
        {imageSource ? (
          <Image
            accessibilityLabel={displayName}
            contentFit="cover"
            source={imageSource}
            style={styles.vehicleImage}
          />
        ) : (
          <View accessibilityLabel={`${displayName} image unavailable`} style={styles.vehiclePlaceholder}>
            <Ionicons color={colors.muted} name="car-sport-outline" size={26} />
          </View>
        )}

        <View style={styles.tripBody}>
          <Text numberOfLines={1} style={styles.vehicleName}>{displayName}</Text>

          <Text
            style={[
              styles.stateText,
              attention && styles.stateTextAttention,
              positive && styles.stateTextPositive,
            ]}
          >
            {copy.label}
          </Text>

          <Text style={styles.dateText}>
            {formatDate(trip.startDate)} → {formatDate(trip.endDate)}
          </Text>

          <View style={styles.metaRow}>
            <Text numberOfLines={1} style={styles.area}>{areaLabel}</Text>
            <Text style={styles.total}>{formatNairaFromKobo(trip.priceSnapshot.renterTotalKobo)}</Text>
          </View>
          {trip.source === 'legacy' ? <Text style={styles.legacyLabel}>Earlier estimate</Text> : null}
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
  area: { color: colors.muted, flex: 1, fontFamily: typography.body, fontSize: 12 },
  dateText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 12 },
  empty: { alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.xxl },
  emptyAction: { alignItems: 'center', backgroundColor: colors.ivory, borderRadius: radii.pill, justifyContent: 'center', marginTop: spacing.md, minHeight: 48, paddingHorizontal: spacing.lg },
  emptyActionText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  emptyBody: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, maxWidth: 300 },
  emptyTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 20 },
  header: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg },
  legacyLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 10 },
  loading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  loadingText: { color: colors.muted, fontFamily: typography.body, fontSize: 13 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  screen: { backgroundColor: colors.black, flex: 1 },
  scrollContent: { gap: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  section: { gap: spacing.sm },
  sectionHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15 },
  stateText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 11 },
  stateTextAttention: { color: colors.danger },
  stateTextPositive: { color: colors.success },
  syncNotice: { alignItems: 'center', backgroundColor: 'rgba(227,195,101,.08)', flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.lg, padding: spacing.md },
  syncNoticeText: { color: colors.ivory, flex: 1, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  total: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 12 },
  tripBody: { flex: 1, gap: 6, justifyContent: 'center', minWidth: 0 },
  tripList: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  tripRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 118, paddingVertical: spacing.md },
  vehicleImage: { borderRadius: radii.sm, height: 84, width: 112 },
  vehicleName: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15 },
  vehiclePlaceholder: { alignItems: 'center', backgroundColor: colors.graphite, borderColor: colors.line, borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth, height: 84, justifyContent: 'center', width: 112 },
});
