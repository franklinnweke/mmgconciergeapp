import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@mmg/brand';
import { formatNairaFromKobo } from '@mmg/domain';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import {
  InlineNotice,
  MobileHeader,
  PrimaryAction,
} from '@/components/ui/mobile-primitives';
import { useAuth } from '@/core/auth/auth-context';
import {
  createOwnerBookingRepository,
  type OwnerBookingSnapshot,
} from '../data/owner-booking-repository';
import { groupOwnerBookings } from '../domain/owner-booking';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lagos',
  }).format(new Date(`${value}T12:00:00+01:00`));
}

function stateLabel(state: string) {
  switch (state) {
    case 'paid_pending_owner': return 'Awaiting your response';
    case 'confirmed': return 'Confirmed';
    case 'intervention_required': return 'MMG review needed';
    case 'cancelled': return 'Cancelled';
    case 'refund_pending': return 'Refund pending';
    case 'refunded': return 'Refunded';
    case 'in_progress': return 'In progress';
    case 'completion_pending': return 'Completion pending';
    case 'completed': return 'Completed';
    default: return state.replaceAll('_', ' ');
  }
}

export function OwnerBookingsDeskScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const repository = useMemo(() => createOwnerBookingRepository(), []);
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
    return repository.subscribe(
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
  }, [repository, user?.uid, refreshKey]);

  const groups = groupOwnerBookings(snapshot.bookings);
  const sections = [
    ['Awaiting you', groups.awaiting],
    ['Confirmed', groups.confirmed],
    ['Needs attention', groups.attention],
    ['Other', groups.other],
  ] as const;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={retry} refreshing={loading} tintColor={colors.goldStrong} />}
        showsVerticalScrollIndicator={false}
      >
        <MobileHeader onBack={() => router.back()} title="Bookings" />

        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>Booking desk</Text>
          <Text style={styles.subtitle}>Respond to paid booking requests and track confirmed journeys.</Text>
        </View>

        {snapshot.source === 'development_fixture' ? (
          <InlineNotice icon="flask-outline">Development preview. Actions do not change live booking data.</InlineNotice>
        ) : null}
        {snapshot.skippedInvalidCount > 0 ? (
          <InlineNotice icon="alert-circle-outline" tone="danger">
            {snapshot.skippedInvalidCount} booking record{snapshot.skippedInvalidCount === 1 ? '' : 's'} could not be displayed.
          </InlineNotice>
        ) : null}
        {error ? (
          <View style={styles.errorBlock}>
            <InlineNotice icon="cloud-offline-outline" tone="danger">{error}</InlineNotice>
            <PrimaryAction icon="refresh" label="Try again" onPress={retry} />
          </View>
        ) : null}

        {loading && snapshot.bookings.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.goldStrong} size="small" />
            <Text style={styles.loadingText}>Loading bookings</Text>
          </View>
        ) : null}

        {!loading && !error && snapshot.bookings.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons color={colors.goldStrong} name="calendar-outline" size={26} />
            <Text style={styles.emptyTitle}>No paid booking requests yet</Text>
            <Text style={styles.emptyBody}>Paid requests will appear here when live payment is enabled and a renter completes checkout.</Text>
          </View>
        ) : null}

        {sections.map(([label, bookings]) =>
          bookings.length ? (
            <View key={label} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>{label}</Text>
                <Text style={styles.sectionCount}>{bookings.length}</Text>
              </View>
              <View>
                {bookings.map((booking) => (
                  <PressableScale
                    accessibilityLabel={`Open booking for ${booking.vehicleSnapshot.displayName}`}
                    accessibilityRole="button"
                    key={booking.id}
                    onPress={() =>
                      router.push({
                        pathname: '/(owner)/owner-bookings/[bookingId]' as never,
                        params: { bookingId: booking.id },
                      })
                    }
                  >
                    <View style={styles.bookingRow}>
                      <View style={styles.rowBody}>
                        <Text numberOfLines={2} style={styles.vehicle}>{booking.vehicleSnapshot.displayName}</Text>
                        <Text style={styles.dates}>{formatDate(booking.startDate)} → {formatDate(booking.endDate)}</Text>
                        <View style={styles.metaRow}>
                          <Text style={styles.state}>{stateLabel(booking.state)}</Text>
                          <Text style={styles.earnings}>{formatNairaFromKobo(booking.priceSnapshot.ownerEarningsKobo)} earnings</Text>
                        </View>
                      </View>
                      <Ionicons color={colors.muted} name="chevron-forward" size={18} />
                    </View>
                  </PressableScale>
                ))}
              </View>
            </View>
          ) : null,
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bookingRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 88,
    paddingVertical: spacing.md,
  },
  content: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  dates: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: 4,
  },
  earnings: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  empty: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  emptyBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  emptyTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 25,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  errorBlock: { gap: spacing.md },
  intro: { marginTop: spacing.lg },
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
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  rowBody: { flex: 1 },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  section: { marginTop: spacing.xl },
  sectionCount: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    color: colors.silver,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
  },
  state: {
    color: colors.goldStrong,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 31,
    letterSpacing: -0.55,
  },
  vehicle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 19,
    letterSpacing: -0.2,
  },
});
