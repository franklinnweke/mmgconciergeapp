import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
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

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const isWeb = Platform.OS === 'web';

  const handleSendCode = async () => {
    if (isWeb || !normalizedPhone || loading) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const gateway = createOwnerVerificationGateway();
      const confirmation = await gateway.requestPhoneVerification(normalizedPhone);
      setSession(confirmation);
      setCountdown(45);
      setSuccessNotice(`Verification SMS sent to ${normalizedPhone}`);
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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <PressableScale onPress={() => router.back()}>
            <View style={styles.backButton}>
              <Ionicons color={colors.ivory} name="arrow-back" size={20} />
            </View>
          </PressableScale>
          <View>
            <Text style={styles.title}>Link Nigerian Phone</Text>
          </View>
        </View>

        {isWeb && (
          <View style={styles.webBanner}>
            <Ionicons color={colors.goldStrong} name="information-circle-outline" size={18} />
            <Text style={styles.webBannerText}>
              PHONE VERIFICATION REQUIRES THE NATIVE APP
            </Text>
          </View>
        )}

        {errorMessage && (
          <View style={styles.errorBox}>
            <Ionicons color="#EF4444" name="alert-circle-outline" size={18} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {successNotice && (
          <View style={styles.noticeBox}>
            <Ionicons color={colors.goldStrong} name="checkmark-circle-outline" size={18} />
            <Text style={styles.noticeText}>{successNotice}</Text>
          </View>
        )}

        {isAlreadyLinked ? (
          <View style={styles.verifiedCard}>
            <Ionicons color={colors.goldStrong} name="shield-checkmark" size={28} />
            <View>
              <Text style={styles.verifiedTitle}>Phone Number Verified</Text>
              <Text style={styles.verifiedPhone}>{auth.user?.phoneNumber}</Text>
              <Text style={styles.verifiedNote}>
                This account already has a verified phone. Contact MMG Concierge support to change it.
              </Text>
            </View>
            <PressableScale onPress={() => router.push('/(owner)/id' as Href)} style={{ marginTop: spacing.md }}>
              <View style={styles.primaryButton}>
                <Text style={styles.primaryText}>CONTINUE TO ID UPLOAD</Text>
                <Ionicons color={colors.black} name="arrow-forward" size={18} />
              </View>
            </PressableScale>
          </View>
        ) : (
          <>
            {/* Phone Input */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Nigerian Mobile Number</Text>
              <View style={styles.phoneInputRow}>
                <View style={styles.countryPill}>
                  <Text style={styles.countryPillText}>+234</Text>
                </View>
                <TextInput
                  editable={!isWeb && !session}
                  keyboardType="phone-pad"
                  placeholder="0801 234 5678"
                  placeholderTextColor={colors.muted}
                  value={phoneInput}
                  onChangeText={setPhoneInput}
                  style={[styles.input, { flex: 1 }, isWeb && { opacity: 0.6 }]}
                />
              </View>
            </View>

            {!session ? (
              <PressableScale
                onPress={handleSendCode}
                style={[{ marginTop: spacing.lg }, (isWeb || !isPhoneValid || loading) && { opacity: 0.5 }]}
              >
                <View style={styles.primaryButton}>
                  {loading ? (
                    <ActivityIndicator color={colors.black} size="small" />
                  ) : (
                    <>
                      <Text style={styles.primaryText}>SEND VERIFICATION CODE</Text>
                      <Ionicons color={colors.black} name="send-outline" size={16} />
                    </>
                  )}
                </View>
              </PressableScale>
            ) : (
              <View style={styles.codeSection}>
                <Text style={styles.label}>Enter 6-Digit SMS Code</Text>
                <TextInput
                  editable={!isWeb}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="123456"
                  placeholderTextColor={colors.muted}
                  value={code}
                  onChangeText={setCode}
                  style={[styles.input, styles.codeInput, isWeb && { opacity: 0.6 }]}
                />

                <PressableScale
                  onPress={handleVerifyCode}
                  style={[{ marginTop: spacing.md }, (isWeb || code.trim().length !== 6 || loading) && { opacity: 0.5 }]}
                >
                  <View style={styles.primaryButton}>
                    {loading ? (
                      <ActivityIndicator color={colors.black} size="small" />
                    ) : (
                      <>
                        <Text style={styles.primaryText}>VERIFY AND CONTINUE</Text>
                        <Ionicons color={colors.black} name="checkmark-circle-outline" size={18} />
                      </>
                    )}
                  </View>
                </PressableScale>

                <View style={styles.resendRow}>
                  {countdown > 0 ? (
                    <Text style={styles.countdownText}>Resend code in {countdown}s</Text>
                  ) : (
                    <PressableScale onPress={handleSendCode}>
                      <Text style={[styles.resendText, isWeb && { opacity: 0.5 }]}>Resend SMS Code</Text>
                    </PressableScale>
                  )}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, height: 44, justifyContent: 'center', minHeight: 44, minWidth: 44, width: 44 },
  codeInput: { fontFamily: typography.bodySemiBold, fontSize: 20, letterSpacing: 6, textAlign: 'center' },
  codeSection: { marginTop: spacing.lg },
  countdownText: { color: colors.muted, fontFamily: typography.body, fontSize: 13 },
  countryPill: { alignItems: 'center', backgroundColor: colors.graphiteRaised, borderColor: colors.line, borderRadius: radii.sm, borderWidth: 1, justifyContent: 'center', paddingHorizontal: spacing.md },
  countryPillText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 14 },
  errorBox: { alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.md },
  errorText: { color: '#EF4444', flex: 1, fontFamily: typography.body, fontSize: 13 },
  fieldGroup: { marginBottom: spacing.md },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  input: { backgroundColor: colors.graphiteRaised, borderColor: colors.line, borderRadius: radii.sm, borderWidth: 1, color: colors.ivory, fontFamily: typography.body, fontSize: 14, minHeight: 48, paddingHorizontal: spacing.md },
  label: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 12, marginBottom: spacing.xxs },
  noticeBox: { alignItems: 'center', backgroundColor: 'rgba(200,157,70,0.1)', borderColor: 'rgba(200,157,70,0.25)', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.md },
  noticeText: { color: colors.goldStrong, flex: 1, fontFamily: typography.body, fontSize: 13 },
  phoneInputRow: { flexDirection: 'row', gap: spacing.xs },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 54 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14, letterSpacing: 0.5 },
  resendRow: { alignItems: 'center', marginTop: spacing.md },
  resendText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 13 },
  screen: { backgroundColor: colors.black, flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 26, letterSpacing: -0.4, marginTop: 2 },
  verifiedCard: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: spacing.lg },
  verifiedNote: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: spacing.xs },
  verifiedPhone: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 18, marginTop: 4 },
  verifiedTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15, marginTop: spacing.xs },
  webBanner: { alignItems: 'center', backgroundColor: 'rgba(200,157,70,0.12)', borderColor: colors.lineStrong, borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.sm },
  webBannerText: { color: colors.goldStrong, flex: 1, fontFamily: typography.bodySemiBold, fontSize: 11 },
});
