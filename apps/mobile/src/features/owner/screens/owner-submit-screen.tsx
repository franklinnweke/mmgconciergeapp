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
      (p) => setProfile(p),
      () => {},
    );
    return () => unsubscribe();
  }, [auth.user?.uid]);

  const uploadId =
    params.uploadId || draftUpload?.uploadId || profile?.governmentId?.uploadId;
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

      // Clear local draft upload upon successful submission
      await clearDraftUpload(auth.user.uid);

      // Successfully submitted -> return to desk
      router.replace('/(owner)' as Href);
    } catch (err) {
      setErrorMessage(ownerCommandErrorMessage(err));
    } finally {
      setSubmitting(false);
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
            <Text style={styles.title}>Review & Submit</Text>
          </View>
        </View>

        <Text style={styles.intro}>
          Verify that all information matches your official documents. Once submitted, your file is sent to the MMG operations desk for compliance review.
        </Text>

        {errorMessage && (
          <View style={styles.errorBox}>
            <Ionicons color="#EF4444" name="alert-circle-outline" size={18} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.cardHeader}>Application Summary</Text>

          {/* Legal Name */}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Full Legal Name</Text>
            <Text style={styles.summaryValue}>{profile?.legalName || auth.profile?.displayName || '—'}</Text>
          </View>

          {/* Email */}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Verified Email</Text>
            <Text style={styles.summaryValue}>{auth.user?.email || '—'}</Text>
          </View>

          {/* Phone */}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Linked Nigerian Phone</Text>
            <Text style={[styles.summaryValue, { color: colors.goldStrong, fontFamily: 'monospace' }]}>
              {auth.user?.phoneNumber || '—'}
            </Text>
          </View>

          {/* Address */}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Lagos Address</Text>
            <Text style={styles.summaryValue}>
              {profile?.address
                ? `${profile.address.line1}, ${profile.address.areaLabel}, Lagos`
                : '—'}
            </Text>
          </View>

          {/* Identification Document */}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>ID Document</Text>
            <View style={{ alignItems: 'flex-end' }}>
              {hasValidDocument ? (
                <>
                  <Text style={styles.summaryValue}>
                    {documentKind.replace('_', ' ').toUpperCase()}
                  </Text>
                  <Text style={styles.summarySubValue}>{originalFileName}</Text>
                </>
              ) : (
                <PressableScale onPress={() => router.push('/(owner)/id' as Href)}>
                  <Text style={[styles.summaryValue, { color: colors.goldStrong }]}>
                    Upload Required →
                  </Text>
                </PressableScale>
              )}
            </View>
          </View>

          {/* Legal Terms Acceptance */}
          <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.summaryLabel}>Legal Agreements</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={styles.badgeRow}>
                <Ionicons color={colors.goldStrong} name="checkmark-circle" size={14} />
                <Text style={styles.badgeText}>Terms Accepted</Text>
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
            <PressableScale onPress={() => router.replace('/(owner)' as Href)} style={{ marginTop: spacing.md }}>
              <View style={styles.primaryButton}>
                <Text style={styles.primaryText}>RETURN TO OWNER DESK</Text>
              </View>
            </PressableScale>
          </View>
        ) : (
          <PressableScale
            onPress={handleSubmit}
            style={[{ marginTop: spacing.xl }, (!canSubmit || submitting) && { opacity: 0.5 }]}
          >
            <View style={styles.primaryButton}>
              {submitting ? (
                <ActivityIndicator color={colors.black} size="small" />
              ) : (
                <>
                  <Text style={styles.primaryText}>SUBMIT APPLICATION</Text>
                  <Ionicons color={colors.black} name="shield-checkmark-outline" size={18} />
                </>
              )}
            </View>
          </PressableScale>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, height: 44, justifyContent: 'center', minHeight: 44, minWidth: 44, width: 44 },
  badgeRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  badgeText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 12 },
  cardHeader: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.2, marginBottom: spacing.md, textTransform: 'uppercase' },
  errorBox: { alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.md },
  errorText: { color: '#EF4444', flex: 1, fontFamily: typography.body, fontSize: 13 },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  intro: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, marginBottom: spacing.lg },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 54 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14, letterSpacing: 0.5 },
  screen: { backgroundColor: colors.black, flex: 1 },
  statusNotice: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: spacing.xl, paddingBottom: spacing.lg },
  statusNoticeText: { color: colors.silver, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  summaryCard: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm },
  summaryLabel: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 13 },
  summaryRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md },
  summarySubValue: { color: colors.muted, fontFamily: typography.body, fontSize: 11, marginTop: 2 },
  summaryValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13 },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 26, letterSpacing: -0.4, marginTop: 2 },
});
