import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import {
  type GovernmentIdKind,
  type OwnerVisibleProfile,
  type SubmitOwnerVerificationCommand,
} from '@mmg/contracts';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { useAuth } from '@/core/auth/auth-context';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import { clearDraftUpload, getDraftUpload } from '../data/owner-draft-store';
import { createOwnerVerificationGateway } from '../data/owner-verification-gateway';
import { createOwnerVerificationRepository } from '../data/owner-verification-repository';
import {
  canReusePersistedGovernmentId,
  computeApplicationCompleteness,
  hasCurrentOwnerAgreements,
  isOwnerApplicationEditable,
  type LocalUploadedDocument,
} from '../domain/owner-application';
import { ownerCommandErrorMessage } from '../domain/owner-errors';
import { useOwnerIdUpload } from '../domain/owner-id-upload-context';

const DOCUMENT_LABELS: Record<GovernmentIdKind, string> = {
  national_id: 'National ID / NIN',
  drivers_licence: 'Driver’s licence',
  international_passport: 'International passport',
  voters_card: 'Permanent voter’s card',
  residence_permit: 'Residence permit / CERPAC',
};

export function OwnerSubmitV2Screen() {
  const auth = useAuth();
  const router = useRouter();
  const upload = useOwnerIdUpload();
  const [profile, setProfile] = useState<OwnerVisibleProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(Boolean(auth.user?.uid));
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [draft, setDraft] = useState<LocalUploadedDocument | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => `submit-owner-${auth.user?.uid ?? 'anon'}-${Date.now()}`);

  useEffect(() => {
    if (!auth.user?.uid || auth.signingOut) return undefined;
    void getDraftUpload(auth.user.uid).then(setDraft);
    return createOwnerVerificationRepository().subscribe(
      auth.user.uid,
      (next) => {
        if (auth.signingOut) return;
        setProfile(next);
        setProfileLoadError(null);
        setProfileLoading(false);
      },
      () => {
        if (auth.signingOut) return;
        setProfileLoadError('We could not load your owner application. Try again.');
        setProfileLoading(false);
      },
    );
  }, [auth.signingOut, auth.user?.uid, retryKey]);

  const rejectedUploadId =
    profile?.verificationStatus === 'rejected'
      ? profile.governmentId?.uploadId ?? null
      : null;
  const candidateDraft = upload.uploadedDoc || draft;
  const effectiveDraft =
    candidateDraft && candidateDraft.uploadId !== rejectedUploadId
      ? candidateDraft
      : null;
  const existingProfileDocument =
    canReusePersistedGovernmentId(profile) ? profile?.governmentId ?? null : null;
  const uploadId = effectiveDraft?.uploadId || existingProfileDocument?.uploadId;
  const documentKind = effectiveDraft?.documentKind || upload.candidate?.documentKind || existingProfileDocument?.documentKind || 'national_id';
  const originalFileName = effectiveDraft?.originalFileName || upload.candidate?.fileName || 'government-identification.jpg';
  const uploading = upload.status === 'uploading';
  const uploadFailed = upload.status === 'error';
  const editable = !profileLoadError && isOwnerApplicationEditable(profile?.verificationStatus);
  const completeness = computeApplicationCompleteness(profile, auth.user?.phoneNumber, effectiveDraft, Boolean(auth.user?.emailVerified));
  const agreementsCurrent = hasCurrentOwnerAgreements(profile);
  const canSubmit = !profileLoading && !profileLoadError && editable && completeness.canSubmit && Boolean(uploadId) && agreementsCurrent && !uploading && !uploadFailed;

  const submit = async () => {
    if (!auth.user?.uid || !uploadId || !canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await auth.refreshUser();
      const command: SubmitOwnerVerificationCommand = {
        schemaVersion: 1,
        idempotencyKey,
        data: { uploadId, documentKind, originalFileName },
      };
      await createOwnerVerificationGateway().submitOwnerVerification(command);
      await clearDraftUpload(auth.user.uid);
      upload.reset();
      router.replace('/(owner)' as Href);
    } catch (caught) {
      setError(ownerCommandErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const address = profile?.address
    ? [profile.address.line1, profile.address.line2, profile.address.areaLabel, 'Lagos'].filter(Boolean).join(', ')
    : 'Not provided';

  if (auth.signingOut) {
    return <AuthLoadingScreen message="Signing out" />;
  }

  if (profileLoading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}><ScreenHeader onBack={() => router.back()} showBrand={false} title="Review & submit" /></View>
        <View style={styles.center}><ActivityIndicator color={colors.goldStrong} /><Text style={styles.muted}>Loading owner application…</Text></View>
      </SafeAreaView>
    );
  }

  if (profileLoadError) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}><ScreenHeader onBack={() => router.back()} showBrand={false} title="Review & submit" /></View>
        <View style={styles.center}>
          <Text accessibilityLiveRegion="polite" style={styles.error}>{profileLoadError}</Text>
          <PressableScale onPress={() => { setProfileLoading(true); setProfileLoadError(null); setRetryKey((value) => value + 1); }}><Text style={styles.link}>Try again</Text></PressableScale>
          <PressableScale onPress={() => router.replace('/(owner)' as Href)}><Text style={styles.link}>Return to Owner Desk</Text></PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}><ScreenHeader onBack={() => router.back()} showBrand={false} title="Review & submit" /></View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {(error || (uploadFailed && upload.errorMessage)) ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error || upload.errorMessage}</Text> : null}

        <SummaryRow label="Legal name" value={profile?.legalName || auth.profile?.displayName || 'Not provided'} onEdit={() => router.push('/(owner)/identity' as Href)} />
        <SummaryRow label="Verified email" value={auth.user?.email || 'Not provided'} />
        <SummaryRow label="Nigerian phone" value={auth.user?.phoneNumber || 'Not provided'} onEdit={() => router.push('/(owner)/phone' as Href)} />
        <SummaryRow label="Lagos address" value={address} onEdit={() => router.push('/(owner)/identity' as Href)} />

        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.label}>Government ID</Text>
            {uploading ? (
              <View style={styles.inline}><ActivityIndicator color={colors.goldStrong} size="small" /><Text style={styles.value}>Uploading identification…</Text></View>
            ) : uploadFailed ? (
              <><Text style={styles.error}>Upload failed</Text><PressableScale onPress={() => auth.user?.uid && upload.retryUpload(auth.user.uid)}><Text style={styles.link}>Retry upload</Text></PressableScale></>
            ) : uploadId ? (
              <><Text style={styles.value}>{DOCUMENT_LABELS[documentKind]}</Text><Text numberOfLines={1} style={styles.muted}>{originalFileName}</Text></>
            ) : (
              <Text style={styles.error}>
                {profile?.verificationStatus === 'rejected' ? 'Replacement upload required' : 'Upload required'}
              </Text>
            )}
          </View>
          <PressableScale onPress={() => router.push('/(owner)/id' as Href)}><Text style={styles.link}>Edit</Text></PressableScale>
        </View>

        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.label}>Owner agreements</Text>
            <View style={styles.inline}><Ionicons color={agreementsCurrent ? colors.success : colors.goldStrong} name={agreementsCurrent ? 'checkmark-circle' : 'alert-circle-outline'} size={15} /><Text style={styles.value}>{agreementsCurrent ? 'Current agreements accepted' : 'Review the updated agreements'}</Text></View>
            {profile?.termsAcceptedAt ? <Text style={styles.muted}>Accepted {new Date(profile.termsAcceptedAt).toLocaleDateString('en-GB')}</Text> : null}
          </View>
          <PressableScale onPress={() => router.push('/(owner)/identity' as Href)}><Text style={styles.link}>Edit</Text></PressableScale>
        </View>

        {!editable ? (
          <View style={styles.notice}><Text style={styles.muted}>This application is no longer editable. Return to Owner Desk for its current status.</Text><PressableScale onPress={() => router.replace('/(owner)' as Href)}><Text style={styles.link}>Return to Owner Desk</Text></PressableScale></View>
        ) : (
          <PressableScale disabled={!canSubmit || submitting} onPress={() => void submit()} style={!canSubmit || submitting ? styles.disabled : undefined}>
            <View style={styles.primaryButton}>{submitting ? <ActivityIndicator color={colors.black} /> : <Text style={styles.primaryText}>Submit application</Text>}</View>
          </PressableScale>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>
      {onEdit ? <PressableScale onPress={onEdit}><Text style={styles.link}>Edit</Text></PressableScale> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.lg },
  content: { gap: 0, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontFamily: typography.body, fontSize: 13, lineHeight: 19, paddingVertical: spacing.sm },
  flex: { flex: 1, gap: 3 },
  header: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  inline: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  intro: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, paddingBottom: spacing.lg },
  label: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 12 },
  link: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 13, padding: spacing.sm },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 11 },
  notice: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.sm, paddingTop: spacing.lg },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.button, justifyContent: 'center', marginTop: spacing.xl, minHeight: 52 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  row: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 72, paddingVertical: spacing.md },
  screen: { backgroundColor: colors.black, flex: 1 },
  value: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 13, lineHeight: 18 },
});
