import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { LuxuryEmblemLoader } from '@/components/ui/luxury-emblem-loader';
import { RadarPulseDot } from '@/components/ui/radar-pulse-dot';
import { useReducedMotion } from '@/components/use-reduced-motion';
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

function syncLabel(syncState: 'local-only' | 'syncing' | 'synced' | 'offline', isPreview: boolean) {
  if (isPreview) return 'STATE PREVIEW';
  if (syncState === 'offline') return 'OFFLINE CACHE';
  if (syncState === 'syncing') return 'SYNCING';
  if (syncState === 'synced') return 'LIVE UPDATES';
  return 'LOCAL COPY';
}

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { initializing, syncError, syncState, trips } = useBookings();
  const [entrance] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const isPreview = trips.some((trip) => trip.source === 'preview');
  const groups = groupTripsForDisplay(trips);

  useEffect(() => {
    if (reduceMotion) {
      entrance.setValue(1);
      return;
    }
    Animated.timing(entrance, { duration: 420, toValue: 1, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [entrance, reduceMotion]);

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}
        style={{
          opacity: entrance,
          transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        }}
      >
        <View style={styles.topBar}>
          <BrandWordmark withLogo />
          <View style={styles.statusPill}>
            <RadarPulseDot
              color={syncState === 'offline' || isPreview ? colors.goldStrong : colors.success}
              glowColor={syncState === 'offline' || isPreview ? 'rgba(227,195,101,0.35)' : 'rgba(74,222,128,0.35)'}
              size={6}
            />
            <Text style={styles.statusPillText}>{syncLabel(syncState, isPreview)}</Text>
          </View>
        </View>
        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>Trips</Text>
        </View>
        {isPreview ? (
          <View accessibilityLiveRegion="polite" style={styles.previewNotice}>
            <Ionicons color={colors.goldStrong} name="flask-outline" size={16} />
            <Text style={styles.previewNoticeText}>DEVELOPMENT STATE PREVIEW · NO LIVE ACTIONS</Text>
          </View>
        ) : null}
        {syncError ? (
          <View accessibilityLiveRegion="polite" style={styles.syncNotice}>
            <Ionicons color={colors.goldStrong} name="cloud-offline-outline" size={16} />
            <Text style={styles.syncNoticeText}>{syncError}</Text>
          </View>
        ) : null}
        {initializing ? (
          <View accessibilityLiveRegion="polite" style={styles.loading}>
            <LuxuryEmblemLoader label="RETRIEVING YOUR JOURNEYS" size={44} />
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
      </Animated.ScrollView>
    </View>
  );
}

function TripRow({ trip }: { trip: RenterTrip }) {
  const router = useRouter();
  const vehicle = trip.vehicleSnapshot;
  const vehicleImage = resolveVehicleImageSource(vehicle);
  const copy = tripStateCopy(trip.state);
  const attention = trip.group === 'intervention';
  return (
    <PressableScale
      accessibilityHint="Opens the journey timeline and current actions"
      accessibilityLabel={`View ${vehicle.displayName}: ${copy.label}`}
      accessibilityRole="button"
      onPress={() => router.push(`/trip/${trip.id}` as Href)}
    >
      <View style={styles.tripRow}>
        <View style={styles.imageFrame}>
          <Image accessibilityLabel={vehicle.displayName} contentFit="cover" source={vehicleImage} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['transparent', 'rgba(4,4,4,.86)']} style={StyleSheet.absoluteFill} />
          <View style={styles.imageCopy}>
            <Text style={styles.vehicleName}>{vehicle.displayName}</Text>
            <Text style={styles.area}>{vehicle.areaLabel} · Chauffeur included</Text>
          </View>
        </View>
          <View style={styles.tripBody}>
          <Text style={[styles.stateText, attention && styles.stateTextAttention]}>{copy.label}</Text>
          <View style={styles.dateRow}>
            <View>
              <Text style={styles.dateLabel}>PICKUP</Text>
              <Text style={styles.dateValue}>{formatDate(trip.startDate)}</Text>
            </View>
            <View style={styles.dateLine} />
            <Ionicons color={colors.gold} name="arrow-forward" size={14} />
            <View style={styles.dateLine} />
            <View>
              <Text style={styles.dateLabel}>RETURN</Text>
              <Text style={styles.dateValue}>{formatDate(trip.endDate)}</Text>
            </View>
          </View>
          <View style={styles.footer}>
            <View>
              <Text style={styles.total}>{formatNairaFromKobo(trip.priceSnapshot.renterTotalKobo)}</Text>
              <Text style={styles.totalNote}>
                {trip.source === 'legacy' ? 'EARLIER ESTIMATE' : trip.source === 'preview' ? 'PREVIEW SNAPSHOT' : 'VERIFIED SNAPSHOT'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

function EmptyTrips({ onExplore }: { onExplore: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No journeys yet.</Text>
      <Text style={styles.emptyBody}>
        Find a car and choose dates to start a journey.
      </Text>
      <PressableScale accessibilityRole="button" onPress={onExplore}>
        <View style={styles.emptyAction}>
          <Text style={styles.emptyActionText}>FIND A CAR</Text>
          <Ionicons color={colors.black} name="arrow-forward" size={17} />
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  area: { color: colors.muted, fontFamily: typography.body, fontSize: 11, marginTop: 4 },
  stateText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 11, marginBottom: spacing.xs },
  stateTextAttention: { color: colors.danger },
  content: { paddingBottom: 120, paddingHorizontal: spacing.lg },
  dateLabel: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.2 },
  dateLine: { backgroundColor: colors.lineStrong, flex: 1, height: StyleSheet.hairlineWidth },
  dateRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  dateValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 11, marginTop: 4 },
  empty: { marginTop: spacing.lg },
  emptyAction: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, minHeight: 50, paddingHorizontal: spacing.lg },
  emptyActionText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.3 },
  emptyBody: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, marginTop: spacing.sm },
  emptyTitle: { color: colors.ivory, fontFamily: typography.display, fontSize: 31, marginTop: spacing.lg },
  footer: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.lg, paddingTop: spacing.md },
  imageCopy: { bottom: spacing.md, left: spacing.md, position: 'absolute', right: spacing.md },
  imageFrame: { height: 192, position: 'relative' },
  intro: { marginBottom: spacing.lg, marginTop: spacing.xl },
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.section },
  loadingText: { color: colors.muted, fontFamily: typography.body, fontSize: 11 },
  previewNotice: { alignItems: 'center', borderBottomColor: colors.line, borderTopColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl, paddingVertical: spacing.md },
  previewNoticeText: { color: colors.goldStrong, flex: 1, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.2 },
  screen: { backgroundColor: colors.black, flex: 1 },
  section: { marginBottom: spacing.xl },
  sectionCount: { color: colors.muted, fontFamily: typography.bodySemiBold, fontSize: 11 },
  sectionHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  sectionLabel: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.7 },
  statusDot: { backgroundColor: colors.success, borderRadius: radii.pill, height: 6, width: 6 },
  statusDotOffline: { backgroundColor: colors.goldStrong },
  statusPill: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 7, paddingHorizontal: 11, paddingVertical: 8 },
  statusPillText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.3 },
  syncNotice: { alignItems: 'center', backgroundColor: 'rgba(227,195,101,.08)', borderColor: 'rgba(227,195,101,.28)', borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, padding: spacing.md },
  syncNoticeText: { color: colors.ivory, flex: 1, fontFamily: typography.body, fontSize: 11, lineHeight: 17 },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 45, letterSpacing: -1, marginTop: 5 },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  total: { color: colors.goldStrong, fontFamily: typography.display, fontSize: 20 },
  totalNote: { color: colors.muted, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.1, marginTop: 3 },
  tripBody: { padding: spacing.md },
  tripList: { gap: spacing.lg },
  tripRow: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  vehicleName: { color: colors.ivory, fontFamily: typography.display, fontSize: 24 },
});
