import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type {
  GovernmentIdKind,
  OwnerVisibleProfile,
  SubmitOwnerVerificationCommand,
} from '@mmg/contracts';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { useAuth } from '@/core/auth/auth-context';
import { clearDraftUpload, getDraftUpload } from '../data/owner-draft-store';
import { createOwnerVerificationGateway } from '../data/owner-verification-gateway';
import { createOwnerVerificationRepository } from '../data/owner-verification-repository';
import {
  computeApplicationCompleteness,
  isOwnerApplicationEditable,
  type LocalUploadedDocument,
} from '../domain/owner-application';
import { ownerCommandErrorMessage } from '../domain/owner-errors';

export function OwnerSubmitScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{
    uploadId?: string;
    documentKind?: GovernmentIdKind;
    originalFileName?: string;
  }>();

  const [profile, setProfile] = useState<OwnerVisibleProfile | null>(null);
  const [draftUpload, setDraftUpload] = useState<LocalUploadedDocument | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [idempotencyKey] = useState(
    () => `submit-app-${auth.user?.uid || 'anon'}-${Date.now()}`,
  );

  useEffect(() => {
    const ownerId = auth.user?.uid;
    if (!ownerId) return;

    void getDraftUpload(ownerId).then((savedDraft) => {
      setDraftUpload(savedDraft);
    });

    const repository = createOwnerVerificationRepository();
    const unsubscribe = repository.subscribe(
      ownerId,
      (updatedProfile) => setProfile(updatedProfile),
      () => {},
    );

    return () => unsubscribe();
  }, [auth.user?.uid]);

  const uploadId = params.uploadId || draftUpload?.uploadId || profile?.governmentId?.uploadId;
  const documentKind =
    params.documentKind ||
    draftUpload?.documentKind ||
    profile?.governmentId?.documentKind ||
    'national_id';
  const originalFileName =
    params.originalFileName ||
    draftUpload?.originalFileName ||
    'government-identification.jpg';

  const hasValidDocument = Boolean(uploadId);
  const completeness = computeApplicationCompleteness(
    profile,
    auth.user?.phoneNumber,
    draftUpload,
    Boolean(auth.user?.emailVerified),
  );
  const applicationIsEditable = isOwnerApplicationEditable(profile?.verificationStatus);
  const canSubmit = applicationIsEditable && completeness.canSubmit && hasValidDocument;

  const handleSubmit = async () => {
    if (submitting || !auth.user?.uid || !uploadId) return;
    if (!applicationIsEditable) {
      setErrorMessage('This owner application is no longer editable. Return to your Owner Desk.');
      return;
    }
    if (!completeness.canSubmit) {
      setErrorMessage('Complete every owner verification step before submitting your application.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await auth.refreshUser();
      const gateway = createOwnerVerificationGateway();
      const command: SubmitOwnerVerificationCommand = {
        schemaVersion: 1,
        idempotencyKey,
        data: {
          uploadId,
          documentKind,
          originalFileName,
        },
      };

      await gateway.submitOwnerVerification(command);
      await clearDraftUpload(auth.user.uid);
      router.replace('/(owner)' as Href);
    } catch (err) {
      setErrorMessage(ownerCommandErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <ScreenHeader onBack={() => router.back()} showBrand={false} title="Review & submit" />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>Confirm these details before sending your application to MMG for review.</Text>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Ionicons color={colors.danger} name="alert-circle-outline" size={18} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.summaryCard}>
          <Text style={styles.cardHeader}>Application Summary</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Full Legal Name</Text>
            <Text style={styles.summaryValue}>
              {profile?.legalName || auth.profile?.displayName || 'Not provided'}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Verified Email</Text>
            <Text style={styles.summaryValue}>{auth.user?.email || 'Not provided'}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Linked Nigerian Phone</Text>
            <Text style={[styles.summaryValue, styles.phoneValue]}>
              {auth.user?.phoneNumber || 'Not provided'}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Lagos Address</Text>
            <Text style={styles.summaryValue}>
              {profile?.address
                ? `${profile.address.line1}, ${profile.address.areaLabel}, Lagos`
                : 'Not provided'}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>ID Document</Text>
            <View style={styles.summaryValueStack}>
              {hasValidDocument ? (
                <>
                  <Text style={styles.summaryValue}>
                    {documentKind.replace('_', ' ').toUpperCase()}
                  </Text>
                  <Text style={styles.summarySubValue}>{originalFileName}</Text>
                </>
              ) : (
                <PressableScale onPress={() => router.push('/(owner)/id' as Href)}>
                  <Text style={styles.summaryValueAction}>Upload required</Text>
                </PressableScale>
              )}
            </View>
          </View>

          <View style={[styles.summaryRow, styles.lastSummaryRow]}>
            <Text style={styles.summaryLabel}>Legal Agreements</Text>
            <View style={styles.summaryValueStack}>
              <View style={styles.badgeRow}>
                <Ionicons color={colors.goldStrong} name="checkmark-circle" size={14} />
                <Text style={styles.badgeText}>Terms accepted</Text>
              </View>
              <Text style={styles.summarySubValue}>
                {profile?.termsAcceptedAt
                  ? new Date(profile.termsAcceptedAt).toLocaleDateString('en-GB')
                  : 'Current'}
              </Text>
            </View>
          </View>
        </View>

        {!applicationIsEditable ? (
          <View style={styles.statusNotice}>
            <Text style={styles.statusNoticeText}>
              This application is no longer editable. Check your Owner Desk for its current status.
            </Text>
            <PressableScale onPress={() => router.replace('/(owner)' as Href)} style={styles.statusAction}>
              <View style={styles.primaryButton}>
                <Text style={styles.primaryText}>Return to Owner Desk</Text>
              </View>
            </PressableScale>
          </View>
        ) : (
          <PressableScale
            onPress={handleSubmit}
            style={[styles.submitAction, (!canSubmit || submitting) && styles.disabledAction]}
          >
            <View style={styles.primaryButton}>
              {submitting ? (
                <ActivityIndicator color={colors.black} size="small" />
              ) : (
                <Text style={styles.primaryText}>Submit application</Text>
              )}
            </View>
          </PressableScale>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  badgeRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  badgeText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 12 },
  cardHeader: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.2, marginBottom: spacing.md, textTransform: 'uppercase' },
  disabledAction: { opacity: 0.5 },
  errorBox: { alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.md },
  errorText: { color: colors.danger, flex: 1, fontFamily: typography.body, fontSize: 13 },
  header: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  intro: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, marginBottom: spacing.lg },
  lastSummaryRow: { borderBottomWidth: 0 },
  phoneValue: { color: colors.goldStrong, fontFamily: 'monospace' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', minHeight: 54 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  screen: { backgroundColor: colors.black, flex: 1 },
  scroll: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  statusAction: { marginTop: spacing.md },
  statusNotice: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: spacing.xl, paddingBottom: spacing.lg },
  statusNoticeText: { color: colors.silver, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  submitAction: { marginTop: spacing.xl },
  summaryCard: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm },
  summaryLabel: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 13 },
  summaryRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', paddingVertical: spacing.md },
  summarySubValue: { color: colors.muted, fontFamily: typography.body, fontSize: 11, marginTop: 2 },
  summaryValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13, flexShrink: 1, textAlign: 'right' },
  summaryValueAction: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 13 },
  summaryValueStack: { alignItems: 'flex-end', flexShrink: 1 },
});
