import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { useAuth } from '@/core/auth/auth-context';
import {
  isNigerianE164,
  normalizeNigerianPhone,
} from '@/core/auth/phone-verification-domain';
import {
  confirmPhoneVerification,
  requestPhoneVerification,
  type PhoneVerificationSession,
} from '@/core/auth/phone-verification';
import { safeProviderError } from '@/core/errors/safe-provider-error';
import { useRenterProfile } from '@/features/account/hooks/use-renter-profile';

import { RenterCheckoutProfileCompletion } from './renter-checkout-profile-completion';
import { RenterPaymentCheckout } from './renter-payment-checkout';

type RenterCheckoutReadinessProps = {
  holdExpiresAt: string;
  intentId: string;
  onRestartHold: () => void;
  onViewTrips: () => void;
};

export function RenterCheckoutReadiness({
  holdExpiresAt,
  intentId,
  onRestartHold,
  onViewTrips,
}: RenterCheckoutReadinessProps) {
  const auth = useAuth();
  const { profile, isLoading, saveProfile } = useRenterProfile();
  const [userTypedPhone, setUserTypedPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [session, setSession] = useState<PhoneVerificationSession | null>(null);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [verifiedPhoneOverride, setVerifiedPhoneOverride] = useState<string | null>(null);
  const [syncingPhone, setSyncingPhone] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncRetryVersion, setSyncRetryVersion] = useState(0);
  const attemptedSync = useRef<string | null>(null);

  const authPhone = isNigerianE164(auth.user?.phoneNumber) ? auth.user.phoneNumber : null;
  const verifiedPhone = verifiedPhoneOverride ?? authPhone;
  const phoneInput = userTypedPhone ?? (!verifiedPhone ? profile?.phone ?? '' : '');

  useEffect(() => {
    if (!verifiedPhone || !profile || profile.accountStatus !== 'active') return;
    if (profile.phone === verifiedPhone) {
      attemptedSync.current = null;
      return;
    }

    const syncKey = `${profile.profileVersion}:${verifiedPhone}:${syncRetryVersion}`;
    if (attemptedSync.current === syncKey) return;
    attemptedSync.current = syncKey;
    setSyncingPhone(true);
    setSyncError(null);

    void saveProfile({
      fullName: profile.fullName,
      phone: verifiedPhone,
      defaultDeliveryAddress: profile.defaultDeliveryAddress,
      acceptedRenterTermsVersion: profile.acceptedRenterTermsVersion,
      acceptedPrivacyNoticeVersion: profile.acceptedPrivacyNoticeVersion,
    })
      .catch((error) => {
        setSyncError(
          safeProviderError(
            error,
            'Your verified phone could not be matched to your renter profile. Try again.',
          ),
        );
      })
      .finally(() => setSyncingPhone(false));
  }, [profile, saveProfile, syncRetryVersion, verifiedPhone]);

  const sendCode = async () => {
    if (Platform.OS === 'web' || verificationBusy) return;
    const normalized = normalizeNigerianPhone(phoneInput);
    if (!normalized) {
      setVerificationMessage('Enter a valid Nigerian mobile number.');
      return;
    }

    setVerificationBusy(true);
    setVerificationMessage(null);
    try {
      const nextSession = await requestPhoneVerification(normalized);
      setSession(nextSession);
      setCode('');
      setVerificationMessage(`Verification code sent to ${normalized}.`);
    } catch (error) {
      setVerificationMessage(auth.errorMessage(error));
    } finally {
      setVerificationBusy(false);
    }
  };

  const confirmCode = async () => {
    if (!session || code.trim().length !== 6 || verificationBusy) return;
    setVerificationBusy(true);
    setVerificationMessage(null);
    try {
      await confirmPhoneVerification(session, code.trim());
      await auth.refreshUser();
      setVerifiedPhoneOverride(session.phoneE164);
      setSession(null);
      setCode('');
      setVerificationMessage(null);
    } catch (error) {
      setVerificationMessage(auth.errorMessage(error));
    } finally {
      setVerificationBusy(false);
    }
  };

  if (isLoading) {
    return <LoadingPanel title="Checking checkout details" body="MMG is confirming your renter profile before payment." />;
  }

  if (!verifiedPhone) {
    return (
      <View style={styles.panel}>
        <Ionicons color={colors.goldStrong} name="phone-portrait-outline" size={25} />
        <Text style={styles.title}>Verify your phone to pay</Text>
        <Text style={styles.body}>
          A verified Nigerian number is required for checkout and chauffeur coordination. Renters do not upload government ID.
        </Text>

        {Platform.OS === 'web' ? (
          <Text style={styles.error}>Phone verification is available in the native MMG app.</Text>
        ) : session ? (
          <>
            <TextInput
              accessibilityLabel="SMS verification code"
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={setCode}
              placeholder="6-digit code"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.codeInput]}
              value={code}
            />
            <PrimaryButton
              disabled={verificationBusy || code.trim().length !== 6}
              label={verificationBusy ? 'Verifying…' : 'Verify phone'}
              onPress={() => void confirmCode()}
            />
            <PressableScale disabled={verificationBusy} onPress={() => void sendCode()}>
              <Text style={styles.textAction}>Resend code</Text>
            </PressableScale>
          </>
        ) : (
          <>
            <TextInput
              accessibilityLabel="Nigerian mobile number"
              keyboardType="phone-pad"
              onChangeText={setUserTypedPhone}
              placeholder="0801 234 5678"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={phoneInput}
            />
            <PrimaryButton
              disabled={verificationBusy || !normalizeNigerianPhone(phoneInput)}
              label={verificationBusy ? 'Sending…' : 'Send verification code'}
              onPress={() => void sendCode()}
            />
          </>
        )}
        {verificationMessage ? <Text style={styles.helper}>{verificationMessage}</Text> : null}
      </View>
    );
  }

  if (!profile) {
    return (
      <RenterCheckoutProfileCompletion
        defaultName={auth.user?.displayName}
        verifiedPhone={verifiedPhone}
        onSubmit={async (data) => {
          await saveProfile({
            fullName: data.fullName,
            phone: verifiedPhone,
            defaultDeliveryAddress: {
              areaLabel: data.areaLabel,
              streetAddress: data.streetAddress,
              landmark: data.landmark,
            },
            acceptedRenterTermsVersion: '2026-03-01',
            acceptedPrivacyNoticeVersion: '2026-03-01',
          });
        }}
      />
    );
  }

  if (profile.accountStatus !== 'active') {
    return (
      <View style={styles.panel}>
        <Ionicons color={colors.goldStrong} name="alert-circle-outline" size={25} />
        <Text style={styles.title}>Checkout unavailable</Text>
        <Text style={styles.body}>
          This renter profile is not active. Resolve the account status before attempting payment. The current hold will expire automatically.
        </Text>
      </View>
    );
  }

  if (syncingPhone || profile.phone !== verifiedPhone) {
    if (syncError) {
      return (
        <View style={styles.panel}>
          <Ionicons color={colors.danger} name="alert-circle-outline" size={25} />
          <Text style={styles.title}>Could not prepare checkout</Text>
          <Text style={styles.error}>{syncError}</Text>
          <PrimaryButton
            label="Try again"
            onPress={() => {
              attemptedSync.current = null;
              setSyncError(null);
              setSyncRetryVersion((version) => version + 1);
            }}
          />
        </View>
      );
    }
    return <LoadingPanel title="Preparing secure checkout" body="MMG is matching your verified phone to your renter profile." />;
  }

  return (
    <RenterPaymentCheckout
      holdExpiresAt={holdExpiresAt}
      intentId={intentId}
      onRestartHold={onRestartHold}
      onViewTrips={onViewTrips}
    />
  );
}

function PrimaryButton({
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

function LoadingPanel({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.panel}>
      <ActivityIndicator color={colors.goldStrong} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  button: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', minHeight: 46, paddingHorizontal: spacing.lg },
  buttonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 13 },
  codeInput: { fontFamily: typography.bodySemiBold, fontSize: 18, letterSpacing: 5, textAlign: 'center' },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontFamily: typography.bodyMedium, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  helper: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  input: { backgroundColor: colors.graphiteRaised, borderColor: colors.lineStrong, borderRadius: radii.sm, borderWidth: 1, color: colors.ivory, fontFamily: typography.body, fontSize: 14, minHeight: 48, paddingHorizontal: spacing.md, width: '100%' },
  panel: { alignItems: 'center', backgroundColor: colors.graphite, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, gap: spacing.md, marginTop: spacing.md, padding: spacing.lg },
  textAction: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 12, paddingVertical: spacing.xs },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 18, textAlign: 'center' },
});
