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
import {
  ActivityIndicator,
  AppState,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { useAuth } from '@/core/auth/auth-context';
import {
  confirmPhoneVerification,
  isNigerianE164,
  normalizeNigerianPhone,
  requestPhoneVerification,
  type PhoneVerificationSession,
} from '@/core/auth/phone-verification';
import { safeProviderError } from '@/core/errors/safe-provider-error';
import { useRenterProfile } from '@/features/account/hooks/use-renter-profile';

import {
  createPaymentCheckoutGateway,
  PaymentCheckoutSubmissionKeys,
} from '../data/payment-checkout-gateway';
import {
  resolveRenterCheckoutState,
  type RenterCheckoutState,
} from '../domain/renter-checkout-state';

type CheckoutUiState = 'ready' | 'opening' | RenterCheckoutState;
type ProfileIssue = 'phone_unverified' | 'profile_incomplete';

type RenterPaymentCheckoutProps = {
  holdExpiresAt: string;
  intentId: string;
  onCompleteProfile: () => void;
  onRestartHold: () => void;
  onViewTrips: () => void;
};

type CallableErrorShape = {
  code?: unknown;
  details?: { code?: unknown; reason?: unknown };
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

function checkoutProfileIssue(error: unknown): ProfileIssue | null {
  const value = (error && typeof error === 'object' ? error : {}) as CallableErrorShape;
  const domainCode = String(value.details?.code ?? '').toUpperCase();
  const reason = String(value.details?.reason ?? '').toLowerCase();
  if (domainCode !== 'PROFILE_INCOMPLETE') return null;
  return reason === 'phone_unverified' ? 'phone_unverified' : 'profile_incomplete';
}

export function RenterPaymentCheckout({
  holdExpiresAt,
  intentId,
  onCompleteProfile,
  onRestartHold,
  onViewTrips,
}: RenterPaymentCheckoutProps) {
  const auth = useAuth();
  const { profile, isLoading: profileLoading, saveProfile } = useRenterProfile();
  const gateway = useMemo(() => createPaymentCheckoutGateway(), []);
  const keys = useRef(new PaymentCheckoutSubmissionKeys());
  const checkoutWasOpened = useRef(false);
  const [state, setState] = useState<CheckoutUiState>('ready');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profileIssue, setProfileIssue] = useState<ProfileIssue | null>(null);
  const [verifiedPhoneOverride, setVerifiedPhoneOverride] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationSession, setVerificationSession] = useState<PhoneVerificationSession | null>(null);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);

  const authPhone = isNigerianE164(auth.user?.phoneNumber) ? auth.user.phoneNumber : null;
  const verifiedPhone = verifiedPhoneOverride ?? authPhone;

  useEffect(() => {
    if (!phoneInput && profile?.phone && !verifiedPhone) setPhoneInput(profile.phone);
  }, [phoneInput, profile?.phone, verifiedPhone]);

  const syncVerifiedPhoneToProfile = useCallback(async (phoneE164: string): Promise<boolean> => {
    if (!profile) return false;
    if (profile.phone === phoneE164) return true;

    await saveProfile({
      fullName: profile.fullName,
      phone: phoneE164,
      defaultDeliveryAddress: profile.defaultDeliveryAddress,
      acceptedRenterTermsVersion: profile.acceptedRenterTermsVersion,
      acceptedPrivacyNoticeVersion: profile.acceptedPrivacyNoticeVersion,
    });
    return true;
  }, [profile, saveProfile]);

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
      if (nextState === 'payment_received' || nextState === 'paid_conflict') {
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

  const launchCheckout = useCallback(async () => {
    setErrorMessage(null);
    setProfileIssue(null);
    if (isExpired(holdExpiresAt)) {
      setState('expired_hold');
      return;
    }

    setState('opening');
    try {
      const initialized = await gateway.initializePayment(
        intentId,
        keys.current.forInitialization(intentId),
      );
      const authorizationUrl = initialized.result.authorizationUrl;
      assertApprovedCheckoutUrl(authorizationUrl);

      checkoutWasOpened.current = true;
      await WebBrowser.openBrowserAsync(authorizationUrl, {
        dismissButtonStyle: 'close',
        showTitle: true,
      });

      if (Platform.OS === 'ios') {
        checkoutWasOpened.current = false;
        await checkPayment();
      } else {
        setState('checking');
      }
    } catch (error) {
      checkoutWasOpened.current = false;
      const issue = checkoutProfileIssue(error);
      setState(isExpired(holdExpiresAt) ? 'expired_hold' : 'ready');
      if (issue) {
        setProfileIssue(profile ? issue : 'profile_incomplete');
        return;
      }
      setErrorMessage(
        safeProviderError(
          error,
          'Payment checkout could not be opened. No booking has been confirmed.',
        ),
      );
    }
  }, [checkPayment, gateway, holdExpiresAt, intentId, profile]);

  const openCheckout = useCallback(async () => {
    if (isExpired(holdExpiresAt)) {
      setState('expired_hold');
      return;
    }
    if (!verifiedPhone) {
      setProfileIssue('phone_unverified');
      return;
    }
    if (profileLoading) return;
    if (!profile || profile.accountStatus !== 'active') {
      setProfileIssue('profile_incomplete');
      return;
    }

    try {
      await syncVerifiedPhoneToProfile(verifiedPhone);
      await launchCheckout();
    } catch (error) {
      setProfileIssue('profile_incomplete');
      setErrorMessage(
        safeProviderError(error, 'Your verified phone could not be saved to your renter profile. Try again.'),
      );
    }
  }, [holdExpiresAt, launchCheckout, profile, profileLoading, syncVerifiedPhoneToProfile, verifiedPhone]);

  const sendVerificationCode = useCallback(async () => {
    if (Platform.OS === 'web' || verificationBusy) return;
    const normalized = normalizeNigerianPhone(phoneInput);
    if (!normalized) {
      setVerificationMessage('Enter a valid Nigerian mobile number.');
      return;
    }

    setVerificationBusy(true);
    setVerificationMessage(null);
    try {
      const session = await requestPhoneVerification(normalized);
      setVerificationSession(session);
      setVerificationCode('');
      setVerificationMessage(`Verification code sent to ${normalized}.`);
    } catch (error) {
      setVerificationMessage(auth.errorMessage(error));
    } finally {
      setVerificationBusy(false);
    }
  }, [auth, phoneInput, verificationBusy]);

  const verifyPhoneAndResume = useCallback(async () => {
    if (!verificationSession || verificationCode.trim().length !== 6 || verificationBusy) return;

    setVerificationBusy(true);
    setVerificationMessage(null);
    try {
      await confirmPhoneVerification(verificationSession, verificationCode.trim());
      await auth.refreshUser();
      const phoneE164 = verificationSession.phoneE164;
      setVerifiedPhoneOverride(phoneE164);

      if (!profile) {
        setProfileIssue('profile_incomplete');
        setVerificationMessage('Phone verified. Complete your renter profile to continue with this hold.');
        return;
      }

      await syncVerifiedPhoneToProfile(phoneE164);
      setProfileIssue(null);
      setVerificationSession(null);
      setVerificationCode('');
      await launchCheckout();
    } catch (error) {
      setVerificationMessage(auth.errorMessage(error));
    } finally {
      setVerificationBusy(false);
    }
  }, [auth, launchCheckout, profile, syncVerifiedPhoneToProfile, verificationBusy, verificationCode, verificationSession]);

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
      <StatusCard icon="time-outline" tone="warning" title="Checkout hold expired">
        <Text style={styles.bodyText}>
          Create a new hold before attempting payment again. No ride has been confirmed.
        </Text>
        <ActionButton label="Create a new hold" onPress={onRestartHold} />
      </StatusCard>
    );
  }

  if (state === 'abandoned' || state === 'failed') {
    return (
      <StatusCard icon="close-circle-outline" tone="warning" title={state === 'abandoned' ? 'Payment not completed' : 'Payment failed'}>
        <Text style={styles.bodyText}>
          The ride is not confirmed. You can try the Paystack checkout again while the hold is active.
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

  if (profileLoading) {
    return (
      <View style={styles.panel}>
        <ActivityIndicator color={colors.goldStrong} />
        <Text style={styles.panelTitle}>Checking checkout details</Text>
        <Text style={styles.bodyText}>MMG is confirming your renter profile before payment.</Text>
      </View>
    );
  }

  if (!verifiedPhone || profileIssue === 'phone_unverified') {
    return (
      <View style={styles.panel}>
        <Ionicons color={colors.goldStrong} name="phone-portrait-outline" size={25} />
        <Text style={styles.panelTitle}>Verify your phone to pay</Text>
        <Text style={styles.bodyText}>
          A verified Nigerian number is required for checkout and chauffeur coordination. No government ID is required for renters.
        </Text>
        {Platform.OS === 'web' ? (
          <Text style={styles.errorText}>Phone verification is available in the native MMG app.</Text>
        ) : verificationSession ? (
          <>
            <TextInput
              accessibilityLabel="SMS verification code"
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={setVerificationCode}
              placeholder="6-digit code"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.codeInput]}
              value={verificationCode}
            />
            <ActionButton
              disabled={verificationBusy || verificationCode.trim().length !== 6}
              label={verificationBusy ? 'Verifying…' : 'Verify and continue'}
              onPress={() => void verifyPhoneAndResume()}
            />
            <PressableScale disabled={verificationBusy} onPress={() => void sendVerificationCode()}>
              <Text style={styles.textAction}>Resend code</Text>
            </PressableScale>
          </>
        ) : (
          <>
            <TextInput
              accessibilityLabel="Nigerian mobile number"
              keyboardType="phone-pad"
              onChangeText={setPhoneInput}
              placeholder="0801 234 5678"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={phoneInput}
            />
            <ActionButton
              disabled={verificationBusy || !normalizeNigerianPhone(phoneInput)}
              label={verificationBusy ? 'Sending…' : 'Send verification code'}
              onPress={() => void sendVerificationCode()}
            />
          </>
        )}
        {verificationMessage ? <Text style={styles.helperText}>{verificationMessage}</Text> : null}
      </View>
    );
  }

  if (!profile || profile.accountStatus !== 'active' || profileIssue === 'profile_incomplete') {
    return (
      <StatusCard icon="person-circle-outline" tone="warning" title="Complete your renter details">
        <Text style={styles.bodyText}>
          Add your name and default Lagos delivery address in Account, then return here before this hold expires. Your verified phone will stay linked to this MMG account.
        </Text>
        <ActionButton label="Complete account" onPress={onCompleteProfile} />
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </StatusCard>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <Ionicons color={colors.goldStrong} name="card-outline" size={21} />
        <Text style={styles.panelTitle}>Pay securely with Paystack</Text>
      </View>
      <Text style={styles.bodyText}>
        Your held total is server-authoritative. Returning from Paystack does not confirm payment until MMG verifies it.
      </Text>
      <ActionButton label="Pay with Paystack" onPress={() => void openCheckout()} />
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
    </View>
  );
}

function ActionButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale accessibilityRole="button" disabled={disabled} onPress={onPress} style={disabled ? styles.disabled : undefined}>
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
  codeInput: {
    fontFamily: typography.bodySemiBold,
    fontSize: 18,
    letterSpacing: 5,
    textAlign: 'center',
  },
  disabled: { opacity: 0.5 },
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
  helperText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  input: {
    backgroundColor: colors.graphiteRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 14,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    width: '100%',
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
  textAction: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: 12,
    paddingVertical: spacing.xs,
  },
});