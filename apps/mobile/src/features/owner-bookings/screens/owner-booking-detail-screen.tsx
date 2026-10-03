import { colors, radii, spacing, typography } from '@mmg/brand';
import type { OwnerVisibleBooking } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { useAuth } from '@/core/auth/auth-context';
import { addDaysToDateOnly, formatLagosDateOnly } from '@/features/discovery/data/lagos-destinations';
import { ownerCommandErrorMessage } from '@/features/owner/domain/owner-errors';
import { createOwnerBookingGateway } from '../data/owner-booking-gateway';
import { createOwnerBookingRepository } from '../data/owner-booking-repository';
import {
  canOwnerRespond,
  hasReachedExpectedState,
  isDeclineReasonValid,
} from '../domain/owner-booking';

function formatCommission(basisPoints: number) {
  return `${(basisPoints / 100).toFixed(basisPoints % 100 === 0 ? 0 : 2)}%`;
}

function rangeLabel(startDate: string, endDate: string) {
  const lastRentalDate = addDaysToDateOnly(endDate, -1);
  if (lastRentalDate === startDate) return formatLagosDateOnly(startDate);
  return `${formatLagosDateOnly(startDate)} to ${formatLagosDateOnly(lastRentalDate)}`;
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
          Alert.alert('Booking updated', 'Your response has been saved.');
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
    setPending({
      state: kind === 'confirm' ? 'confirmed' : 'intervention_required',
      version: booking.version + 1,
    });

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
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
          <Text style={styles.muted}>Loading booking…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>Booking unavailable</Text>
          <Text accessibilityLiveRegion="polite" style={styles.muted}>
            {error || 'This record may have changed or is not assigned to your fleet.'}
          </Text>
          {error ? (
            <PressableScale accessibilityRole="button" onPress={retry}>
              <View style={styles.primaryButton}><Text style={styles.primaryButtonText}>Try again</Text></View>
            </PressableScale>
          ) : null}
          <PressableScale accessibilityRole="button" onPress={() => router.back()}>
            <View style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Back to bookings</Text></View>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <ScreenHeader onBack={() => router.back()} showBrand={false} title="Booking" />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.title}>{booking.vehicleSnapshot.displayName}</Text>
          <Text style={styles.muted}>{rangeLabel(booking.startDate, booking.endDate)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Booking summary</Text>
          <SummaryRow label="Base rental" value={formatNairaFromKobo(booking.priceSnapshot.baseRentalKobo)} />
          <SummaryRow label="MMG commission" value={formatCommission(booking.priceSnapshot.ownerCommissionBps)} />
          <SummaryRow label="Your earnings" value={formatNairaFromKobo(booking.priceSnapshot.ownerEarningsKobo)} emphasized />
        </View>

        {error ? (
          <View style={styles.errorRow}>
            <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text>
            <PressableScale accessibilityRole="button" onPress={retry}>
              <Text style={styles.retryText}>Try again</Text>
            </PressableScale>
          </View>
        ) : null}

        {pending ? <Text accessibilityLiveRegion="polite" style={styles.muted}>Checking the updated booking status…</Text> : null}

        {canOwnerRespond(booking) ? (
          <View style={styles.actions}>
            <Text style={styles.sectionTitle}>Your response</Text>
            <Text style={styles.muted}>Confirm that you can take this trip, or decline with a reason so MMG can intervene.</Text>

            <PressableScale disabled={busy} onPress={() => void act('confirm')}>
              <View style={[styles.primaryButton, busy && styles.disabled]}>
                {busy ? <ActivityIndicator color={colors.black} size="small" /> : <Text style={styles.primaryButtonText}>Confirm booking</Text>}
              </View>
            </PressableScale>

            <TextInput
              accessibilityLabel="Decline reason"
              accessibilityHint="Enter 10 to 500 characters"
              editable={!busy}
              maxLength={500}
              multiline
              onChangeText={setReason}
              placeholder="Why can you not take this trip?"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={reason}
            />
            <Text style={styles.counter}>{reason.trim().length}/500</Text>

            <PressableScale
              disabled={busy}
              onPress={() => Alert.alert(
                'Decline this booking?',
                'The reserved dates will be released and MMG will review what to do next.',
                [
                  { text: 'Keep booking', style: 'cancel' },
                  { text: 'Decline booking', style: 'destructive', onPress: () => void act('reject') },
                ],
              )}
            >
              <View style={styles.declineButton}><Text style={styles.declineButtonText}>Decline booking</Text></View>
            </PressableScale>
          </View>
        ) : (
          <Text style={styles.muted}>This booking is no longer awaiting your response.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, emphasized && styles.summaryValueEmphasized]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.md },
  center: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.lg },
  content: { gap: spacing.xl, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  counter: { color: colors.muted, fontFamily: typography.body, fontSize: 12, textAlign: 'right' },
  declineButton: { alignItems: 'center', borderColor: colors.danger, borderRadius: radii.button, borderWidth: 1, justifyContent: 'center', minHeight: 50 },
  declineButtonText: { color: colors.danger, fontFamily: typography.bodySemiBold, fontSize: 14 },
  disabled: { opacity: 0.55 },
  errorRow: { backgroundColor: 'rgba(239,68,68,0.10)', gap: spacing.sm, padding: spacing.md },
  errorText: { color: colors.danger, fontFamily: typography.body, fontSize: 13 },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  input: { borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, color: colors.ivory, fontFamily: typography.body, fontSize: 14, minHeight: 96, padding: spacing.md, textAlignVertical: 'top' },
  intro: { gap: spacing.xs },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.ivory, borderRadius: radii.button, justifyContent: 'center', minHeight: 50, paddingHorizontal: spacing.lg },
  primaryButtonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  retryText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 13 },
  safe: { backgroundColor: colors.black, flex: 1 },
  secondaryButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.button, borderWidth: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.lg },
  secondaryButtonText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 14 },
  section: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.sm, paddingTop: spacing.lg },
  sectionTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 17 },
  summaryLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 13 },
  summaryRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48 },
  summaryValue: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 14 },
  summaryValueEmphasized: { fontFamily: typography.bodySemiBold, fontSize: 16 },
  title: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 24 },
});
