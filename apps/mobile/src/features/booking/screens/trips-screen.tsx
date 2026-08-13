import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { BookingRequest, BookingRequestStatus } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { getPreviewVehicleById } from '@/features/discovery/data/preview-discovery-gateway';
import { vehicleImages } from '@/features/discovery/data/vehicle-images';

import { useBookings } from '../booking-context';

const statusPresentation: Record<
  BookingRequestStatus,
  { color: string; icon: keyof typeof Ionicons.glyphMap; label: string }
> = {
  availability_requested: {
    color: colors.goldStrong,
    icon: 'time-outline',
    label: 'AVAILABILITY REQUESTED',
  },
  booked: {
    color: colors.success,
    icon: 'checkmark-done-outline',
    label: 'BOOKED',
  },
  confirmed: {
    color: colors.success,
    icon: 'checkmark-circle-outline',
    label: 'VEHICLE CONFIRMED',
  },
  payment_required: {
    color: colors.goldStrong,
    icon: 'card-outline',
    label: 'PAYMENT REQUIRED',
  },
};

function formatTripDate(dateValue: string) {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  }).format(new Date(dateValue));
}

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { initializing, requests, syncState } = useBookings();
  const [entrance] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(entrance, {
      duration: 420,
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [entrance]);

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}
        style={{
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
            },
          ],
        }}
      >
        <View style={styles.topBar}>
          <BrandWordmark />
          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                syncState === 'offline' && styles.statusDotOffline,
              ]}
            />
            <Text style={styles.statusPillText}>
              {syncState === 'offline'
                ? 'OFFLINE CACHE'
                : syncState === 'syncing'
                  ? 'SYNCING'
                  : syncState === 'synced'
                    ? 'LIVE UPDATES'
                    : 'TRIP DESK'}
            </Text>
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>YOUR JOURNEYS</Text>
          <Text style={styles.title}>Trips</Text>
          <Text style={styles.subtitle}>
            Availability, confirmation, and concierge updates in one place.
          </Text>
        </View>

        {initializing ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.goldStrong} />
            <Text style={styles.loadingText}>Loading your journeys…</Text>
          </View>
        ) : requests.length ? (
          <>
            <View style={styles.summaryRow}>
              <View>
                <Text style={styles.sectionLabel}>ACTIVE REQUESTS</Text>
                <Text style={styles.summaryTitle}>
                  {requests.length} {requests.length === 1 ? 'journey' : 'journeys'} in review
                </Text>
              </View>
              <View style={styles.summaryIcon}>
                <Ionicons color={colors.goldStrong} name="time-outline" size={19} />
              </View>
            </View>

            <View style={styles.tripList}>
              {requests.map((request) => (
                <TripRequestRow key={request.id} request={request} />
              ))}
            </View>

            <View style={styles.conciergeNote}>
              <Ionicons color={colors.goldStrong} name="headset-outline" size={20} />
              <View style={styles.conciergeCopy}>
                <Text style={styles.conciergeTitle}>What happens next</Text>
                <Text style={styles.conciergeBody}>
                  MMG checks the vehicle and chauffeur, then moves your request to payment and confirmation.
                </Text>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyVisual}>
              <Image
                accessibilityLabel="MMG chauffeur-ready vehicle"
                contentFit="cover"
                source={vehicleImages['graphite-sedan']}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={['rgba(4,4,4,0.04)', 'rgba(4,4,4,0.9)']}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.emptyBadge}>
                <Ionicons color={colors.goldStrong} name="calendar-clear-outline" size={18} />
              </View>
              <Text style={styles.emptyVisualText}>YOUR NEXT ARRIVAL</Text>
            </View>
            <Text style={styles.emptyTitle}>No trips yet.</Text>
            <Text style={styles.emptyBody}>
              Choose a chauffeur-ready vehicle and your availability request will appear here.
            </Text>
            <PressableScale
              accessibilityRole="button"
              onPress={() => router.push('/(renter)/browse')}
            >
              <View style={styles.emptyAction}>
                <Text style={styles.emptyActionText}>EXPLORE THE FLEET</Text>
                <Ionicons color={colors.black} name="arrow-forward" size={17} />
              </View>
            </PressableScale>
          </View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

function TripRequestRow({ request }: { request: BookingRequest }) {
  const router = useRouter();
  const vehicle = getPreviewVehicleById(request.vehicleId);
  const presentation = statusPresentation[request.status];

  if (!vehicle) return null;

  return (
    <PressableScale
      accessibilityLabel={`View ${vehicle.displayName} request`}
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: '/vehicle/[vehicleId]',
          params: { vehicleId: vehicle.id },
        })
      }
    >
      <View style={styles.tripRow}>
        <View style={styles.tripImageFrame}>
          <Image
            contentFit="cover"
            source={vehicleImages[vehicle.imageKey]}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['transparent', 'rgba(4,4,4,0.68)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.pendingPill}>
            <Ionicons color={presentation.color} name={presentation.icon} size={12} />
            <Text style={styles.pendingText}>{presentation.label}</Text>
          </View>
        </View>
        <View style={styles.tripCopy}>
          <View style={styles.tripHeading}>
            <View style={styles.tripHeadingCopy}>
              <Text style={styles.tripName}>{vehicle.displayName}</Text>
              <Text style={styles.tripArea}>{vehicle.areaLabel} · Chauffeur included</Text>
            </View>
            <Ionicons color={colors.muted} name="arrow-forward-outline" size={18} />
          </View>
          <View style={styles.dateStrip}>
            <View>
              <Text style={styles.dateLabel}>PICKUP</Text>
              <Text style={styles.dateValue}>{formatTripDate(request.pickupAt)}</Text>
            </View>
            <View style={styles.dateLine} />
            <Ionicons color={colors.gold} name="arrow-forward" size={14} />
            <View style={styles.dateLine} />
            <View>
              <Text style={styles.dateLabel}>RETURN</Text>
              <Text style={styles.dateValue}>{formatTripDate(request.returnAt)}</Text>
            </View>
          </View>
          <View style={styles.tripFooter}>
            <Text style={styles.durationText}>{request.durationDays}-day journey</Text>
            <Text style={styles.totalText}>{formatNairaFromKobo(request.totalKobo)}</Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  conciergeBody: { color: colors.muted, fontFamily: typography.body, fontSize: 10, lineHeight: 16, marginTop: 4 },
  conciergeCopy: { flex: 1 },
  conciergeNote: { alignItems: 'flex-start', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl, paddingTop: spacing.lg },
  conciergeTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 12 },
  content: { paddingBottom: 120, paddingHorizontal: spacing.lg },
  dateLabel: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 7, letterSpacing: 1.2 },
  dateLine: { backgroundColor: colors.lineStrong, flex: 1, height: StyleSheet.hairlineWidth },
  dateStrip: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.lg },
  dateValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 10, marginTop: 4 },
  durationText: { color: colors.muted, fontFamily: typography.body, fontSize: 9 },
  emptyAction: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, minHeight: 50, paddingHorizontal: spacing.lg },
  emptyActionText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 9, letterSpacing: 1.3 },
  emptyBadge: { alignItems: 'center', backgroundColor: 'rgba(4,4,4,0.74)', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, height: 40, justifyContent: 'center', left: spacing.md, position: 'absolute', top: spacing.md, width: 40 },
  emptyBody: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, marginTop: spacing.sm, maxWidth: 330 },
  emptyState: { marginTop: spacing.xl },
  emptyTitle: { color: colors.ivory, fontFamily: typography.display, fontSize: 31, marginTop: spacing.lg },
  emptyVisual: { borderRadius: radii.lg, height: 224, justifyContent: 'flex-end', overflow: 'hidden', padding: spacing.lg },
  emptyVisualText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 8, letterSpacing: 1.8 },
  eyebrow: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 8, letterSpacing: 1.8 },
  intro: { marginBottom: spacing.xl, marginTop: spacing.xl },
  loadingState: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.section },
  loadingText: { color: colors.muted, fontFamily: typography.body, fontSize: 11 },
  pendingPill: { alignItems: 'center', backgroundColor: 'rgba(4,4,4,0.78)', borderRadius: radii.pill, bottom: spacing.sm, flexDirection: 'row', gap: 7, left: spacing.sm, paddingHorizontal: 10, paddingVertical: 7, position: 'absolute' },
  pendingText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 7, letterSpacing: 1.1 },
  screen: { backgroundColor: colors.black, flex: 1 },
  sectionLabel: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 8, letterSpacing: 1.7 },
  statusDot: { backgroundColor: colors.success, borderRadius: radii.pill, height: 6, width: 6 },
  statusDotOffline: { backgroundColor: colors.goldStrong },
  statusPill: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 7, paddingHorizontal: 11, paddingVertical: 8 },
  statusPillText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 7, letterSpacing: 1.3 },
  subtitle: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, marginTop: spacing.sm },
  summaryIcon: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, height: 42, justifyContent: 'center', width: 42 },
  summaryRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  summaryTitle: { color: colors.ivory, fontFamily: typography.display, fontSize: 24, marginTop: 5 },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 45, letterSpacing: -1, marginTop: 5 },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  totalText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 12 },
  tripArea: { color: colors.muted, fontFamily: typography.body, fontSize: 9, marginTop: 4 },
  tripCopy: { padding: spacing.md },
  tripFooter: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, paddingTop: spacing.md },
  tripHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  tripHeadingCopy: { flex: 1 },
  tripImageFrame: { height: 176 },
  tripList: { gap: spacing.lg, marginTop: spacing.lg },
  tripName: { color: colors.ivory, fontFamily: typography.display, fontSize: 22 },
  tripRow: { backgroundColor: colors.graphite, borderColor: colors.line, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
