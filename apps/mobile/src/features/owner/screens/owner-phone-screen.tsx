import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import {
  FieldLabel,
  InlineNotice,
  MobileHeader,
  PrimaryAction,
  SectionHeading,
} from '@/components/ui/mobile-primitives';
import { useAuth } from '@/core/auth/auth-context';
import {
  createOwnerVerificationGateway,
  type PhoneConfirmationSession,
} from '../data/owner-verification-gateway';
import { isNigerianE164, normalizeNigerianPhone } from '../domain/owner-application';
import { ownerCommandErrorMessage } from '../domain/owner-errors';

export function OwnerPhoneScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [phoneInput, setPhoneInput] = useState(
    auth.user?.phoneNumber ? auth.user.phoneNumber.replace('+234', '0') : '',
  );
  const [code, setCode] = useState('');
  const [session, setSession] = useState<PhoneConfirmationSession | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const isAlreadyLinked = isNigerianE164(auth.user?.phoneNumber);
  const normalizedPhone = normalizeNigerianPhone(phoneInput);
  const isPhoneValid = Boolean(normalizedPhone);
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendCode = async () => {
    if (isWeb || !normalizedPhone || loading) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const gateway = createOwnerVerificationGateway();
      const confirmation = await gateway.requestPhoneVerification(normalizedPhone);
      setSession(confirmation);
      setCountdown(45);
      setSuccessNotice(`Code sent to ${normalizedPhone}`);
    } catch (err) {
      setErrorMessage(ownerCommandErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (isWeb || !session || code.trim().length !== 6 || loading) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const gateway = createOwnerVerificationGateway();
      await gateway.confirmPhoneVerification(session, code.trim());
      await auth.refreshUser();
      router.push('/(owner)/id' as Href);
    } catch (err) {
      setErrorMessage(ownerCommandErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <MobileHeader onBack={() => router.back()} title="Phone verification" />
        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>Verify your number</Text>
          <Text style={styles.subtitle}>We use your Nigerian number for owner account security and booking operations.</Text>
        </View>

        {isWeb ? <InlineNotice icon="phone-portrait-outline">Phone verification is available in the native app.</InlineNotice> : null}
        {errorMessage ? <InlineNotice icon="alert-circle-outline" tone="danger">{errorMessage}</InlineNotice> : null}
        {successNotice ? <InlineNotice icon="checkmark-circle-outline" tone="success">{successNotice}</InlineNotice> : null}

        {isAlreadyLinked ? (
          <View style={styles.verifiedSection}>
            <Ionicons color={colors.success} name="checkmark-circle" size={24} />
            <SectionHeading>Number verified</SectionHeading>
            <Text style={styles.verifiedPhone}>{auth.user?.phoneNumber}</Text>
            <Text style={styles.verifiedNote}>Contact MMG Concierge support if this number needs to change.</Text>
            <View style={styles.primaryArea}>
              <PrimaryAction icon="arrow-forward" label="Continue to ID" onPress={() => router.push('/(owner)/id' as Href)} />
            </View>
          </View>
        ) : !session ? (
          <View style={styles.formSection}>
            <FieldLabel>Mobile number</FieldLabel>
            <View style={styles.phoneInputRow}>
              <View style={styles.countryCode}><Text style={styles.countryCodeText}>+234</Text></View>
              <TextInput
                editable={!isWeb}
                keyboardType="phone-pad"
                onChangeText={setPhoneInput}
                placeholder="0801 234 5678"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.phoneInput]}
                value={phoneInput}
              />
            </View>
            <Text style={styles.helper}>Use the number you will keep active for owner operations.</Text>
            <View style={styles.primaryArea}>
              <PrimaryAction
                disabled={isWeb || !isPhoneValid}
                icon="arrow-forward"
                label="Send code"
                loading={loading}
                onPress={() => void handleSendCode()}
              />
            </View>
          </View>
        ) : (
          <View style={styles.formSection}>
            <FieldLabel>6-digit code</FieldLabel>
            <TextInput
              editable={!isWeb}
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.codeInput]}
              value={code}
            />
            <Text style={styles.helper}>Enter the code sent to {normalizedPhone}.</Text>
            <View style={styles.primaryArea}>
              <PrimaryAction
                disabled={isWeb || code.trim().length !== 6}
                icon="checkmark"
                label="Verify and continue"
                loading={loading}
                onPress={() => void handleVerifyCode()}
              />
            </View>
            <View style={styles.resendRow}>
              {countdown > 0 ? (
                <Text style={styles.resendMuted}>Send another code in {countdown}s</Text>
              ) : (
                <PressableScale accessibilityRole="button" onPress={() => void handleSendCode()}>
                  <Text style={styles.resendText}>Send another code</Text>
                </PressableScale>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  codeInput: {
    fontFamily: typography.bodySemiBold,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
  },
  content: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  countryCode: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 50,
    width: 62,
  },
  countryCodeText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
  },
  formSection: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  helper: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  input: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  intro: {
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  phoneInput: { flex: 1 },
  phoneInputRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  primaryArea: {
    marginTop: spacing.lg,
  },
  resendMuted: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  resendRow: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  resendText: {
    color: colors.goldStrong,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
    maxWidth: 350,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 31,
    letterSpacing: -0.55,
  },
  verifiedNote: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  verifiedPhone: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 19,
    marginTop: spacing.sm,
  },
  verifiedSection: {
    alignItems: 'flex-start',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
});
