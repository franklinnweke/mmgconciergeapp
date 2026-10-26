import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import * as WebBrowser from 'expo-web-browser';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { safeProviderError } from '@/core/errors/safe-provider-error';

import {
  createPaymentCheckoutGateway,
  PaymentCheckoutSubmissionKeys,
} from '../data/payment-checkout-gateway';
import type { PaymentCheckoutMode } from '../data/payment-checkout-gateway-core';
import {
  resolveRenterCheckoutState,
  type RenterCheckoutState,
} from '../domain/renter-checkout-state';

type CheckoutUiState = 'ready' | 'opening' | RenterCheckoutState;

const PAYMENT_CALLBACK_URL = 'mmgconcierge://checkout/complete';

type RenterPaymentCheckoutProps = {
  holdExpiresAt: string;
  intentId: string;
  mode?: PaymentCheckoutMode;
  onReleaseDates?: () => Promise<void>;
  onRestartHold: () => void;
  onViewTrips: () => void;
};

function isExpired(holdExpiresAt: string): boolean {
  const parsed = Date.parse(holdExpiresAt);
  return Number.isFinite(parsed) && parsed <= Date.now();
}

function assertApprovedCheckoutUrl(value: string): void {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'checkout.paystack.com') {
    throw new Error('Payment checkout could not be opened safely.');
  }
}

export function RenterPaymentCheckout({
  holdExpiresAt,
  intentId,
  mode = 'pay_first',
  onReleaseDates,
  onRestartHold,
  onViewTrips,
}: RenterPaymentCheckoutProps) {
  const gateway = useMemo(() => createPaymentCheckoutGateway(), []);
  const keys = useRef(new PaymentCheckoutSubmissionKeys());
  const checkoutWasOpened = useRef(false);
  const hasAutoReturned = useRef(false);
  const [state, setState] = useState<CheckoutUiState>('checking');
  const checking = useRef(false);
  const opening = useRef(false);
  const mounted = useRef(true);
  const initialCheck = useRef<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  const [releasingDates, setReleasingDates] = useState(false);

  const checkPayment = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    setErrorMessage(null);
    setState('checking');
    try {
      const reconciliation = await gateway.reconcilePayment(
        intentId,
        keys.current.forReconciliation(),
      );
      if (!mounted.current) return;
      const nextState = resolveRenterCheckoutState(reconciliation, { holdExpiresAt });
      setState(nextState);

      if (
        nextState === 'payment_received' ||
        nextState === 'booking_confirmed' ||
        nextState === 'paid_conflict'
      ) {
        keys.current.reset(intentId);
      }

      if (
        mode === 'request_first' &&
        (nextState === 'booking_confirmed' || nextState === 'payment_received') &&
        !hasAutoReturned.current
      ) {
        hasAutoReturned.current = true;
        onViewTrips();
      }
    } catch (error) {
      if (!mounted.current) return;
      const value = error as { code?: unknown; details?: { code?: unknown } } | null;
      const code = String(value?.details?.code ?? value?.code ?? '').split('/').pop()?.toLowerCase().replaceAll('_', '-');
      // An authenticated, intent-scoped NOT_FOUND means initialization has not
      // created a payment. Network/unknown errors never unlock a fresh charge.
      if (code === 'not-found') {
        setState(isExpired(holdExpiresAt) ? 'expired_hold' : 'ready');
        return;
      }
      setState('checking');
      setErrorMessage(
        safeProviderError(
          error,
          'We could not refresh the payment status. Do not start another payment. Try checking again.',
        ),
      );
    } finally {
      checking.current = false;
    }
  }, [gateway, holdExpiresAt, intentId, mode, onViewTrips]);

  useEffect(() => {
    mounted.current = true;
    // Includes cold launch/process death: recover by the trusted intent already
    // present in Trips, not a browser callback or persisted local success flag.
    if (initialCheck.current !== intentId) {
      initialCheck.current = intentId;
      void checkPayment();
    }
    return () => { mounted.current = false; };
  }, [checkPayment, intentId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' || !checkoutWasOpened.current) return;
      checkoutWasOpened.current = false;
      void checkPayment();
    });
    return () => subscription.remove();
  }, [checkPayment]);

  const openCheckout = useCallback(async () => {
    if (opening.current || checking.current) return;
    opening.current = true;
    setErrorMessage(null);
    hasAutoReturned.current = false;
    if (isExpired(holdExpiresAt)) {
      setState('expired_hold');
      opening.current = false;
      return;
    }

    setState('opening');
    try {
      const initialized = await gateway.initializePayment(
        intentId,
        keys.current.forInitialization(intentId),
        mode,
      );
      if (!mounted.current) return;
      const authorizationUrl = initialized.result.authorizationUrl;
      assertApprovedCheckoutUrl(authorizationUrl);

      checkoutWasOpened.current = true;
      await WebBrowser.openAuthSessionAsync(authorizationUrl, PAYMENT_CALLBACK_URL, {
        dismissButtonStyle: 'close',
        showTitle: true,
      });
      if (!mounted.current) return;

      // The callback only returns control to MMG. It is not payment proof.
      // AppState may have reconciled first on some devices, so avoid a second
      // request when that foreground fallback already consumed this checkout.
      if (checkoutWasOpened.current) {
        checkoutWasOpened.current = false;
        await checkPayment();
      }
    } catch (error) {
      if (!mounted.current) return;
      checkoutWasOpened.current = false;
      // A lost response may still have created a provider transaction. Require
      // reconciliation instead of suggesting another payment immediately.
      setState('checking');
      setErrorMessage(
        safeProviderError(
          error,
          'Payment checkout could not be opened. No booking has been confirmed.',
        ),
      );
    } finally {
      opening.current = false;
    }
  }, [checkPayment, gateway, holdExpiresAt, intentId, mode]);

  const releaseDates = useCallback(async () => {
    if (!onReleaseDates || releasingDates) return;
    setErrorMessage(null);
    setReleasingDates(true);
    try {
      await onReleaseDates();
    } catch (error) {
      setErrorMessage(
        safeProviderError(
          error,
          'Dates could not be released. Payment may have started; refresh this request before trying again.',
        ),
      );
      setReleasingDates(false);
    }
  }, [onReleaseDates, releasingDates]);

  if (state === 'booking_confirmed') {
    return (
      <StatusCard icon="checkmark-circle" tone="success" title="Payment verified — booking secured">
        <Text style={styles.bodyText}>
          Your payment was verified and the chauffeur booking is confirmed.
        </Text>
        <ActionButton label="View trips" onPress={onViewTrips} />
      </StatusCard>
    );
  }

  if (state === 'payment_received') {
    return (
      <StatusCard icon="checkmark-circle" tone="success" title="Payment received — confirming your ride">
        <Text style={styles.bodyText}>
          Your payment was verified by MMG. The owner still needs to confirm the ride.
        </Text>
        <ActionButton label="View trips" onPress={onViewTrips} />
      </StatusCard>
    );
  }

  if (state === 'paid_conflict') {
    return (
      <StatusCard icon="alert-circle" tone="warning" title="Payment received, dates need attention">
        <Text style={styles.bodyText}>
          Your payment was verified, but those dates are no longer available. MMG support will contact you to resolve the booking manually.
        </Text>
        <ActionButton label="View trips" onPress={onViewTrips} />
      </StatusCard>
    );
  }

  if (state === 'expired_hold') {
    return (
      <StatusCard icon="time-outline" tone="warning" title={mode === 'request_first' ? 'Payment window expired' : 'Checkout hold expired'}>
        <Text style={styles.bodyText}>
          {mode === 'request_first'
            ? 'The 30-minute payment window ended. Return to Trips for the latest status.'
            : 'Create a new hold before attempting payment again. No ride has been confirmed.'}
        </Text>
        <ActionButton
          label={mode === 'request_first' ? 'View trips' : 'Create a new hold'}
          onPress={mode === 'request_first' ? onViewTrips : onRestartHold}
        />
      </StatusCard>
    );
  }

  if (state === 'abandoned' || state === 'failed') {
    return (
      <StatusCard icon="close-circle-outline" tone="warning" title={state === 'abandoned' ? 'Payment not completed' : 'Payment failed'}>
        <Text style={styles.bodyText}>
          The ride is not confirmed. You can try Paystack again while the payment window is still open.
        </Text>
        <ActionButton label="Try payment again" onPress={() => void openCheckout()} />
      </StatusCard>
    );
  }

  if (state === 'opening' || state === 'checking' || state === 'pending') {
    return (
      <View style={styles.panel}>
        <ActivityIndicator color={colors.goldStrong} />
        <Text style={styles.panelTitle}>
          {state === 'opening' ? 'Opening secure checkout' : 'Checking payment'}
        </Text>
        <Text style={styles.bodyText}>
          {state === 'opening'
            ? 'Complete payment in Paystack. MMG will return here automatically, then verify the transaction.'
            : 'MMG will only show payment received after the server verifies the Paystack transaction.'}
        </Text>
        {state !== 'opening' ? (
          <ActionButton label="Check payment status" onPress={() => void checkPayment()} />
        ) : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <Ionicons color={colors.goldStrong} name="card-outline" size={21} />
        <Text style={styles.panelTitle}>Payment ready</Text>
      </View>
      <Text style={styles.bodyText}>
        {mode === 'request_first'
          ? 'Complete payment within 30 minutes to reserve your vehicle. MMG confirms the booking only after the server verifies Paystack.'
          : 'Your held total is server-authoritative. MMG confirms payment only after server verification.'}
      </Text>
      <ActionButton label="Pay securely" onPress={() => void openCheckout()} />
      {mode === 'request_first' && onReleaseDates ? (
        confirmingRelease ? (
          <View style={styles.releaseConfirmation}>
            <Text style={styles.releaseTitle}>Release these dates?</Text>
            <Text style={styles.releaseBody}>
              This closes the payment window and makes the dates available again. No payment has been taken.
            </Text>
            <View style={styles.releaseActions}>
              <SecondaryActionButton
                disabled={releasingDates}
                label="Keep payment window"
                onPress={() => setConfirmingRelease(false)}
              />
              <SecondaryActionButton
                destructive
                disabled={releasingDates}
                label={releasingDates ? 'Releasing dates…' : 'Release dates'}
                onPress={() => void releaseDates()}
              />
            </View>
          </View>
        ) : (
          <SecondaryActionButton label="Release dates" onPress={() => setConfirmingRelease(true)} />
        )
      ) : null}
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
    </View>
  );
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale accessibilityLabel={label} accessibilityRole="button" onPress={onPress}>
      <View style={styles.button}>
        <Text style={styles.buttonText}>{label}</Text>
      </View>
    </PressableScale>
  );
}

function SecondaryActionButton({
  destructive = false,
  disabled = false,
  label,
  onPress,
}: {
  destructive?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.secondaryActionWrapper}
    >
      <View style={[styles.secondaryButton, destructive && styles.secondaryButtonDestructive, disabled && styles.secondaryButtonDisabled]}>
        <Text style={[styles.secondaryButtonText, destructive && styles.secondaryButtonTextDestructive]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

function StatusCard({
  children,
  icon,
  title,
  tone,
}: {
  children: ReactNode;
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  tone: 'success' | 'warning';
}) {
  const toneColor = tone === 'success' ? colors.success : colors.goldStrong;
  return (
    <View accessibilityLiveRegion="polite" style={[styles.panel, { borderColor: toneColor }]}>
      <Ionicons color={toneColor} name={icon} size={26} />
      <Text style={styles.panelTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.button,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  buttonText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  errorText: {
    color: colors.danger,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  panel: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  panelTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 18,
    textAlign: 'center',
  },
  releaseActions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  releaseBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'left',
  },
  releaseConfirmation: {
    alignSelf: 'stretch',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
  },
  releaseTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  secondaryActionWrapper: {
    minHeight: 44,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.button,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonDestructive: {
    borderColor: 'rgba(209,133,120,.5)',
  },
  secondaryButtonDisabled: {
    opacity: 0.58,
  },
  secondaryButtonText: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 12,
  },
  secondaryButtonTextDestructive: {
    color: colors.danger,
  },
});
