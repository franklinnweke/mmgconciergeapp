import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@mmg/brand';
import type { OwnerVisibleRentalRequest } from '@mmg/contracts/rental-request';
import { formatNairaFromKobo } from '@mmg/domain';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { useAuth } from '@/core/auth/auth-context';
import {
  createOwnerBookingRepository,
  type OwnerBookingSnapshot,
} from '../data/owner-booking-repository';
import { createOwnerRentalRequestGateway } from '../data/owner-rental-request-gateway';
import { groupOwnerBookings } from '../domain/owner-booking';
import { ownerRequestStateCopy } from '../domain/owner-rental-request';

export function OwnerBookingsDeskScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const repository = useMemo(() => createOwnerBookingRepository(), []);
  const requestGateway = useMemo(() => createOwnerRentalRequestGateway(), []);
  const [requests, setRequests] = useState<OwnerVisibleRentalRequest[]>([]);
  const [snapshot, setSnapshot] = useState<OwnerBookingSnapshot>({
    bookings: [],
    skippedInvalidCount: 0,
    source: 'unavailable',
  });
  const [loading, setLoading] = useState(Boolean(user?.uid));
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const retry = () => {
    setError(null);
    setLoading(true);
    setRefreshKey((key) => key + 1);
  };

  useEffect(() => {
    if (!user?.uid) return undefined;
    let active = true;
    void requestGateway.listRequests()
      .then((listed) => {
        if (active) setRequests(listed.requests);
      })
      .catch(() => {
        if (active) setError('Rental requests could not be loaded. Check your connection and try again.');
      });
    const stop = repository.subscribe(
      user.uid,
      (next) => {
        setSnapshot(next);
        setError(null);
        setLoading(false);
      },
      () => {
        setLoading(false);
        setError('Bookings could not be loaded. Check your connection and try again.');
      },
    );
    return () => {
      active = false;
      stop();
    };
  }, [refreshKey, repository, requestGateway, user?.uid]);

  const groups = groupOwnerBookings(snapshot.bookings);
  const sections = [
    ['Awaiting your response', groups.awaiting],
    ['Confirmed', groups.confirmed],
    ['Needs attention', groups.attention],
    ['Other', groups.other],
  ] as const;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><ScreenHeader showBrand={false} title="Bookings" /></View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={retry} refreshing={loading} tintColor={colors.gold} />}
      >
        {snapshot.source === 'development_fixture' ? (
          <View style={styles.fixture}>
            <Ionicons color={colors.goldStrong} name="flask-outline" size={16} />
            <Text style={styles.fixtureText}>Development preview data. Actions do not affect live bookings.</Text>
          </View>
        ) : null}

        {snapshot.skippedInvalidCount > 0 ? (
          <View style={styles.warning}>
            <Text style={styles.warningText}>
              {snapshot.skippedInvalidCount} booking record{snapshot.skippedInvalidCount === 1 ? '' : 's'} could not be displayed.
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.error}>
            <Text style={styles.errorText}>{error}</Text>
            <PressableScale accessibilityRole="button" onPress={retry}>
              <Text style={styles.retryText}>Try again</Text>
            </PressableScale>
          </View>
        ) : null}

        {loading && snapshot.bookings.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.gold} />
            <Text style={styles.muted}>Loading bookings…</Text>
          </View>
        ) : null}

        {!loading && !error && snapshot.bookings.length === 0 && requests.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons color={colors.muted} name="calendar-outline" size={28} />
            <Text style={styles.emptyTitle}>No bookings yet</Text>
            <Text style={styles.muted}>Renter requests and paid bookings for your vehicles will appear here.</Text>
          </View>
        ) : null}

        {requests.length ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>Rental requests</Text>
              <Text style={styles.sectionCount}>{requests.length}</Text>
            </View>
            {requests.map((request) => {
              const copy = ownerRequestStateCopy(request.state);
              const price = request.authoritativePriceSnapshot ?? request.estimatedPriceSnapshot;
              return (
                <PressableScale
                  key={request.requestId}
                  accessibilityLabel={`Open request for ${request.vehicleSnapshot.displayName}`}
                  accessibilityRole="button"
                  onPress={() => router.push({
                    pathname: '/(owner)/owner-bookings/request/[requestId]' as never,
                    params: { requestId: request.requestId },
                  })}
                >
                  <View style={styles.row}>
                    <View style={styles.rowBody}>
                      <Text style={styles.vehicle}>{request.vehicleSnapshot.displayName}</Text>
                      <Text style={styles.meta}>{request.startDate} to {request.endDate} · {request.serviceAreaLabel}</Text>
                      <Text style={styles.meta}>{copy.label} · {formatNairaFromKobo(price.ownerEarningsKobo)} earnings</Text>
                    </View>
                    <Ionicons color={colors.muted} name="chevron-forward" size={18} />
                  </View>
                </PressableScale>
              );
            })}
          </View>
        ) : null}

        {sections.map(([label, bookings]) => bookings.length ? (
          <View key={label} style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>{label}</Text>
              <Text style={styles.sectionCount}>{bookings.length}</Text>
            </View>
            {bookings.map((booking) => (
              <PressableScale
                key={booking.id}
                accessibilityLabel={`Open booking for ${booking.vehicleSnapshot.displayName}`}
                accessibilityRole="button"
                onPress={() => router.push({
                  pathname: '/(owner)/owner-bookings/[bookingId]' as never,
                  params: { bookingId: booking.id },
                })}
              >
                <View style={styles.row}>
                  <View style={styles.rowBody}>
                    <Text style={styles.vehicle}>{booking.vehicleSnapshot.displayName}</Text>
                    <Text style={styles.meta}>{booking.startDate} to {booking.endDate}</Text>
                    <Text style={styles.meta}>{booking.state.replaceAll('_', ' ')} · {formatNairaFromKobo(booking.priceSnapshot.ownerEarningsKobo)} earnings</Text>
                  </View>
                  <Ionicons color={colors.muted} name="chevron-forward" size={18} />
                </View>
              </PressableScale>
            ))}
          </View>
        ) : null)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  content: { gap: spacing.lg, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  empty: { alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 20 },
  error: { backgroundColor: 'rgba(239,68,68,0.10)', gap: spacing.sm, padding: spacing.md },
  errorText: { color: colors.danger, fontFamily: typography.body, fontSize: 13 },
  fixture: { alignItems: 'center', backgroundColor: 'rgba(227,195,101,0.08)', flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  fixtureText: { color: colors.ivory, flex: 1, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  meta: { color: colors.muted, fontFamily: typography.body, fontSize: 13 },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  retryText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 13 },
  row: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 76, paddingVertical: spacing.md },
  rowBody: { flex: 1, gap: 4 },
  safe: { backgroundColor: colors.black, flex: 1 },
  section: { gap: spacing.xs },
  sectionCount: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 12 },
  sectionHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  sectionLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15 },
  vehicle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 16 },
  warning: { backgroundColor: 'rgba(227,195,101,0.08)', padding: spacing.md },
  warningText: { color: colors.goldStrong, fontFamily: typography.body, fontSize: 13 },
});
