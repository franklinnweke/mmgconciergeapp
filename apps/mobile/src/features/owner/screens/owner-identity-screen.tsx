import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  LAGOS_AREA_LABELS,
  type CompleteOwnerProfileCommand,
  type LagosAreaLabel,
  type OwnerVisibleProfile,
} from '@mmg/contracts';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
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
  COMMISSION_TERMS_SUMMARY,
  OWNER_TERMS_SUMMARY,
  PRIVACY_NOTICE_SUMMARY,
} from '../content/owner-terms';
import { createOwnerVerificationGateway } from '../data/owner-verification-gateway';
import { createOwnerVerificationRepository } from '../data/owner-verification-repository';
import { isNigerianE164, isOwnerApplicationEditable } from '../domain/owner-application';
import { createOwnerIdentityFormSeed } from '../domain/owner-identity-form-seed';
import { ownerCommandErrorMessage } from '../domain/owner-errors';

export function OwnerIdentityScreen() {
  const auth = useAuth();
  const router = useRouter();
  const hydratedOwnerId = useRef<string | null>(null);

  const [legalName, setLegalName] = useState(auth.profile?.displayName || '');
  const [areaLabel, setAreaLabel] = useState<LagosAreaLabel>('Lekki Phase 1');
  const [areaModalVisible, setAreaModalVisible] = useState(false);
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [commissionAccepted, setCommissionAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<OwnerVisibleProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(Boolean(auth.user?.uid));

  useEffect(() => {
    const ownerId = auth.user?.uid;
    if (!ownerId) return;

    const unsubscribe = createOwnerVerificationRepository().subscribe(
      ownerId,
      (updatedProfile) => {
        setProfile(updatedProfile);
        if (
          updatedProfile &&
          updatedProfile.ownerId === ownerId &&
          hydratedOwnerId.current !== ownerId
        ) {
          const seed = createOwnerIdentityFormSeed(updatedProfile);
          setLegalName(seed.legalName);
          setAreaLabel(seed.areaLabel);
          setLine1(seed.line1);
          setLine2(seed.line2);
          setTermsAccepted(seed.termsAccepted);
          setCommissionAccepted(seed.commissionAccepted);
          setPrivacyAccepted(seed.privacyAccepted);
          hydratedOwnerId.current = ownerId;
        }
        setLoadingProfile(false);
      },
      () => setLoadingProfile(false),
    );

    return () => unsubscribe();
  }, [auth.user?.uid]);

  const [idempotencyKey] = useState(
    () => `complete-profile-${auth.user?.uid || 'anon'}-${Date.now()}`,
  );

  const isFormValid =
    Boolean(auth.user?.emailVerified) &&
    legalName.trim().length >= 3 &&
    legalName.trim().length <= 120 &&
    line1.trim().length >= 8 &&
    line1.trim().length <= 160 &&
    termsAccepted &&
    commissionAccepted &&
    privacyAccepted;

  const handleSave = async () => {
    if (!isFormValid || saving) return;
    setSaving(true);
    setErrorMessage(null);

    try {
      const gateway = createOwnerVerificationGateway();
      const command: CompleteOwnerProfileCommand = {
        schemaVersion: 1,
        idempotencyKey,
        data: {
          legalName: legalName.trim(),
          address: {
            line1: line1.trim(),
            line2: line2.trim() ? line2.trim() : undefined,
            areaLabel,
            city: 'Lagos',
            country: 'NG',
          },
          acceptedOwnerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
          acceptedCommissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
          acceptedPrivacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
        },
      };

      await gateway.completeOwnerProfile(command);

      if (!isNigerianE164(auth.user?.phoneNumber)) {
        router.push('/(owner)/phone' as Href);
      } else {
        router.push('/(owner)' as Href);
      }
    } catch (err) {
      setErrorMessage(ownerCommandErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <View style={styles.header}>
      <ScreenHeader
        onBack={() => router.back()}
        showBrand={false}
        title="Owner profile & terms"
      />
    </View>
  );

  if (loadingProfile) {
    return (
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
        {header}
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.goldStrong} size="small" />
          <Text style={styles.loadingText}>Checking verification status…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isOwnerApplicationEditable(profile?.verificationStatus)) {
    return (
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
        {header}
        <View style={styles.statusBox}>
          <Text style={styles.statusTitle}>Application status managed by MMG</Text>
          <Text style={styles.statusBody}>
            Your owner application is no longer editable. Return to your Owner Desk to see its current status.
          </Text>
          <PressableScale onPress={() => router.replace('/(owner)' as Href)} style={styles.statusAction}>
            <View style={styles.primaryButton}>
              <Text style={styles.primaryText}>RETURN TO OWNER DESK</Text>
            </View>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
      {header}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {errorMessage ? (
          <View style={styles.errorBox}>
            <Ionicons color={colors.danger} name="alert-circle-outline" size={18} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Full Legal Name / Registered Entity</Text>
          <TextInput
            onChangeText={setLegalName}
            placeholder="As shown on official Nigerian ID"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={legalName}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email Address</Text>
          <View style={[styles.input, styles.readOnlyInput]}>
            <Text style={styles.readOnlyText}>{auth.user?.email || 'Unavailable'}</Text>
            <Ionicons
              color={auth.user?.emailVerified ? colors.goldStrong : colors.muted}
              name={auth.user?.emailVerified ? 'checkmark-circle' : 'alert-circle-outline'}
              size={16}
            />
          </View>
        </View>

        {!auth.user?.emailVerified ? (
          <View style={styles.errorBox}>
            <Ionicons color={colors.danger} name="alert-circle-outline" size={18} />
            <Text style={styles.errorText}>
              Verify your email address before setting up an owner identity.
            </Text>
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Primary Lagos Operating Area</Text>
          <PressableScale onPress={() => setAreaModalVisible(true)}>
            <View style={[styles.input, styles.pickerButton]}>
              <Text style={styles.pickerText}>{areaLabel}</Text>
              <Ionicons color={colors.muted} name="chevron-down" size={18} />
            </View>
          </PressableScale>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Street Address Line 1</Text>
          <TextInput
            onChangeText={setLine1}
            placeholder="e.g. 14 Admiralty Way"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={line1}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Address Line 2 (Optional)</Text>
          <TextInput
            onChangeText={setLine2}
            placeholder="Suite, building, or unit number"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={line2}
          />
        </View>

        <View style={styles.rowFields}>
          <View style={[styles.fieldGroup, styles.flexField]}>
            <Text style={styles.label}>City</Text>
            <View style={[styles.input, styles.readOnlyInput]}>
              <Text style={styles.readOnlyText}>Lagos</Text>
            </View>
          </View>
          <View style={[styles.fieldGroup, styles.flexField]}>
            <Text style={styles.label}>Country</Text>
            <View style={[styles.input, styles.readOnlyInput]}>
              <Text style={styles.readOnlyText}>Nigeria (NG)</Text>
            </View>
          </View>
        </View>

        <View style={styles.termsSection}>
          <Text style={styles.sectionTitle}>Required Host Agreements</Text>

          <Pressable onPress={() => setTermsAccepted(!termsAccepted)} style={styles.termsRow}>
            <View style={[styles.checkbox, termsAccepted && styles.checkboxActive]}>
              {termsAccepted ? <Ionicons color={colors.black} name="checkmark" size={14} /> : null}
            </View>
            <View style={styles.termsCopy}>
              <Text style={styles.termsTitle}>{OWNER_TERMS_SUMMARY.title}</Text>
              <Text style={styles.termsDescription}>{OWNER_TERMS_SUMMARY.summary}</Text>
              <Text style={styles.termsVersion}>Version: {OWNER_TERMS_SUMMARY.version}</Text>
            </View>
          </Pressable>

          <Pressable onPress={() => setCommissionAccepted(!commissionAccepted)} style={styles.termsRow}>
            <View style={[styles.checkbox, commissionAccepted && styles.checkboxActive]}>
              {commissionAccepted ? <Ionicons color={colors.black} name="checkmark" size={14} /> : null}
            </View>
            <View style={styles.termsCopy}>
              <Text style={styles.termsTitle}>{COMMISSION_TERMS_SUMMARY.title}</Text>
              <Text style={styles.termsDescription}>{COMMISSION_TERMS_SUMMARY.summary}</Text>
              <Text style={styles.termsVersion}>Version: {COMMISSION_TERMS_SUMMARY.version}</Text>
            </View>
          </Pressable>

          <Pressable onPress={() => setPrivacyAccepted(!privacyAccepted)} style={styles.termsRow}>
            <View style={[styles.checkbox, privacyAccepted && styles.checkboxActive]}>
              {privacyAccepted ? <Ionicons color={colors.black} name="checkmark" size={14} /> : null}
            </View>
            <View style={styles.termsCopy}>
              <Text style={styles.termsTitle}>{PRIVACY_NOTICE_SUMMARY.title}</Text>
              <Text style={styles.termsDescription}>{PRIVACY_NOTICE_SUMMARY.summary}</Text>
              <Text style={styles.termsVersion}>Version: {PRIVACY_NOTICE_SUMMARY.version}</Text>
            </View>
          </Pressable>
        </View>

        <PressableScale
          onPress={handleSave}
          style={[styles.saveAction, (!isFormValid || saving) && styles.disabledAction]}
        >
          <View style={styles.primaryButton}>
            {saving ? (
              <ActivityIndicator color={colors.black} size="small" />
            ) : (
              <Text style={styles.primaryText}>SAVE AND CONTINUE</Text>
            )}
          </View>
        </PressableScale>
      </ScrollView>

      <Modal animationType="slide" transparent visible={areaModalVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Lagos Area</Text>
              <Pressable accessibilityLabel="Close area selection" onPress={() => setAreaModalVisible(false)}>
                <Ionicons color={colors.ivory} name="close" size={24} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalList}>
              {LAGOS_AREA_LABELS.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => {
                    setAreaLabel(item);
                    setAreaModalVisible(false);
                  }}
                  style={styles.modalItem}
                >
                  <Text style={[styles.modalItemText, areaLabel === item && styles.modalItemTextActive]}>
                    {item}
                  </Text>
                  {areaLabel === item ? <Ionicons color={colors.goldStrong} name="checkmark" size={18} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  checkbox: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: 4, borderWidth: 1.5, height: 22, justifyContent: 'center', marginTop: 2, width: 22 },
  checkboxActive: { backgroundColor: colors.goldStrong, borderColor: colors.goldStrong },
  disabledAction: { opacity: 0.5 },
  errorBox: { alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.md },
  errorText: { color: colors.danger, flex: 1, fontFamily: typography.body, fontSize: 13 },
  fieldGroup: { marginBottom: spacing.md },
  flexField: { flex: 1 },
  header: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  input: { backgroundColor: colors.graphiteRaised, borderColor: colors.line, borderRadius: radii.sm, borderWidth: 1, color: colors.ivory, fontFamily: typography.body, fontSize: 14, minHeight: 48, paddingHorizontal: spacing.md },
  label: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 12, marginBottom: spacing.xxs },
  loadingBox: { alignItems: 'center', flex: 1, gap: spacing.sm, justifyContent: 'center', padding: spacing.lg },
  loadingText: { color: colors.silver, fontFamily: typography.body, fontSize: 14 },
  modalContent: { backgroundColor: '#14181F', borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, maxHeight: '60%', padding: spacing.lg },
  modalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  modalItem: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md },
  modalItemText: { color: colors.silver, fontFamily: typography.body, fontSize: 15 },
  modalItemTextActive: { color: colors.goldStrong, fontFamily: typography.bodySemiBold },
  modalList: { maxHeight: 300 },
  modalOverlay: { backgroundColor: 'rgba(0,0,0,0.7)', flex: 1, justifyContent: 'flex-end' },
  modalTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 16 },
  pickerButton: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  pickerText: { color: colors.ivory, fontFamily: typography.body, fontSize: 14 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', minHeight: 54 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14, letterSpacing: 0.5 },
  readOnlyInput: { alignItems: 'center', backgroundColor: '#0D0F13', flexDirection: 'row', justifyContent: 'space-between' },
  readOnlyText: { color: colors.silver, fontFamily: typography.body, fontSize: 14 },
  rowFields: { flexDirection: 'row', gap: spacing.md },
  saveAction: { marginTop: spacing.xl },
  screen: { backgroundColor: colors.black, flex: 1 },
  scroll: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  sectionTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14, marginBottom: spacing.md },
  statusAction: { marginTop: spacing.md },
  statusBody: { color: colors.silver, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  statusBox: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  statusTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 18, marginBottom: spacing.xs },
  termsCopy: { flex: 1 },
  termsDescription: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: 2 },
  termsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  termsSection: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.md, paddingTop: spacing.lg },
  termsTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13 },
  termsVersion: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 0.8, marginTop: 4 },
});
