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
import { resolveVehicleImageSource, vehicleImages } from '@/features/discovery/data/vehicle-images';

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
  return 'TRIP DESK';
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
          <Text style={styles.eyebrow}>YOUR JOURNEYS</Text>
          <Text accessibilityRole="header" style={styles.title}>Trips</Text>
          <Text style={styles.subtitle}>
            Payment, confirmation, concierge intervention, and arrival details in one truthful timeline.
          </Text>
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
          <View style={[styles.statePill, attention && styles.statePillAttention]}>
            <Ionicons color={attention ? colors.danger : colors.goldStrong} name={attention ? 'alert-circle-outline' : 'time-outline'} size={13} />
            <Text style={styles.statePillText}>{copy.label}</Text>
          </View>
          <View style={styles.imageCopy}>
            <Text style={styles.vehicleName}>{vehicle.displayName}</Text>
            <Text style={styles.area}>{vehicle.areaLabel} · Executive Chauffeur included</Text>
          </View>
        </View>
        <View style={styles.tripBody}>
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
            <View style={styles.viewAction}>
              <Text style={styles.viewText}>VIEW RENTAL</Text>
              <Ionicons color={colors.black} name="arrow-forward" size={15} />
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
      <View style={styles.emptyVisual}>
        <Image accessibilityLabel="MMG luxury Toyota Prado" contentFit="cover" source={vehicleImages['hero-suv']} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(4,4,4,.9)']} style={StyleSheet.absoluteFill} />
        <Text style={styles.emptyVisualText}>YOUR NEXT ARRIVAL</Text>
      </View>
      <Text style={styles.emptyTitle}>No active rentals yet.</Text>
      <Text style={styles.emptyBody}>
        Choose an executive vehicle from our Prado collection and reserve your ride with confidence.
      </Text>
      <PressableScale accessibilityRole="button" onPress={onExplore}>
        <View style={styles.emptyAction}>
          <Text style={styles.emptyActionText}>EXPLORE AVAILABLE FLEET</Text>
          <Ionicons color={colors.black} name="arrow-forward" size={17} />
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  area: { color: colors.muted, fontFamily: typography.body, fontSize: 9, marginTop: 4 },
  content: { paddingBottom: 120, paddingHorizontal: spacing.lg },
  dateLabel: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 7, letterSpacing: 1.2 },
  dateLine: { backgroundColor: colors.lineStrong, flex: 1, height: StyleSheet.hairlineWidth },
  dateRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  dateValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 10, marginTop: 4 },
  empty: { marginTop: spacing.lg },
  emptyAction: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, minHeight: 50, paddingHorizontal: spacing.lg },
  emptyActionText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 9, letterSpacing: 1.3 },
  emptyBody: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, marginTop: spacing.sm },
  emptyTitle: { color: colors.ivory, fontFamily: typography.display, fontSize: 31, marginTop: spacing.lg },
  emptyVisual: { borderRadius: radii.lg, height: 224, justifyContent: 'flex-end', overflow: 'hidden', padding: spacing.lg },
  emptyVisualText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 8, letterSpacing: 1.8 },
  eyebrow: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 8, letterSpacing: 1.8 },
  footer: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.lg, paddingTop: spacing.md },
  imageCopy: { bottom: spacing.md, left: spacing.md, position: 'absolute', right: spacing.md },
  imageFrame: { height: 192, position: 'relative' },
  intro: { marginBottom: spacing.lg, marginTop: spacing.xl },
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.section },
  loadingText: { color: colors.muted, fontFamily: typography.body, fontSize: 11 },
  previewNotice: { alignItems: 'center', borderBottomColor: colors.line, borderTopColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl, paddingVertical: spacing.md },
  previewNoticeText: { color: colors.goldStrong, flex: 1, fontFamily: typography.bodySemiBold, fontSize: 7, letterSpacing: 1.2 },
  screen: { backgroundColor: colors.black, flex: 1 },
  section: { marginBottom: spacing.xl },
  sectionCount: { color: colors.muted, fontFamily: typography.bodySemiBold, fontSize: 9 },
  sectionHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  sectionLabel: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 8, letterSpacing: 1.7 },
  statePill: { alignItems: 'center', backgroundColor: 'rgba(4,4,4,.82)', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 7, left: spacing.md, paddingHorizontal: 10, paddingVertical: 8, position: 'absolute', top: spacing.md },
  statePillAttention: { borderColor: 'rgba(209,133,120,.45)' },
  statePillText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 7, letterSpacing: 1.1 },
  statusDot: { backgroundColor: colors.success, borderRadius: radii.pill, height: 6, width: 6 },
  statusDotOffline: { backgroundColor: colors.goldStrong },
  statusPill: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 7, paddingHorizontal: 11, paddingVertical: 8 },
  statusPillText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 7, letterSpacing: 1.3 },
  subtitle: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, marginTop: spacing.sm },
  syncNotice: { alignItems: 'center', backgroundColor: 'rgba(227,195,101,.08)', borderColor: 'rgba(227,195,101,.28)', borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, padding: spacing.md },
  syncNoticeText: { color: colors.ivory, flex: 1, fontFamily: typography.body, fontSize: 11, lineHeight: 17 },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 45, letterSpacing: -1, marginTop: 5 },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  total: { color: colors.goldStrong, fontFamily: typography.display, fontSize: 20 },
  totalNote: { color: colors.muted, fontFamily: typography.bodySemiBold, fontSize: 6, letterSpacing: 1.1, marginTop: 3 },
  tripBody: { padding: spacing.md },
  tripList: { gap: spacing.lg },
  tripRow: { backgroundColor: colors.graphite, borderColor: colors.line, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  vehicleName: { color: colors.ivory, fontFamily: typography.display, fontSize: 24 },
  viewAction: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: 6, minHeight: 44, minWidth: 44, paddingHorizontal: spacing.md },
  viewText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 7, letterSpacing: 1.1 },
});
