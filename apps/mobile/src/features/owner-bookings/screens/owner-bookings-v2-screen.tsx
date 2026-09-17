import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@mmg/brand';
import type { OwnerVisibleRentalRequest } from '@mmg/contracts/rental-request';
import { formatNairaFromKobo } from '@mmg/domain';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { useAuth } from '@/core/auth/auth-context';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import { addDaysToDateOnly, formatLagosDateOnly } from '@/features/discovery/data/lagos-destinations';
import {
  createOwnerBookingRepository,
  type OwnerBookingSnapshot,
} from '../data/owner-booking-repository';
import { createOwnerRentalRequestGateway } from '../data/owner-rental-request-gateway';
import { groupOwnerBookings } from '../domain/owner-booking';
import { ownerBookingsLoadPresentation } from '../domain/owner-bookings-load-state';
import { ownerRequestStateCopy } from '../domain/owner-rental-request';

function rangeLabel(startDate: string, endDate: string) {
  const lastRentalDate = addDaysToDateOnly(endDate, -1);
  if (lastRentalDate === startDate) return formatLagosDateOnly(startDate);
  return `${formatLagosDateOnly(startDate)} to ${formatLagosDateOnly(lastRentalDate)}`;
}

function bookingStateLabel(state: string) {
  const labels: Record<string, string> = {
    paid_pending_owner: 'Awaiting your response',
    confirmed: 'Confirmed',
    intervention_required: 'Needs MMG attention',
    cancelled: 'Cancelled',
    refund_pending: 'Refund pending',
    refunded: 'Refunded',
    in_progress: 'In progress',
    completion_pending: 'Completion pending',
    completed: 'Completed',
  };
  return labels[state] ?? 'Booking updated';
}

export function OwnerBookingsV2Screen() {
  const router = useRouter();
  const { signingOut, user } = useAuth();
  const repository = useMemo(() => createOwnerBookingRepository(), []);
  const requestGateway = useMemo(() => createOwnerRentalRequestGateway(), []);
  const [requests, setRequests] = useState<OwnerVisibleRentalRequest[]>([]);
  const [snapshot, setSnapshot] = useState<OwnerBookingSnapshot>({ bookings: [], skippedInvalidCount: 0, source: 'unavailable' });
  const [requestsLoading, setRequestsLoading] = useState(Boolean(user?.uid));
  const [bookingsLoading, setBookingsLoading] = useState(Boolean(user?.uid));
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { loading, errors } = ownerBookingsLoadPresentation({ requestsLoading, bookingsLoading, requestsError, bookingsError });

  const retry = () => {
    setRequestsError(null);
    setBookingsError(null);
    setRequestsLoading(true);
    setBookingsLoading(true);
    setRefreshKey((value) => value + 1);
  };

  useEffect(() => {
    if (!user?.uid || signingOut) return undefined;
    let active = true;
    void requestGateway.listRequests()
      .then((listed) => {
        if (!active || signingOut) return;
        setRequests(listed.requests);
        setRequestsError(null);
      })
      .catch(() => { if (active && !signingOut) setRequestsError('Rental requests could not be loaded. Check your connection and try again.'); })
      .finally(() => { if (active && !signingOut) setRequestsLoading(false); });

    const stop = repository.subscribe(
      user.uid,
      (next) => {
        if (signingOut) return;
        setSnapshot(next);
        setBookingsError(null);
        setBookingsLoading(false);
      },
      () => {
        if (signingOut) return;
        setBookingsLoading(false);
        setBookingsError('Bookings could not be loaded. Check your connection and try again.');
      },
    );
    return () => { active = false; stop(); };
  }, [refreshKey, repository, requestGateway, signingOut, user?.uid]);

  const responseNeeded = requests.filter((request) => request.state === 'requested');
  const otherRequests = requests.filter((request) => request.state !== 'requested');
  const bookingGroups = groupOwnerBookings(snapshot.bookings);

  const right = (
    <PressableScale accessibilityLabel="Back to renter home" accessibilityRole="button" onPress={() => router.replace('/(renter)' as Href)}>
      <Text style={styles.headerLink}>Renter home</Text>
    </PressableScale>
  );

  if (signingOut) {
    return <AuthLoadingScreen message="Signing out" />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <ScreenHeader onBack={() => router.back()} right={right} showBrand={false} title="Requests & bookings" />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={retry} refreshing={loading} tintColor={colors.gold} />}
      >
        {snapshot.source === 'development_fixture' ? <Text style={styles.fixture}>Development preview data. Actions do not affect live bookings.</Text> : null}
        {snapshot.skippedInvalidCount > 0 ? <Text style={styles.warning}>{snapshot.skippedInvalidCount} booking record{snapshot.skippedInvalidCount === 1 ? '' : 's'} could not be displayed.</Text> : null}
        {errors.length ? (
          <View style={styles.errorBox}>
            {errors.map((message) => <Text key={message} style={styles.errorText}>{message}</Text>)}
            <PressableScale onPress={retry}><Text style={styles.retry}>Try again</Text></PressableScale>
          </View>
        ) : null}

        {loading && !requests.length && !snapshot.bookings.length ? (
          <View style={styles.center}><ActivityIndicator color={colors.goldStrong} /><Text style={styles.muted}>Loading requests and bookings…</Text></View>
        ) : null}

        {!loading && !errors.length && !requests.length && !snapshot.bookings.length ? (
          <View style={styles.empty}>
            <Ionicons color={colors.muted} name="calendar-outline" size={28} />
            <Text style={styles.emptyTitle}>Nothing to manage yet</Text>
            <Text style={styles.muted}>New renter requests and confirmed bookings for your fleet will appear here.</Text>
          </View>
        ) : null}

        <RequestSection title="Needs your response" requests={responseNeeded} onOpen={(requestId) => router.push({ pathname: '/(owner)/owner-bookings/request/[requestId]', params: { requestId } } as Href)} />
        <RequestSection title="Rental requests" requests={otherRequests} onOpen={(requestId) => router.push({ pathname: '/(owner)/owner-bookings/request/[requestId]', params: { requestId } } as Href)} />

        <BookingSection title="Confirmed" bookings={bookingGroups.confirmed} onOpen={(bookingId) => router.push({ pathname: '/(owner)/owner-bookings/[bookingId]', params: { bookingId } } as Href)} />
        <BookingSection title="Needs attention" bookings={bookingGroups.attention} onOpen={(bookingId) => router.push({ pathname: '/(owner)/owner-bookings/[bookingId]', params: { bookingId } } as Href)} />
        <BookingSection title="Historical owner response" bookings={bookingGroups.awaiting} onOpen={(bookingId) => router.push({ pathname: '/(owner)/owner-bookings/[bookingId]', params: { bookingId } } as Href)} />
        <BookingSection title="Other bookings" bookings={bookingGroups.other} onOpen={(bookingId) => router.push({ pathname: '/(owner)/owner-bookings/[bookingId]', params: { bookingId } } as Href)} />
      </ScrollView>
    </SafeAreaView>
  );
}

function RequestSection({ title, requests, onOpen }: { title: string; requests: OwnerVisibleRentalRequest[]; onOpen(id: string): void }) {
  if (!requests.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.count}>{requests.length}</Text></View>
      {requests.map((request) => {
        const state = ownerRequestStateCopy(request.state);
        const price = request.authoritativePriceSnapshot ?? request.estimatedPriceSnapshot;
        return (
          <PressableScale key={request.requestId} onPress={() => onOpen(request.requestId)}>
            <View style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.vehicle}>{request.vehicleSnapshot.displayName}</Text>
                <Text style={styles.muted}>{rangeLabel(request.startDate, request.endDate)} · {request.serviceAreaLabel}</Text>
                <Text style={styles.state}>{state.label}</Text>
              </View>
              <Text style={styles.earnings}>{formatNairaFromKobo(price.ownerEarningsKobo)}</Text>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

function BookingSection({ title, bookings, onOpen }: { title: string; bookings: OwnerBookingSnapshot['bookings']; onOpen(id: string): void }) {
  if (!bookings.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.count}>{bookings.length}</Text></View>
      {bookings.map((booking) => (
        <PressableScale key={booking.id} onPress={() => onOpen(booking.id)}>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.vehicle}>{booking.vehicleSnapshot.displayName}</Text>
              <Text style={styles.muted}>{rangeLabel(booking.startDate, booking.endDate)}</Text>
              <Text style={styles.state}>{bookingStateLabel(booking.state)}</Text>
            </View>
            <Text style={styles.earnings}>{formatNairaFromKobo(booking.priceSnapshot.ownerEarningsKobo)}</Text>
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  content: { gap: spacing.xl, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  count: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 12 },
  earnings: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13 },
  empty: { alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 20 },
  errorBox: { backgroundColor: 'rgba(239,68,68,0.08)', gap: spacing.sm, padding: spacing.md },
  errorText: { color: colors.danger, fontFamily: typography.body, fontSize: 13 },
  fixture: { color: colors.goldStrong, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerLink: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 12, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  retry: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 13 },
  row: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 82, paddingVertical: spacing.md },
  rowCopy: { flex: 1, gap: 3, minWidth: 0 },
  screen: { backgroundColor: colors.black, flex: 1 },
  section: { gap: spacing.xs },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 16 },
  state: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 12 },
  vehicle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15 },
  warning: { color: colors.goldStrong, fontFamily: typography.body, fontSize: 12 },
});