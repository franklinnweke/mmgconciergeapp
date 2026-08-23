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
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
      if (!isNigerianE164(auth.user?.phoneNumber)) router.push('/(owner)/phone' as Href);
      else router.push('/(owner)' as Href);
    } catch (err) {
      setErrorMessage(ownerCommandErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <MobileHeader onBack={() => router.back()} title="Owner profile" />
        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>Tell us about you</Text>
          <Text style={styles.subtitle}>We use these details to verify who operates the vehicle in Lagos.</Text>
        </View>

        {errorMessage ? <InlineNotice icon="alert-circle-outline" tone="danger">{errorMessage}</InlineNotice> : null}

        <View style={styles.section}>
          <SectionHeading>Identity</SectionHeading>
          <View style={styles.fieldGroup}>
            <FieldLabel>Legal name or registered entity</FieldLabel>
            <TextInput
              autoCapitalize="words"
              onChangeText={setLegalName}
              placeholder="Name shown on official ID"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={legalName}
            />
          </View>
          <View style={styles.readOnlyRow}>
            <View style={styles.readOnlyCopy}>
              <Text style={styles.readOnlyLabel}>Verified email</Text>
              <Text style={styles.readOnlyValue}>{auth.user?.email || '—'}</Text>
            </View>
            <Ionicons color={colors.success} name="checkmark-circle" size={18} />
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeading>Lagos address</SectionHeading>
          <View style={styles.fieldGroup}>
            <FieldLabel>Operating area</FieldLabel>
            <PressableScale accessibilityRole="button" onPress={() => setAreaModalVisible(true)}>
              <View style={styles.selector}>
                <Text style={styles.selectorText}>{areaLabel}</Text>
                <Ionicons color={colors.muted} name="chevron-down" size={18} />
              </View>
            </PressableScale>
          </View>
          <View style={styles.fieldGroup}>
            <FieldLabel>Street address</FieldLabel>
            <TextInput
              onChangeText={setLine1}
              placeholder="14 Admiralty Way"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={line1}
            />
          </View>
          <View style={styles.fieldGroup}>
            <FieldLabel>Building, suite or unit <Text style={styles.optional}>Optional</Text></FieldLabel>
            <TextInput
              onChangeText={setLine2}
              placeholder="Additional address detail"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={line2}
            />
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeading>Agreements</SectionHeading>
          <AgreementRow
            accepted={termsAccepted}
            description={OWNER_TERMS_SUMMARY.summary}
            onPress={() => setTermsAccepted((value) => !value)}
            title={OWNER_TERMS_SUMMARY.title}
          />
          <AgreementRow
            accepted={commissionAccepted}
            description={COMMISSION_TERMS_SUMMARY.summary}
            onPress={() => setCommissionAccepted((value) => !value)}
            title={COMMISSION_TERMS_SUMMARY.title}
          />
          <AgreementRow
            accepted={privacyAccepted}
            description={PRIVACY_NOTICE_SUMMARY.summary}
            onPress={() => setPrivacyAccepted((value) => !value)}
            title={PRIVACY_NOTICE_SUMMARY.title}
          />
        </View>

        <View style={styles.primaryArea}>
          <PrimaryAction
            disabled={!isFormValid}
            icon="arrow-forward"
            label="Save and continue"
            loading={saving}
            onPress={() => void handleSave()}
          />
        </View>
      </ScrollView>

      <Modal animationType="slide" onRequestClose={() => setAreaModalVisible(false)} transparent visible={areaModalVisible}>
        <View style={styles.modalBackdrop}>
          <Pressable onPress={() => setAreaModalVisible(false)} style={StyleSheet.absoluteFill} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Operating area</Text>
              <PressableScale accessibilityLabel="Close" accessibilityRole="button" onPress={() => setAreaModalVisible(false)}>
                <View style={styles.closeTarget}><Ionicons color={colors.ivory} name="close" size={22} /></View>
              </PressableScale>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {LAGOS_AREA_LABELS.map((area) => (
                <PressableScale
                  accessibilityRole="radio"
                  accessibilityState={{ selected: areaLabel === area }}
                  key={area}
                  onPress={() => {
                    setAreaLabel(area);
                    setAreaModalVisible(false);
                  }}
                >
                  <View style={styles.sheetRow}>
                    <Text style={[styles.sheetRowText, areaLabel === area && styles.sheetRowTextSelected]}>{area}</Text>
                    {areaLabel === area ? <Ionicons color={colors.goldStrong} name="checkmark" size={20} /> : null}
                  </View>
                </PressableScale>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function AgreementRow({
  accepted,
  description,
  onPress,
  title,
}: {
  accepted: boolean;
  description: string;
  onPress: () => void;
  title: string;
}) {
  return (
    <PressableScale accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={onPress}>
      <View style={styles.agreementRow}>
        <View style={[styles.checkbox, accepted && styles.checkboxActive]}>
          {accepted ? <Ionicons color={colors.black} name="checkmark" size={14} /> : null}
        </View>
        <View style={styles.agreementCopy}>
          <Text style={styles.agreementTitle}>{title}</Text>
          <Text style={styles.agreementDescription}>{description}</Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  agreementCopy: { flex: 1 },
  agreementDescription: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  agreementRow: {
    alignItems: 'flex-start',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  agreementTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.xs,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    marginTop: 2,
    width: 22,
  },
  checkboxActive: {
    backgroundColor: colors.goldStrong,
    borderColor: colors.goldStrong,
  },
  closeTarget: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  content: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  fieldGroup: {
    marginTop: spacing.md,
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
  modalBackdrop: {
    backgroundColor: 'rgba(0,0,0,.68)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  optional: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
  },
  primaryArea: {
    marginTop: spacing.xl,
  },
  readOnlyCopy: { flex: 1 },
  readOnlyLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  readOnlyRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginTop: spacing.md,
    minHeight: 54,
  },
  readOnlyValue: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    marginTop: 2,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  section: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  selector: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  selectorText: {
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 15,
  },
  sheet: {
    backgroundColor: colors.graphite,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '72%',
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  sheetRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  sheetRowText: {
    color: colors.silver,
    fontFamily: typography.body,
    fontSize: 15,
  },
  sheetRowTextSelected: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
  },
  sheetTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 23,
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
});
