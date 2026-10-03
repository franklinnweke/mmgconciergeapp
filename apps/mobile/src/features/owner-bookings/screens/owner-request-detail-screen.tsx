import { colors, radii, spacing, typography } from '@mmg/brand';
import type { OwnerVisibleRentalRequest } from '@mmg/contracts/rental-request';
import { formatNairaFromKobo } from '@mmg/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { addDaysToDateOnly, formatLagosDateOnly } from '@/features/discovery/data/lagos-destinations';
import { ownerCommandErrorMessage } from '@/features/owner/domain/owner-errors';

import { createOwnerRentalRequestGateway } from '../data/owner-rental-request-gateway';
import {
  canOwnerRespondToRequest,
  isOwnerDeclineReasonValid,
  ownerRequestStateCopy,
} from '../domain/owner-rental-request';

function rangeLabel(startDate: string, endDate: string) {
  const lastRentalDate = addDaysToDateOnly(endDate, -1);
  if (lastRentalDate === startDate) return formatLagosDateOnly(startDate);
  return `${formatLagosDateOnly(startDate)} to ${formatLagosDateOnly(lastRentalDate)}`;
}

export function OwnerRequestDetailScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const router = useRouter();
  const gateway = useMemo(() => createOwnerRentalRequestGateway(), []);
  const [request, setRequest] = useState<OwnerVisibleRentalRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!requestId) return;
    try {
      const listed = await gateway.listRequests();
      setRequest(listed.requests.find((item) => item.requestId === requestId) ?? null);
      setError(null);
    } catch (caught) {
      setError(ownerCommandErrorMessage(caught));
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [gateway, requestId]);

  useEffect(() => {
    let active = true;
    if (!requestId) return undefined;
    void gateway.listRequests()
      .then((listed) => {
        if (!active) return;
        setRequest(listed.requests.find((item) => item.requestId === requestId) ?? null);
        setError(null);
        setLoading(false);
      })
      .catch((caught) => {
        if (!active) return;
        setError(ownerCommandErrorMessage(caught));
        setRequest(null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [gateway, requestId]);

  const act = async (kind: 'approve' | 'decline') => {
    if (!request || busy) return;
    if (kind === 'decline' && !isOwnerDeclineReasonValid(reason)) {
      setError('Add a decline note of at least 3 characters, or leave it blank.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (kind === 'approve') {
        await gateway.approve(request.requestId, request.version);
      } else {
        await gateway.decline(request.requestId, request.version, reason.trim() || undefined);
      }
      Alert.alert('Request updated', kind === 'approve'
        ? 'The request is approved. MMG will contact the renter before payment is opened.'
        : 'The request was declined. No payment was taken.');
      await load();
    } catch (caught) {
      setError(ownerCommandErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
          <Text style={styles.muted}>Loading request…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!request) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>Request unavailable</Text>
          <Text accessibilityLiveRegion="polite" style={styles.muted}>
            {error || 'This request may have changed or is not assigned to your fleet.'}
          </Text>
          <PressableScale accessibilityRole="button" onPress={() => router.back()}>
            <View style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Back to bookings</Text></View>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  const copy = ownerRequestStateCopy(request.state);
  const price = request.authoritativePriceSnapshot ?? request.estimatedPriceSnapshot;
  const canRespond = canOwnerRespondToRequest(request);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <ScreenHeader onBack={() => router.back()} showBrand={false} title="Request" />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.title}>{request.vehicleSnapshot.displayName}</Text>
          <Text style={styles.muted}>{rangeLabel(request.startDate, request.endDate)} · {request.serviceAreaLabel}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{copy.label}</Text>
          <Text style={styles.muted}>{copy.body}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Estimated owner earnings</Text>
          <Text style={styles.title}>{formatNairaFromKobo(price.ownerEarningsKobo)}</Text>
          <Text style={styles.muted}>Renter total {formatNairaFromKobo(price.renterTotalKobo)} · preview until payment opens</Text>
        </View>

        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}

        {canRespond ? (
          <>
            <TextInput
              accessibilityLabel="Decline reason"
              multiline
              onChangeText={setReason}
              placeholder="Decline note (optional)"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={reason}
            />
            <PressableScale disabled={busy} onPress={() => void act('approve')}>
              <View style={[styles.primaryButton, busy && styles.disabled]}>
                {busy ? <ActivityIndicator color={colors.black} /> : <Text style={styles.primaryButtonText}>Accept request</Text>}
              </View>
            </PressableScale>
            <PressableScale disabled={busy} onPress={() => void act('decline')}>
              <View style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Decline request</Text>
              </View>
            </PressableScale>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.lg },
  content: { gap: spacing.lg, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  disabled: { opacity: 0.6 },
  error: { color: colors.danger, fontFamily: typography.body, fontSize: 13 },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  input: { borderColor: colors.line, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, color: colors.ivory, fontFamily: typography.body, fontSize: 14, minHeight: 88, padding: spacing.md, textAlignVertical: 'top' },
  intro: { gap: 4 },
  label: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15 },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.button, justifyContent: 'center', minHeight: 52 },
  primaryButtonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  safe: { backgroundColor: colors.black, flex: 1 },
  secondaryButton: { alignItems: 'center', borderColor: colors.line, borderRadius: radii.button, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 48 },
  secondaryButtonText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13 },
  section: { gap: spacing.xs },
  title: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 22 },
});
