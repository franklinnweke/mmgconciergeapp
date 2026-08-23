import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@mmg/brand';
import type {
  GovernmentIdKind,
  OwnerVisibleProfile,
  SubmitOwnerVerificationCommand,
} from '@mmg/contracts';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import {
  InlineNotice,
  MobileHeader,
  PrimaryAction,
  SectionHeading,
} from '@/components/ui/mobile-primitives';
import { useAuth } from '@/core/auth/auth-context';
import { clearDraftUpload, getDraftUpload } from '../data/owner-draft-store';
import { createOwnerVerificationGateway } from '../data/owner-verification-gateway';
import { createOwnerVerificationRepository } from '../data/owner-verification-repository';
import type { LocalUploadedDocument } from '../domain/owner-application';
import { ownerCommandErrorMessage } from '../domain/owner-errors';

function documentKindLabel(kind: GovernmentIdKind) {
  switch (kind) {
    case 'national_id': return 'National ID (NIN)';
    case 'drivers_licence': return 'Driver’s licence';
    case 'international_passport': return 'International passport';
    case 'voters_card': return 'Permanent voter’s card';
    case 'residence_permit': return 'Residence permit';
  }
}

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
    void getDraftUpload(ownerId).then(setDraftUpload);
    const repository = createOwnerVerificationRepository();
    const unsubscribe = repository.subscribe(ownerId, setProfile, () => {});
    return () => unsubscribe();
  }, [auth.user?.uid]);

  const uploadId = params.uploadId || draftUpload?.uploadId || profile?.governmentId?.uploadId;
  const documentKind = params.documentKind || draftUpload?.documentKind || profile?.governmentId?.documentKind || 'national_id';
  const originalFileName = params.originalFileName || draftUpload?.originalFileName || 'government-identification.jpg';
  const hasValidDocument = Boolean(uploadId);

  const handleSubmit = async () => {
    if (submitting || !auth.user?.uid || !uploadId) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await auth.refreshUser();
      const gateway = createOwnerVerificationGateway();
      const command: SubmitOwnerVerificationCommand = {
        schemaVersion: 1,
        idempotencyKey,
        data: { uploadId, documentKind, originalFileName },
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
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MobileHeader onBack={() => router.back()} title="Review" />
        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>Review your application</Text>
          <Text style={styles.subtitle}>Check the details below before sending them to MMG operations for review.</Text>
        </View>

        {errorMessage ? <InlineNotice icon="alert-circle-outline" tone="danger">{errorMessage}</InlineNotice> : null}

        <View style={styles.section}>
          <SectionHeading>Application</SectionHeading>
          <SummaryRow label="Legal name" value={profile?.legalName || auth.profile?.displayName || 'Not provided'} />
          <SummaryRow label="Email" value={auth.user?.email || 'Not provided'} />
          <SummaryRow label="Phone" value={auth.user?.phoneNumber || 'Not provided'} />
          <SummaryRow
            label="Lagos address"
            value={profile?.address ? `${profile.address.line1}, ${profile.address.areaLabel}` : 'Not provided'}
          />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Government ID</Text>
            {hasValidDocument ? (
              <View style={styles.summaryValueBlock}>
                <Text style={styles.summaryValue}>{documentKindLabel(documentKind)}</Text>
                <Text numberOfLines={1} style={styles.summarySubValue}>{originalFileName}</Text>
              </View>
            ) : (
              <PressableScale accessibilityRole="button" onPress={() => router.push('/(owner)/id' as Href)}>
                <Text style={styles.uploadRequired}>Upload ID</Text>
              </PressableScale>
            )}
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Agreements</Text>
            <View style={styles.acceptedRow}>
              <Ionicons color={colors.success} name="checkmark-circle" size={17} />
              <Text style={styles.acceptedText}>Accepted</Text>
            </View>
          </View>
        </View>

        <InlineNotice icon="shield-checkmark-outline">
          Submitted documents remain private. Renters never receive your government ID or exact operating address.
        </InlineNotice>

        <View style={styles.primaryArea}>
          <PrimaryAction
            disabled={!hasValidDocument}
            icon="arrow-forward"
            label="Submit application"
            loading={submitting}
            onPress={() => void handleSubmit()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  acceptedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  acceptedText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  content: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  intro: {
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  primaryArea: {
    marginTop: spacing.xl,
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
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  summaryLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    width: 106,
  },
  summaryRow: {
    alignItems: 'flex-start',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 58,
    paddingVertical: spacing.md,
  },
  summarySubValue: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
    marginTop: 2,
    maxWidth: 200,
  },
  summaryValue: {
    color: colors.silver,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    textAlign: 'right',
  },
  summaryValueBlock: {
    alignItems: 'flex-end',
    flex: 1,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 31,
    letterSpacing: -0.55,
  },
  uploadRequired: {
    color: colors.goldStrong,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
});
