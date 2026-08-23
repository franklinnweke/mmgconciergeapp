import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { OwnerVisibleBooking } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  FieldLabel,
  InlineNotice,
  MobileHeader,
  PrimaryAction,
  SecondaryAction,
  SectionHeading,
} from '@/components/ui/mobile-primitives';
import { useAuth } from '@/core/auth/auth-context';
import { ownerCommandErrorMessage } from '@/features/owner/domain/owner-errors';
import { createOwnerBookingGateway } from '../data/owner-booking-gateway';
import { createOwnerBookingRepository } from '../data/owner-booking-repository';
import {
  canOwnerRespond,
  hasReachedExpectedState,
  isDeclineReasonValid,
} from '../domain/owner-booking';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'long',
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

export function OwnerBookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const repository = useMemo(() => createOwnerBookingRepository(), []);
  const gateway = useMemo(() => createOwnerBookingGateway(), []);
  const [booking, setBooking] = useState<OwnerVisibleBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    state: 'confirmed' | 'intervention_required';
    version: number;
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const retry = () => {
    setError(null);
    setLoading(true);
    setRefreshKey((key) => key + 1);
  };

  useEffect(() => {
    if (!user?.uid || !bookingId) return undefined;
    return repository.subscribe(
      user.uid,
      (snapshot) => {
        const next = snapshot.bookings.find((item) => item.id === bookingId) ?? null;
        setBooking(next);
        setLoading(false);
        setError(null);
        if (pending && hasReachedExpectedState(next, pending)) {
          setPending(null);
          setBusy(false);
          Alert.alert('Booking updated', 'Your response is now reflected on the booking.');
        }
      },
      () => {
        setError('This booking could not be refreshed. Your last action has not been confirmed.');
        setPending(null);
        setBusy(false);
        setLoading(false);
      },
    );
  }, [bookingId, pending, refreshKey, repository, user?.uid]);

  const act = async (kind: 'confirm' | 'reject') => {
    if (!booking || busy) return;
    if (kind === 'reject' && !isDeclineReasonValid(reason)) {
      setError(`Add a decline reason between 10 and 500 characters (${reason.trim().length}/500).`);
      return;
    }

    setBusy(true);
    setError(null);
    const expected = {
      state: kind === 'confirm' ? ('confirmed' as const) : ('intervention_required' as const),
      version: booking.version + 1,
    };
    setPending(expected);

    try {
      if (kind === 'confirm') {
        await gateway.confirm(
          booking.id,
          booking.version,
          `owner_confirm_${booking.id}_${booking.version}`,
        );
      } else {
        await gateway.reject(
          booking.id,
          booking.version,
          reason.trim(),
          `owner_reject_${booking.id}_${booking.version}`,
        );
      }
    } catch (caught) {
      setPending(null);
      setBusy(false);
      setError(ownerCommandErrorMessage(caught));
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.goldStrong} size="small" />
          <Text style={styles.centeredText}>Loading booking</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.fallback}>
          <Ionicons color={colors.danger} name="alert-circle-outline" size={30} />
          <Text style={styles.fallbackTitle}>Booking unavailable</Text>
          <Text accessibilityLiveRegion="polite" style={styles.fallbackText}>
            {error ?? 'This record may have changed or is not assigned to your fleet.'}
          </Text>
          <View style={styles.fallbackActions}>
            {error ? <PrimaryAction icon="refresh" label="Try again" onPress={retry} /> : null}
            <SecondaryAction label="Back to bookings" onPress={() => router.back()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <MobileHeader onBack={() => router.back()} title="Booking" />

        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>{booking.vehicleSnapshot.displayName}</Text>
          <Text style={styles.state}>{stateLabel(booking.state)}</Text>
        </View>

        {error ? <InlineNotice icon="alert-circle-outline" tone="danger">{error}</InlineNotice> : null}
        {pending ? <InlineNotice icon="sync-outline">Waiting for the refreshed booking status from MMG.</InlineNotice> : null}

        <View style={styles.dateRow}>
          <DatePoint label="Pickup" value={formatDate(booking.startDate)} />
          <Ionicons color={colors.muted} name="arrow-forward" size={17} />
          <DatePoint alignEnd label="Return" value={formatDate(booking.endDate)} />
        </View>

        <View style={styles.section}>
          <SectionHeading>Earnings</SectionHeading>
          <ValueRow label="Base rental" value={formatNairaFromKobo(booking.priceSnapshot.baseRentalKobo)} />
          <View style={styles.earningsTotal}>
            <Text style={styles.earningsLabel}>Your earnings</Text>
            <Text style={styles.earningsValue}>{formatNairaFromKobo(booking.priceSnapshot.ownerEarningsKobo)}</Text>
          </View>
        </View>

        {canOwnerRespond(booking) ? (
          <View style={styles.actionsSection}>
            <PrimaryAction
              icon="checkmark"
              label="Confirm booking"
              loading={busy && pending?.state === 'confirmed'}
              disabled={busy}
              onPress={() => void act('confirm')}
            />

            <View style={styles.declineSection}>
              <FieldLabel>Cannot accept this journey?</FieldLabel>
              <TextInput
                accessibilityHint="Enter 10 to 500 characters"
                accessibilityLabel="Decline reason"
                editable={!busy}
                maxLength={500}
                multiline
                onChangeText={setReason}
                placeholder="Tell MMG why this vehicle cannot take the journey"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={reason}
              />
              <Text style={styles.counter}>{reason.trim().length}/500</Text>
              <SecondaryAction
                destructive
                disabled={busy}
                icon="close-circle-outline"
                label="Decline booking"
                onPress={() =>
                  Alert.alert(
                    'Decline this booking?',
                    'This releases the reserved dates and opens an MMG intervention case.',
                    [
                      { text: 'Keep booking', style: 'cancel' },
                      { text: 'Decline', style: 'destructive', onPress: () => void act('reject') },
                    ],
                  )
                }
              />
            </View>
          </View>
        ) : (
          <View style={styles.terminalRow}>
            <Ionicons color={colors.muted} name="checkmark-circle-outline" size={18} />
            <Text style={styles.terminalText}>This booking is no longer awaiting your response.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DatePoint({ alignEnd, label, value }: { alignEnd?: boolean; label: string; value: string }) {
  return (
    <View style={[styles.datePoint, alignEnd && styles.datePointEnd]}>
      <Text style={styles.dateLabel}>{label}</Text>
      <Text style={styles.dateValue}>{value}</Text>
    </View>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.valueRow}>
      <Text style={styles.valueLabel}>{label}</Text>
      <Text style={styles.valueText}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionsSection: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  centeredText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  content: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  counter: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  dateLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  datePoint: { flex: 1 },
  datePointEnd: { alignItems: 'flex-end' },
  dateRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
  },
  dateValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
    marginTop: 3,
  },
  declineSection: { marginTop: spacing.sm },
  earningsLabel: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
  },
  earningsTotal: {
    alignItems: 'baseline',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.md,
  },
  earningsValue: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 26,
  },
  fallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  fallbackActions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  fallbackText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  fallbackTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 27,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 14,
    minHeight: 96,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  intro: { marginTop: spacing.lg },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  section: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
  },
  state: {
    color: colors.goldStrong,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    marginTop: 5,
  },
  terminalRow: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingTop: spacing.md,
  },
  terminalText: {
    color: colors.muted,
    flex: 1,
    fontFamily: typography.body,
    fontSize: 13,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 31,
    letterSpacing: -0.55,
  },
  valueLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  valueRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  valueText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
});
