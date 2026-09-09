import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { OwnerVisibleRentalRequest } from '@mmg/contracts/rental-request';
import { formatNairaFromKobo } from '@mmg/domain';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { useAuth } from '@/core/auth/auth-context';
import { safeProviderError } from '@/core/errors/safe-provider-error';
import { createOwnerBookingRepository, type OwnerBookingSnapshot } from '../data/owner-booking-repository';
import { OwnerRentalRequestGateway } from '../data/owner-rental-request-gateway';
import { OwnerRentalRequestRepository } from '../data/owner-rental-request-repository';
import { groupOwnerBookings } from '../domain/owner-booking';

export function OwnerBookingsDeskScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const bookingRepository = useMemo(() => createOwnerBookingRepository(), []);
  const requestRepository = useMemo(() => new OwnerRentalRequestRepository(), []);
  const requestGateway = useMemo(() => new OwnerRentalRequestGateway(), []);
  const [bookingSnapshot, setBookingSnapshot] = useState<OwnerBookingSnapshot>({ bookings: [], skippedInvalidCount: 0, source: 'unavailable' });
  const [requests, setRequests] = useState<OwnerVisibleRentalRequest[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(Boolean(user?.uid));
  const [loadingRequests, setLoadingRequests] = useState(Boolean(user?.uid));
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

  const retry = () => { setError(null); setLoadingBookings(true); setLoadingRequests(true); setRefreshKey((key) => key + 1); };

  useEffect(() => {
    if (!user?.uid) return undefined;
    const stopBookings = bookingRepository.subscribe(user.uid, (next) => { setBookingSnapshot(next); setLoadingBookings(false); }, () => { setLoadingBookings(false); setError('Bookings could not be loaded.'); });
    const stopRequests = requestRepository.subscribe(user.uid, (next) => { setRequests(next.requests); setLoadingRequests(false); }, () => { setLoadingRequests(false); setError('Rental requests could not be loaded.'); });
    return () => { stopBookings(); stopRequests(); };
  }, [bookingRepository, requestRepository, user?.uid, refreshKey]);

  const act = async (request: OwnerVisibleRentalRequest, decision: 'approve' | 'decline') => {
    if (busyRequestId) return;
    setBusyRequestId(request.requestId); setError(null);
    try {
      if (decision === 'approve') await requestGateway.approve(request.requestId, request.version);
      else await requestGateway.decline(request.requestId, request.version);
    } catch (caught) {
      setError(safeProviderError(caught, decision === 'approve' ? 'This request could not be approved. Availability may have changed.' : 'This request could not be declined.'));
    } finally { setBusyRequestId(null); }
  };

  const pending = requests.filter((request) => request.state === 'requested');
  const waitingPayment = requests.filter((request) => request.state === 'ready_for_payment');
  const groups = groupOwnerBookings(bookingSnapshot.bookings);
  const loading = loadingBookings || loadingRequests;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><ScreenHeader showBrand={false} title="Requests & bookings" /></View>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl onRefresh={retry} refreshing={loading} tintColor={colors.gold} />}>
        {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><PressableScale accessibilityRole="button" onPress={retry}><Text style={styles.retry}>Try again</Text></PressableScale></View> : null}
        {loading && pending.length === 0 && bookingSnapshot.bookings.length === 0 ? <View style={styles.center}><ActivityIndicator color={colors.gold} /><Text style={styles.muted}>Loading requests…</Text></View> : null}

        {pending.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>NEW REQUESTS</Text>
            {pending.map((request) => (
              <View key={request.requestId} style={styles.requestCard}>
                <Text style={styles.vehicle}>{request.vehicleSnapshot.displayName}</Text>
                <Text style={styles.meta}>{request.startDate} to {request.endDate} · {request.serviceAreaLabel}</Text>
                <Text style={styles.meta}>{formatNairaFromKobo(request.estimatedPriceSnapshot.renterTotalKobo)} estimated total</Text>
                <Text style={styles.privacy}>Renter contact details stay with MMG until payment is secured.</Text>
                <View style={styles.actions}>
                  <PressableScale accessibilityRole="button" disabled={busyRequestId === request.requestId} onPress={() => void act(request, 'approve')} style={styles.actionFlex}><View style={styles.approve}><Text style={styles.approveText}>{busyRequestId === request.requestId ? 'Working…' : 'Accept request'}</Text></View></PressableScale>
                  <PressableScale accessibilityRole="button" disabled={busyRequestId === request.requestId} onPress={() => Alert.alert('Decline request?', 'MMG will tell the renter this vehicle was not approved for the requested dates.', [{ text: 'Keep request', style: 'cancel' }, { text: 'Decline', style: 'destructive', onPress: () => void act(request, 'decline') }])} style={styles.actionFlex}><View style={styles.decline}><Text style={styles.declineText}>Decline</Text></View></PressableScale>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {waitingPayment.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>AWAITING RENTER PAYMENT</Text>
            {waitingPayment.map((request) => <View key={request.requestId} style={styles.row}><View style={styles.rowBody}><Text style={styles.vehicle}>{request.vehicleSnapshot.displayName}</Text><Text style={styles.meta}>{request.startDate} to {request.endDate}</Text><Text style={styles.meta}>Approved · 30-minute payment window active</Text></View><Ionicons color={colors.goldStrong} name="time-outline" size={18} /></View>)}
          </View>
        ) : null}

        {([
          ['Confirmed', groups.confirmed],
          ['Needs attention', groups.attention],
          ['Other', groups.other],
        ] as const).map(([label, bookings]) => bookings.length ? (
          <View key={label} style={styles.section}>
            <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
            {bookings.map((booking) => (
              <PressableScale key={booking.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/(owner)/owner-bookings/[bookingId]' as never, params: { bookingId: booking.id } })}>
                <View style={styles.row}><View style={styles.rowBody}><Text style={styles.vehicle}>{booking.vehicleSnapshot.displayName}</Text><Text style={styles.meta}>{booking.startDate} to {booking.endDate}</Text><Text style={styles.meta}>{booking.state.replaceAll('_', ' ')} · {formatNairaFromKobo(booking.priceSnapshot.ownerEarningsKobo)} earnings</Text></View><Ionicons color={colors.muted} name="chevron-forward" size={18} /></View>
              </PressableScale>
            ))}
          </View>
        ) : null)}

        {!loading && pending.length === 0 && waitingPayment.length === 0 && bookingSnapshot.bookings.length === 0 ? <View style={styles.center}><Ionicons color={colors.muted} name="calendar-outline" size={28} /><Text style={styles.vehicle}>No requests yet</Text><Text style={styles.muted}>New renter requests assigned to your fleet will appear here.</Text></View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actionFlex: { flex: 1 }, actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  approve: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', minHeight: 44 }, approveText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 12 },
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }, content: { gap: spacing.lg, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  decline: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, justifyContent: 'center', minHeight: 44 }, declineText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 12 },
  error: { backgroundColor: 'rgba(239,68,68,0.10)', gap: spacing.sm, padding: spacing.md }, errorText: { color: colors.danger, fontFamily: typography.body, fontSize: 13 },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md }, meta: { color: colors.muted, fontFamily: typography.body, fontSize: 13 }, muted: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  privacy: { color: colors.muted, fontFamily: typography.body, fontSize: 11, lineHeight: 17, marginTop: spacing.xs }, requestCard: { borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, gap: 5, padding: spacing.md }, retry: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 13 },
  row: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 76, paddingVertical: spacing.md }, rowBody: { flex: 1, gap: 4 }, safe: { backgroundColor: colors.black, flex: 1 }, section: { gap: spacing.sm }, sectionLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14 }, vehicle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 16 },
});
