import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  LAGOS_AREA_LABELS,
  type CompleteOwnerProfileCommand,
  type LagosAreaLabel,
} from '@mmg/contracts';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
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
import { useAuth } from '@/core/auth/auth-context';
import {
  COMMISSION_TERMS_SUMMARY,
  OWNER_TERMS_SUMMARY,
  PRIVACY_NOTICE_SUMMARY,
} from '../content/owner-terms';
import { createOwnerVerificationGateway } from '../data/owner-verification-gateway';
import { isNigerianE164 } from '../domain/owner-application';
import { ownerCommandErrorMessage } from '../domain/owner-errors';

export function OwnerIdentityScreen() {
  const auth = useAuth();
  const router = useRouter();

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

  // Frozen per mount (same pattern as the submit screen): a fresh Date.now()
  // key per attempt defeats the backend's idempotency replay, so a
  // lost-response retry becomes a brand-new command instead of returning the
  // stored result. The service persists idempotency records only on success,
  // so retrying a failed attempt under the same key still executes normally.
  const [idempotencyKey] = useState(
    () => `complete-profile-${auth.user?.uid || 'anon'}-${Date.now()}`,
  );

  const isFormValid =
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

      // Check if phone needs verification
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
            <Text style={styles.title}>Owner Profile & Terms</Text>
          </View>
        </View>

        {errorMessage && (
          <View style={styles.errorBox}>
            <Ionicons color="#EF4444" name="alert-circle-outline" size={18} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* Legal Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Full Legal Name / Registered Entity</Text>
          <TextInput
            placeholder="As shown on official Nigerian ID"
            placeholderTextColor={colors.muted}
            value={legalName}
            onChangeText={setLegalName}
            style={styles.input}
          />
        </View>

        {/* Email (Read only) */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Verified Email Address</Text>
          <View style={[styles.input, styles.readOnlyInput]}>
            <Text style={styles.readOnlyText}>{auth.user?.email || 'owner@example.com'}</Text>
            <Ionicons color={colors.goldStrong} name="checkmark-circle" size={16} />
          </View>
        </View>

        {/* Lagos Operating Area Picker */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Primary Lagos Operating Area</Text>
          <PressableScale onPress={() => setAreaModalVisible(true)}>
            <View style={[styles.input, styles.pickerButton]}>
              <Text style={styles.pickerText}>{areaLabel}</Text>
              <Ionicons color={colors.muted} name="chevron-down" size={18} />
            </View>
          </PressableScale>
        </View>

        {/* Address Line 1 */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Street Address Line 1</Text>
          <TextInput
            placeholder="e.g. 14 Admiralty Way"
            placeholderTextColor={colors.muted}
            value={line1}
            onChangeText={setLine1}
            style={styles.input}
          />
        </View>

        {/* Address Line 2 */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Address Line 2 (Optional)</Text>
          <TextInput
            placeholder="Suite, building, or unit number"
            placeholderTextColor={colors.muted}
            value={line2}
            onChangeText={setLine2}
            style={styles.input}
          />
        </View>

        {/* City & Country (Locked) */}
        <View style={styles.rowFields}>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.label}>City</Text>
            <View style={[styles.input, styles.readOnlyInput]}>
              <Text style={styles.readOnlyText}>Lagos</Text>
            </View>
          </View>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.label}>Country</Text>
            <View style={[styles.input, styles.readOnlyInput]}>
              <Text style={styles.readOnlyText}>Nigeria (NG)</Text>
            </View>
          </View>
        </View>

        {/* Legal Terms Checkboxes */}
        <View style={styles.termsSection}>
          <Text style={styles.sectionTitle}>Required Host Agreements</Text>

          {/* Owner Terms */}
          <Pressable
            onPress={() => setTermsAccepted(!termsAccepted)}
            style={styles.termsRow}
          >
            <View style={[styles.checkbox, termsAccepted && styles.checkboxActive]}>
              {termsAccepted && <Ionicons color={colors.black} name="checkmark" size={14} />}
            </View>
            <View style={styles.termsCopy}>
              <Text style={styles.termsTitle}>{OWNER_TERMS_SUMMARY.title}</Text>
              <Text style={styles.termsDescription}>{OWNER_TERMS_SUMMARY.summary}</Text>
              <Text style={styles.termsVersion}>Version: {OWNER_TERMS_SUMMARY.version}</Text>
            </View>
          </Pressable>

          {/* Commission Schedule */}
          <Pressable
            onPress={() => setCommissionAccepted(!commissionAccepted)}
            style={styles.termsRow}
          >
            <View style={[styles.checkbox, commissionAccepted && styles.checkboxActive]}>
              {commissionAccepted && <Ionicons color={colors.black} name="checkmark" size={14} />}
            </View>
            <View style={styles.termsCopy}>
              <Text style={styles.termsTitle}>{COMMISSION_TERMS_SUMMARY.title}</Text>
              <Text style={styles.termsDescription}>{COMMISSION_TERMS_SUMMARY.summary}</Text>
              <Text style={styles.termsVersion}>Version: {COMMISSION_TERMS_SUMMARY.version}</Text>
            </View>
          </Pressable>

          {/* Privacy Notice */}
          <Pressable
            onPress={() => setPrivacyAccepted(!privacyAccepted)}
            style={styles.termsRow}
          >
            <View style={[styles.checkbox, privacyAccepted && styles.checkboxActive]}>
              {privacyAccepted && <Ionicons color={colors.black} name="checkmark" size={14} />}
            </View>
            <View style={styles.termsCopy}>
              <Text style={styles.termsTitle}>{PRIVACY_NOTICE_SUMMARY.title}</Text>
              <Text style={styles.termsDescription}>{PRIVACY_NOTICE_SUMMARY.summary}</Text>
              <Text style={styles.termsVersion}>Version: {PRIVACY_NOTICE_SUMMARY.version}</Text>
            </View>
          </Pressable>
        </View>

        {/* Primary Action Button */}
        <PressableScale
          onPress={handleSave}
          style={[{ marginTop: spacing.xl }, (!isFormValid || saving) && { opacity: 0.5 }]}
        >
          <View style={styles.primaryButton}>
            {saving ? (
              <ActivityIndicator color={colors.black} size="small" />
            ) : (
              <>
                <Text style={styles.primaryText}>SAVE AND CONTINUE</Text>
                <Ionicons color={colors.black} name="arrow-forward" size={18} />
              </>
            )}
          </View>
        </PressableScale>
      </ScrollView>

      {/* Area Selection Modal */}
      <Modal animationType="slide" transparent visible={areaModalVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Lagos Area</Text>
              <Pressable onPress={() => setAreaModalVisible(false)}>
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
                  {areaLabel === item && <Ionicons color={colors.goldStrong} name="checkmark" size={18} />}
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
  backButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, height: 44, justifyContent: 'center', minHeight: 44, minWidth: 44, width: 44 },
  checkbox: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: 4, borderWidth: 1.5, height: 22, justifyContent: 'center', marginTop: 2, width: 22 },
  checkboxActive: { backgroundColor: colors.goldStrong, borderColor: colors.goldStrong },
  errorBox: { alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.md },
  errorText: { color: '#EF4444', flex: 1, fontFamily: typography.body, fontSize: 13 },
  fieldGroup: { marginBottom: spacing.md },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  input: { backgroundColor: colors.graphiteRaised, borderColor: colors.line, borderRadius: radii.sm, borderWidth: 1, color: colors.ivory, fontFamily: typography.body, fontSize: 14, minHeight: 48, paddingHorizontal: spacing.md },
  label: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 12, marginBottom: spacing.xxs },
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
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 54 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14, letterSpacing: 0.5 },
  readOnlyInput: { alignItems: 'center', backgroundColor: '#0D0F13', flexDirection: 'row', justifyContent: 'space-between' },
  readOnlyText: { color: colors.silver, fontFamily: typography.body, fontSize: 14 },
  rowFields: { flexDirection: 'row', gap: spacing.md },
  screen: { backgroundColor: colors.black, flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sectionTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14, marginBottom: spacing.md },
  termsCopy: { flex: 1 },
  termsDescription: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: 2 },
  termsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  termsSection: { borderTopColor: colors.line, borderTopWidth: 1, marginTop: spacing.md, paddingTop: spacing.lg },
  termsTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13 },
  termsVersion: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 10, letterSpacing: 0.8, marginTop: 4 },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 26, letterSpacing: -0.4, marginTop: 2 },
});
