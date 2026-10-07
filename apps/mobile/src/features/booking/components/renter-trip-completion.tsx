import { colors, radii, spacing, typography } from '@mmg/brand';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '@/components/pressable-scale';
import { safeProviderError } from '@/core/errors/safe-provider-error';
import { createRenterCompletionGateway, type RenterCompletionGateway } from '../data/renter-completion-gateway';

export function RenterTripCompletion({ bookingId, disabled, gateway, onCompleted }: {
  bookingId: string;
  disabled: boolean;
  gateway?: RenterCompletionGateway;
  onCompleted(): Promise<void>;
}) {
  const service = useMemo(() => gateway ?? createRenterCompletionGateway(), [gateway]);
  const inFlight = useRef(false);
  const completionVerified = useRef(false);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function confirm() {
    if (disabled || inFlight.current || completionVerified.current || !mounted.current) return;
    inFlight.current = true;
    setPending(true);
    setNotice(null);
    try {
      await service.confirmCompletion(bookingId);
      if (!mounted.current) return;
      completionVerified.current = true;
      setCompleted(true);
      setNotice('Trip completed. It will remain in your past trips.');
      try { await onCompleted(); }
      catch { if (mounted.current) setNotice('Trip completed. Refresh Trips to see the latest status.'); }
    } catch (error) {
      if (mounted.current) setNotice(safeProviderError(error, 'Completion could not be verified. Refresh Trips and try again.'));
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <View style={styles.section}>
      {!completed ? (
        <PressableScale accessibilityRole="button" accessibilityLabel="Confirm trip ended"
          accessibilityState={{ disabled: disabled || pending, busy: pending }}
          disabled={disabled || pending} style={[styles.button, (disabled || pending) && styles.disabled]}
          onPress={() => Alert.alert('Has your trip ended?', 'Confirm only after your chauffeur service is complete. This closes the trip; it does not cancel it or request a refund.', [
            { text: 'Not yet', style: 'cancel' },
            { text: 'Confirm trip ended', onPress: () => void confirm() },
          ])}>
          <Text style={styles.label}>{pending ? 'Confirming…' : 'Confirm trip ended'}</Text>
        </PressableScale>
      ) : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  section: { marginTop: spacing.lg },
  button: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.button, paddingHorizontal: spacing.lg },
  disabled: { opacity: 0.6 },
  label: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  notice: { color: colors.ivory, fontFamily: typography.body, fontSize: 13, marginTop: spacing.sm },
});
