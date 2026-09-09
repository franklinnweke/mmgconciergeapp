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
import { ActivityIndicator, AppState, Platform, StyleSheet, Text, View } from 'react-native';

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

type RenterPaymentCheckoutProps = {
  holdExpiresAt: string;
  intentId: string;
  mode?: PaymentCheckoutMode;
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
  onRestartHold,
  onViewTrips,
}: RenterPaymentCheckoutProps) {
  const gateway = useMemo(() => createPaymentCheckoutGateway(), []);
  const keys = useRef(new PaymentCheckoutSubmissionKeys());
  const checkoutWasOpened = useRef(false);
  const [state, setState] = useState<CheckoutUiState>('ready');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkPayment = useCallback(async () => {
    setErrorMessage(null);
    setState('checking');
    try {
      const reconciliation = await gateway.reconcilePayment(
        intentId,
        keys.current.forReconciliation(),
      );
      const nextState = resolveRenterCheckoutState(reconciliation, { holdExpiresAt });
      setState(nextState);
      if (
        nextState === 'payment_received' ||
        nextState === 'booking_confirmed' ||
        nextState === 'paid_conflict'
      ) {
        keys.current.reset(intentId);
      }
    } catch (error) {
      setState('checking');
      setErrorMessage(
        safeProviderError(
          error,
          'We could not refresh the payment status. Do not start another payment. Try checking again.',
        ),
      );
    }
  }, [gateway, holdExpiresAt, intentId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' || !checkoutWasOpened.current) return;
      checkoutWasOpened.current = false;
      void checkPayment();
    });
    return () => subscription.remove();
  }, [checkPayment]);

  const openCheckout = useCallback(async () => {
    setErrorMessage(null);
    if (isExpired(holdExpiresAt)) {
      setState('expired_hold');
      return;
    }

    setState('opening');
    try {
      const initialized = await gateway.initializePayment(
        intentId,
        keys.current.forInitialization(intentId),
        mode,
      );
      const authorizationUrl = initialized.result.authorizationUrl;
      assertApprovedCheckoutUrl(authorizationUrl);

      checkoutWasOpened.current = true;
      await WebBrowser.openBrowserAsync(authorizationUrl, {
        dismissButtonStyle: 'close',
        showTitle: true,
      });

      // iOS resolves when the browser closes. Android may resolve immediately,
      // so the AppState listener handles the foreground return there.
      if (Platform.OS === 'ios') {
        checkoutWasOpened.current = false;
        await checkPayment();
      } else {
        setState('checking');
      }
    } catch (error) {
      checkoutWasOpened.current = false;
      setState(isExpired(holdExpiresAt) ? 'expired_hold' : 'ready');
      setErrorMessage(
        safeProviderError(
          error,
          'Payment checkout could not be opened. No booking has been confirmed.',
        ),
      );
    }
  }, [checkPayment, gateway, holdExpiresAt, intentId, mode]);

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
            ? 'The 30-minute payment window ended. Dates were released and no charge was taken.'
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
            ? 'Complete payment in the Paystack window, then return to MMG.'
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
        <Text style={styles.panelTitle}>Pay securely with Paystack</Text>
      </View>
      <Text style={styles.bodyText}>
        {mode === 'request_first'
          ? 'Complete payment within 30 minutes. Returning from Paystack does not confirm the booking until MMG verifies it.'
          : 'Your held total is server-authoritative. Returning from Paystack does not confirm payment until MMG verifies it.'}
      </Text>
      <ActionButton label="Pay with Paystack" onPress={() => void openCheckout()} />
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
    </View>
  );
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" onPress={onPress}>
      <View style={styles.button}>
        <Text style={styles.buttonText}>{label}</Text>
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
    borderRadius: radii.pill,
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
});