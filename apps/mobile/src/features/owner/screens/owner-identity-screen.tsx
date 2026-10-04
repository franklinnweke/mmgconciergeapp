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
import { useEffect, useReducer, useRef, useState } from 'react';
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
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import {
  COMMISSION_TERMS_SUMMARY,
  OWNER_TERMS_SUMMARY,
  PRIVACY_NOTICE_SUMMARY,
} from '../content/owner-terms';
import { createOwnerVerificationGateway } from '../data/owner-verification-gateway';
import { createOwnerVerificationRepository } from '../data/owner-verification-repository';
import { isNigerianE164, isOwnerApplicationEditable } from '../domain/owner-application';
import { createOwnerIdentityFormSeed } from '../domain/owner-identity-form-seed';
import {
  isOwnerIdentityFormValid,
  ownerIdentityFormReducer,
} from '../domain/owner-identity-form-state';
import { ownerCommandErrorMessage } from '../domain/owner-errors';

export function OwnerIdentityScreen() {
  const auth = useAuth();
  const router = useRouter();
  const hydratedOwnerId = useRef<string | null>(null);

  const [formState, dispatch] = useReducer(ownerIdentityFormReducer, {
    legalName: auth.profile?.displayName || '',
    areaLabel: 'Lekki Phase 1',
    line1: '',
    line2: '',
    termsAccepted: false,
    commissionAccepted: false,
    privacyAccepted: false,
    errorMessage: null,
  });

  const {
    legalName,
    areaLabel,
    line1,
    line2,
    termsAccepted,
    commissionAccepted,
    privacyAccepted,
    errorMessage,
  } = formState;

  const [areaModalVisible, setAreaModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<OwnerVisibleProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(Boolean(auth.user?.uid));

  useEffect(() => {
    const ownerId = auth.user?.uid;
    if (!ownerId || auth.signingOut) return;

    const unsubscribe = createOwnerVerificationRepository().subscribe(
      ownerId,
      (updatedProfile) => {
        if (auth.signingOut) return;
        setProfile(updatedProfile);
        if (
          updatedProfile &&
          updatedProfile.ownerId === ownerId &&
          hydratedOwnerId.current !== ownerId
        ) {
          const seed = createOwnerIdentityFormSeed(updatedProfile);
          dispatch({ type: 'HYDRATE_FROM_SEED', seed });
          hydratedOwnerId.current = ownerId;
        }
        setLoadingProfile(false);
      },
      () => {
        if (!auth.signingOut) {
          setLoadingProfile(false);
        }
      },
    );

    return () => unsubscribe();
  }, [auth.signingOut, auth.user?.uid]);

  const [idempotencyKey] = useState(
    () => `complete-profile-${auth.user?.uid || 'anon'}-${Date.now()}`,
  );

  const isFormValid = isOwnerIdentityFormValid(formState, Boolean(auth.user?.emailVerified));

  const handleLegalNameChange = (text: string) => {
    dispatch({ type: 'SET_LEGAL_NAME', legalName: text });
  };

  const handleAreaSelect = (area: LagosAreaLabel) => {
    dispatch({ type: 'SET_AREA_LABEL', areaLabel: area });
    setAreaModalVisible(false);
  };

  const handleLine1Change = (text: string) => {
    dispatch({ type: 'SET_LINE1', line1: text });
  };

  const handleLine2Change = (text: string) => {
    dispatch({ type: 'SET_LINE2', line2: text });
  };

  const handleToggleTerms = () => {
    dispatch({ type: 'TOGGLE_TERMS' });
  };

  const handleToggleCommission = () => {
    dispatch({ type: 'TOGGLE_COMMISSION' });
  };

  const handleTogglePrivacy = () => {
    dispatch({ type: 'TOGGLE_PRIVACY' });
  };

  const handleSave = async () => {
    if (!isFormValid || saving) return;
    setSaving(true);
    dispatch({ type: 'SET_ERROR', errorMessage: null });

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
      dispatch({ type: 'SET_ERROR', errorMessage: ownerCommandErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <View style={styles.header}>
      <ScreenHeader
        onBack={() => router.back()}
        showBrand={false}
        title="Your details"
      />
    </View>
  );

  if (auth.signingOut) {
    return <AuthLoadingScreen message="Signing out" />;
  }

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
          <Text style={styles.statusTitle}>Not editable</Text>
          <Text style={styles.statusBody}>
            Check Owner Desk for status.
          </Text>
          <PressableScale onPress={() => router.replace('/(owner)' as Href)} style={styles.statusAction}>
            <View style={styles.primaryButton}>
              <Text style={styles.primaryText}>Return to Owner Desk</Text>
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
          <Text style={styles.label}>Legal name or registered business</Text>
          <TextInput
            onChangeText={handleLegalNameChange}
            placeholder="As shown on official Nigerian ID"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={legalName}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
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
          <Text style={styles.label}>Lagos operating area</Text>
          <PressableScale onPress={() => setAreaModalVisible(true)}>
            <View style={[styles.input, styles.pickerButton]}>
              <Text style={styles.pickerText}>{areaLabel}</Text>
              <Ionicons color={colors.muted} name="chevron-down" size={18} />
            </View>
          </PressableScale>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Street address</Text>
          <TextInput
            onChangeText={handleLine1Change}
            placeholder="e.g. 14 Admiralty Way"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={line1}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Address line 2 (optional)</Text>
          <TextInput
            onChangeText={handleLine2Change}
            placeholder="Suite, building, or unit number"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={line2}
          />
        </View>

        <View style={styles.termsSection}>
          <Text style={styles.sectionTitle}>Agreements</Text>

          <Pressable onPress={handleToggleTerms} style={styles.termsRow}>
            <View style={[styles.checkbox, termsAccepted && styles.checkboxActive]}>
              {termsAccepted ? <Ionicons color={colors.black} name="checkmark" size={14} /> : null}
            </View>
            <View style={styles.termsCopy}>
              <Text style={styles.termsTitle}>{OWNER_TERMS_SUMMARY.title}</Text>
              <Text style={styles.termsDescription}>{OWNER_TERMS_SUMMARY.summary}</Text>
            </View>
          </Pressable>

          <Pressable onPress={handleToggleCommission} style={styles.termsRow}>
            <View style={[styles.checkbox, commissionAccepted && styles.checkboxActive]}>
              {commissionAccepted ? <Ionicons color={colors.black} name="checkmark" size={14} /> : null}
            </View>
            <View style={styles.termsCopy}>
              <Text style={styles.termsTitle}>{COMMISSION_TERMS_SUMMARY.title}</Text>
              <Text style={styles.termsDescription}>{COMMISSION_TERMS_SUMMARY.summary}</Text>
            </View>
          </Pressable>

          <Pressable onPress={handleTogglePrivacy} style={styles.termsRow}>
            <View style={[styles.checkbox, privacyAccepted && styles.checkboxActive]}>
              {privacyAccepted ? <Ionicons color={colors.black} name="checkmark" size={14} /> : null}
            </View>
            <View style={styles.termsCopy}>
              <Text style={styles.termsTitle}>{PRIVACY_NOTICE_SUMMARY.title}</Text>
              <Text style={styles.termsDescription}>{PRIVACY_NOTICE_SUMMARY.summary}</Text>
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
              <Text style={styles.primaryText}>Save and continue</Text>
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
                  onPress={() => handleAreaSelect(item)}
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
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.button, justifyContent: 'center', minHeight: 54 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  readOnlyInput: { alignItems: 'center', backgroundColor: '#0D0F13', flexDirection: 'row', justifyContent: 'space-between' },
  readOnlyText: { color: colors.silver, fontFamily: typography.body, fontSize: 14 },
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
});
