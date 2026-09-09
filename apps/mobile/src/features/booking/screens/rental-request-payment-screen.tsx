import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { safeProviderError } from '@/core/errors/safe-provider-error';
import { RenterCheckoutReadiness } from '../components/renter-checkout-readiness';
import { createRentalRequestGateway } from '../data/rental-request-gateway';
import type { RenterVisibleRentalRequest } from '@mmg/contracts/rental-request';

export function RentalRequestPaymentScreen({ journeyId }: { journeyId: string }) {
  const router = useRouter();
  const gateway = useMemo(() => createRentalRequestGateway(), []);
  const [request, setRequest] = useState<RenterVisibleRentalRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);

  useEffect(() => {
    let active = true;
    gateway.getRequest(journeyId)
      .then((value) => { if (!active) return; setRequest(value); setLoading(false); })
      .catch((caught) => { if (!active) return; setError(safeProviderError(caught, 'Payment window could not be loaded.')); setLoading(false); });
    return () => { active = false; };
  }, [gateway, journeyId]);

  const release = async () => {
    if (!request || releasing) return;
    setReleasing(true);
    setError(null);
    try {
      await gateway.releasePaymentHold(request.requestId);
      router.replace('/(renter)/trips');
    } catch (caught) {
      setError(safeProviderError(caught, 'The dates could not be released. Your current booking state has not been changed.'));
      setReleasing(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}><ScreenHeader onBack={() => router.back()} title="Complete payment" /></View>
      <View style={styles.content}>
        {loading ? <View style={styles.center}><ActivityIndicator color={colors.goldStrong} /><Text style={styles.muted}>Loading your payment window…</Text></View> : null}
        {!loading && (!request || request.state !== 'ready_for_payment' || !request.intentId || !request.holdExpiresAt) ? (
          <View style={styles.center}>
            <Ionicons color={colors.muted} name="time-outline" size={30} />
            <Text style={styles.title}>Payment window unavailable</Text>
            <Text style={styles.muted}>This request is not currently approved for payment. Return to Trips for the latest status.</Text>
            <PressableScale accessibilityRole="button" onPress={() => router.replace('/(renter)/trips')}><View style={styles.button}><Text style={styles.buttonText}>View requests</Text></View></PressableScale>
          </View>
        ) : null}
        {request?.state === 'ready_for_payment' && request.intentId && request.holdExpiresAt ? (
          <>
            <View style={styles.readyCard}>
              <Text style={styles.title}>Available for you</Text>
              <Text style={styles.muted}>Complete payment within the approved 30-minute window to secure this booking.</Text>
            </View>
            <RenterCheckoutReadiness
              holdExpiresAt={request.holdExpiresAt}
              intentId={request.intentId}
              onRestartHold={() => router.replace('/(renter)/trips')}
              onViewTrips={() => router.replace('/(renter)/trips')}
            />
            <PressableScale
              accessibilityRole="button"
              disabled={releasing}
              onPress={() => Alert.alert(
                'Release these dates?',
                'No payment has been taken. The vehicle will become available for these dates again.',
                [
                  { text: 'Keep dates', style: 'cancel' },
                  { text: 'Release dates', style: 'destructive', onPress: () => void release() },
                ],
              )}
            >
              <View style={styles.releaseButton}><Text style={styles.releaseText}>{releasing ? 'Releasing…' : 'Release dates'}</Text></View>
            </PressableScale>
          </>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.lg },
  buttonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 13 },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  content: { flex: 1, paddingHorizontal: spacing.lg },
  error: { color: colors.danger, fontFamily: typography.bodyMedium, fontSize: 12, marginTop: spacing.md, textAlign: 'center' },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  readyCard: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.sm, paddingBottom: spacing.md },
  releaseButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, justifyContent: 'center', marginTop: spacing.md, minHeight: 44 },
  releaseText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 12 },
  screen: { backgroundColor: colors.black, flex: 1 },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 20, textAlign: 'center' },
});
