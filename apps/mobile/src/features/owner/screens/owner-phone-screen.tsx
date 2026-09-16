import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { type OwnerVisibleProfile } from '@mmg/contracts';
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
import { ScreenHeader } from '@/components/screen-header';
import { useAuth } from '@/core/auth/auth-context';
import {
  createOwnerVerificationGateway,
  type PhoneConfirmationSession,
} from '../data/owner-verification-gateway';
import { createOwnerVerificationRepository } from '../data/owner-verification-repository';
import {
  hasCurrentOwnerAgreements,
  isNigerianE164,
  isOwnerApplicationEditable,
  normalizeNigerianPhone,
} from '../domain/owner-application';
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
  const [profile, setProfile] = useState<OwnerVisibleProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(Boolean(auth.user?.uid));
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  useEffect(() => {
    const ownerId = auth.user?.uid;
    if (!ownerId) return;

    const repository = createOwnerVerificationRepository();
    const unsubscribe = repository.subscribe(
      ownerId,
      (updatedProfile) => {
        setProfile(updatedProfile);
        setLoadingProfile(false);
      },
      () => setLoadingProfile(false),
    );

    return () => unsubscribe();
  }, [auth.user?.uid]);

  const emailVerified = Boolean(auth.user?.emailVerified);
  const agreementsCurrent = hasCurrentOwnerAgreements(profile);
  const identityComplete = Boolean(
    profile?.legalName &&
      profile?.address?.line1 &&
      profile?.address?.areaLabel &&
      agreementsCurrent,
  );
  const prerequisitesMet = emailVerified && identityComplete;
  const applicationIsEditable = isOwnerApplicationEditable(profile?.verificationStatus);
  const isAlreadyLinked = isNigerianE164(auth.user?.phoneNumber);
  const normalizedPhone = normalizeNigerianPhone(phoneInput);
  const isPhoneValid = Boolean(normalizedPhone);
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendCode = async () => {
    if (isWeb || !normalizedPhone || loading) return;
    if (!applicationIsEditable) {
      setErrorMessage('This owner application is no longer editable. Return to your Owner Desk.');
      return;
    }
    if (!prerequisitesMet) {
      setErrorMessage(
        !emailVerified
          ? 'Verify your email address before linking your phone number.'
          : !agreementsCurrent
            ? 'Review and accept current owner agreements before linking your phone number.'
            : 'Complete your owner identity and accept terms before linking your phone number.',
      );
      return;
    }

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
    if (!applicationIsEditable) {
      setErrorMessage('This owner application is no longer editable. Return to your Owner Desk.');
      return;
    }

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
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <ScreenHeader onBack={() => router.back()} showBrand={false} title="Nigerian phone" />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {isWeb ? (
          <View style={styles.webBanner}>
            <Ionicons color={colors.goldStrong} name="information-circle-outline" size={18} />
            <Text style={styles.webBannerText}>PHONE VERIFICATION REQUIRES THE NATIVE APP</Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Ionicons color={colors.danger} name="alert-circle-outline" size={18} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {successNotice ? (
          <View style={styles.noticeBox}>
            <Ionicons color={colors.goldStrong} name="checkmark-circle-outline" size={18} />
            <Text style={styles.noticeText}>{successNotice}</Text>
          </View>
        ) : null}

        {loadingProfile ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.goldStrong} size="small" />
            <Text style={styles.loadingText}>Checking verification status…</Text>
          </View>
        ) : !applicationIsEditable ? (
          <View style={styles.prerequisiteCard}>
            <View style={styles.prerequisiteHeader}>
              <Ionicons color={colors.goldStrong} name="information-circle-outline" size={22} />
              <Text style={styles.prerequisiteTitle}>Application status managed by MMG</Text>
            </View>
            <Text style={styles.prerequisiteBody}>
              Your owner application is no longer editable. Return to your Owner Desk to see its current status.
            </Text>
            <PressableScale onPress={() => router.replace('/(owner)' as Href)} style={styles.cardAction}>
              <View style={styles.prerequisiteButton}>
                <Text style={styles.prerequisiteButtonText}>Return to Owner Desk</Text>
              </View>
            </PressableScale>
          </View>
        ) : !prerequisitesMet ? (
          <View style={styles.prerequisiteCard}>
            <View style={styles.prerequisiteHeader}>
              <Ionicons color={colors.goldStrong} name="lock-closed-outline" size={22} />
              <Text style={styles.prerequisiteTitle}>Owner identity required</Text>
            </View>
            <Text style={styles.prerequisiteBody}>
              {!emailVerified
                ? 'Verify your email address before linking your phone number.'
                : !agreementsCurrent
                  ? 'Review and accept current owner agreements before linking your phone number.'
                  : 'Complete your legal name, Lagos address and platform terms before verifying your phone number.'}
            </Text>
            <PressableScale
              onPress={() => {
                if (!emailVerified) router.push('/' as Href);
                else router.push('/(owner)/identity' as Href);
              }}
              style={styles.cardAction}
            >
              <View style={styles.prerequisiteButton}>
                <Text style={styles.prerequisiteButtonText}>
                  {!emailVerified ? 'Verify email' : 'Complete owner identity'}
                </Text>
              </View>
            </PressableScale>
          </View>
        ) : isAlreadyLinked ? (
          <View style={styles.verifiedCard}>
            <Ionicons color={colors.goldStrong} name="shield-checkmark" size={28} />
            <Text style={styles.verifiedTitle}>Phone number verified</Text>
            <Text style={styles.verifiedPhone}>{auth.user?.phoneNumber}</Text>
            <Text style={styles.verifiedNote}>
              Contact MMG Concierge support if this number needs to change.
            </Text>
            <PressableScale onPress={() => router.push('/(owner)/id' as Href)} style={styles.cardAction}>
              <View style={styles.primaryButton}>
                <Text style={styles.primaryText}>Continue to ID upload</Text>
              </View>
            </PressableScale>
          </View>
        ) : (
          <>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Nigerian Mobile Number</Text>
              <View style={styles.phoneInputRow}>
                <View style={styles.countryPill}>
                  <Text style={styles.countryPillText}>+234</Text>
                </View>
                <TextInput
                  editable={!isWeb && !session}
                  keyboardType="phone-pad"
                  onChangeText={setPhoneInput}
                  placeholder="0801 234 5678"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, styles.phoneInput, isWeb && styles.webDisabled]}
                  value={phoneInput}
                />
              </View>
            </View>

            {!session ? (
              <PressableScale
                onPress={handleSendCode}
                style={[styles.primaryAction, (isWeb || !isPhoneValid || loading) && styles.disabledAction]}
              >
                <View style={styles.primaryButton}>
                  {loading ? (
                    <ActivityIndicator color={colors.black} size="small" />
                  ) : (
                    <Text style={styles.primaryText}>Send verification code</Text>
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
                  onChangeText={setCode}
                  placeholder="123456"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, styles.codeInput, isWeb && styles.webDisabled]}
                  value={code}
                />

                <PressableScale
                  onPress={handleVerifyCode}
                  style={[styles.verifyAction, (isWeb || code.trim().length !== 6 || loading) && styles.disabledAction]}
                >
                  <View style={styles.primaryButton}>
                    {loading ? (
                      <ActivityIndicator color={colors.black} size="small" />
                    ) : (
                      <Text style={styles.primaryText}>Verify and continue</Text>
                    )}
                  </View>
                </PressableScale>

                <View style={styles.resendRow}>
                  {countdown > 0 ? (
                    <Text style={styles.countdownText}>Resend code in {countdown}s</Text>
                  ) : (
                    <PressableScale onPress={handleSendCode}>
                      <Text style={[styles.resendText, isWeb && styles.webDisabled]}>Resend SMS Code</Text>
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
  cardAction: { marginTop: spacing.md },
  codeInput: { fontFamily: typography.bodySemiBold, fontSize: 20, letterSpacing: 6, textAlign: 'center' },
  codeSection: { marginTop: spacing.lg },
  countdownText: { color: colors.muted, fontFamily: typography.body, fontSize: 13 },
  countryPill: { alignItems: 'center', backgroundColor: colors.graphiteRaised, borderColor: colors.line, borderRadius: radii.sm, borderWidth: 1, justifyContent: 'center', paddingHorizontal: spacing.md },
  countryPillText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 14 },
  disabledAction: { opacity: 0.5 },
  errorBox: { alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.md },
  errorText: { color: colors.danger, flex: 1, fontFamily: typography.body, fontSize: 13 },
  fieldGroup: { marginBottom: spacing.md },
  header: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  input: { backgroundColor: colors.graphiteRaised, borderColor: colors.line, borderRadius: radii.sm, borderWidth: 1, color: colors.ivory, fontFamily: typography.body, fontSize: 14, minHeight: 48, paddingHorizontal: spacing.md },
  label: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 12, marginBottom: spacing.xxs },
  loadingBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  loadingText: { color: colors.silver, fontFamily: typography.body, fontSize: 14 },
  noticeBox: { alignItems: 'center', backgroundColor: 'rgba(200,157,70,0.1)', borderColor: 'rgba(200,157,70,0.25)', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.md },
  noticeText: { color: colors.goldStrong, flex: 1, fontFamily: typography.body, fontSize: 13 },
  phoneInput: { flex: 1 },
  phoneInputRow: { flexDirection: 'row', gap: spacing.xs },
  primaryAction: { marginTop: spacing.lg },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', minHeight: 54 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  prerequisiteBody: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  prerequisiteButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', minHeight: 48 },
  prerequisiteButtonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 13 },
  prerequisiteCard: { backgroundColor: colors.graphiteRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, padding: spacing.lg },
  prerequisiteHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  prerequisiteTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 16 },
  resendRow: { alignItems: 'center', marginTop: spacing.md },
  resendText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 13 },
  screen: { backgroundColor: colors.black, flex: 1 },
  scroll: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  verifiedCard: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: spacing.lg },
  verifiedNote: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: spacing.xs },
  verifiedPhone: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 18, marginTop: 4 },
  verifiedTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15, marginTop: spacing.xs },
  verifyAction: { marginTop: spacing.md },
  webBanner: { alignItems: 'center', backgroundColor: 'rgba(200,157,70,0.12)', borderColor: colors.lineStrong, borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.sm },
  webBannerText: { color: colors.goldStrong, flex: 1, fontFamily: typography.bodySemiBold, fontSize: 11 },
  webDisabled: { opacity: 0.6 },
});
