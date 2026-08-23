import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@mmg/brand';
import type { OwnerVisibleProfile } from '@mmg/contracts';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { InlineNotice, PrimaryAction, SecondaryAction } from '@/components/ui/mobile-primitives';
import { useAuth } from '@/core/auth/auth-context';
import { clearDraftUpload, getDraftUpload } from '../data/owner-draft-store';
import { createOwnerVerificationRepository } from '../data/owner-verification-repository';
import {
  computeApplicationCompleteness,
  getDeskPresentation,
  type LocalUploadedDocument,
} from '../domain/owner-application';

const heroImage = require('../../../../assets/images/fleet/prado-250-obsidian-hero.png');

export function OwnerApplicationDeskScreen() {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<OwnerVisibleProfile | null>(null);
  const [draftUpload, setDraftUpload] = useState<LocalUploadedDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const handleRetry = () => {
    setLoading(true);
    setSyncError(null);
    setRetryTrigger((count) => count + 1);
  };

  useEffect(() => {
    const ownerId = auth.user?.uid;
    if (!ownerId) return;

    void getDraftUpload(ownerId).then(setDraftUpload);

    const repository = createOwnerVerificationRepository();
    const unsubscribe = repository.subscribe(
      ownerId,
      (updatedProfile) => {
        setProfile(updatedProfile);
        setLoading(false);
        setSyncError(null);
        if (
          updatedProfile?.verificationStatus &&
          updatedProfile.verificationStatus !== 'draft' &&
          updatedProfile.verificationStatus !== 'rejected'
        ) {
          void clearDraftUpload(ownerId);
          setDraftUpload(null);
        }
      },
      () => {
        setLoading(false);
        setSyncError('Your application status could not be loaded.');
      },
    );
    return () => unsubscribe();
  }, [auth.user?.uid, retryTrigger]);

  const completeness = useMemo(
    () => computeApplicationCompleteness(profile, auth.user?.phoneNumber, draftUpload),
    [auth.user?.phoneNumber, draftUpload, profile],
  );
  const presentation = useMemo(
    () => getDeskPresentation(profile?.verificationStatus, completeness, profile?.lastDecisionReason),
    [completeness, profile?.lastDecisionReason, profile?.verificationStatus],
  );
  const completedCount = [
    completeness.identityComplete,
    completeness.phoneComplete,
    completeness.idUploaded,
  ].filter(Boolean).length;

  const handlePrimaryAction = () => {
    if (presentation.primaryAction) router.push(presentation.primaryAction.route as Href);
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image contentFit="cover" source={heroImage} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(4,4,4,.16)', 'rgba(4,4,4,.28)', colors.black]}
            locations={[0, 0.52, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.brandRow, { paddingTop: insets.top + spacing.md }]}>
            <BrandWordmark withLogo />
          </View>
        </View>

        <View style={styles.content}>
          {Platform.OS === 'web' && process.env.NODE_ENV !== 'production' ? (
            <InlineNotice icon="flask-outline">Development preview. Actions do not change live data.</InlineNotice>
          ) : null}

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.goldStrong} size="small" />
              <Text style={styles.loadingText}>Loading owner account</Text>
            </View>
          ) : syncError ? (
            <View style={styles.errorBlock}>
              <InlineNotice icon="cloud-offline-outline" tone="danger">{syncError}</InlineNotice>
              <PrimaryAction icon="refresh" label="Try again" onPress={handleRetry} />
            </View>
          ) : (
            <>
              <View style={styles.intro}>
                <Text style={styles.statusText}>{presentation.eyebrow}</Text>
                <Text accessibilityRole="header" style={styles.title}>{presentation.title}</Text>
                <Text style={styles.body}>{presentation.body}</Text>
              </View>

              {presentation.lastDecisionReason && presentation.status === 'rejected' ? (
                <InlineNotice icon="information-circle-outline" tone="danger">
                  {presentation.lastDecisionReason}
                </InlineNotice>
              ) : null}

              {presentation.showChecklist ? (
                <View style={styles.checklistSection}>
                  <View style={styles.progressRow}>
                    <Text style={styles.progressTitle}>Application</Text>
                    <Text style={styles.progressCount}>{completedCount} of 3 complete</Text>
                  </View>
                  <ChecklistRow
                    complete={completeness.identityComplete}
                    detail={
                      completeness.identityComplete
                        ? `${profile?.legalName} · ${profile?.address?.areaLabel}`
                        : 'Legal name, Lagos address and agreements'
                    }
                    label="Identity and address"
                    onPress={() => router.push('/(owner)/identity' as Href)}
                  />
                  <ChecklistRow
                    complete={completeness.phoneComplete}
                    detail={
                      completeness.phoneComplete
                        ? auth.user?.phoneNumber ?? 'Verified Nigerian number'
                        : 'Verify an active Nigerian phone number'
                    }
                    label="Phone number"
                    onPress={() => router.push('/(owner)/phone' as Href)}
                  />
                  <ChecklistRow
                    complete={completeness.idUploaded}
                    detail={
                      completeness.idUploaded
                        ? 'Government ID uploaded privately'
                        : 'NIN, driver’s licence or passport'
                    }
                    label="Government ID"
                    onPress={() => router.push('/(owner)/id' as Href)}
                  />
                </View>
              ) : null}

              {presentation.primaryAction ? (
                <View style={styles.primaryArea}>
                  <PrimaryAction
                    icon="arrow-forward"
                    label={presentation.primaryAction.label}
                    onPress={handlePrimaryAction}
                  />
                </View>
              ) : null}

              <View style={styles.signOutArea}>
                <SecondaryAction icon="log-out-outline" label="Sign out" onPress={() => void auth.signOut()} />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ChecklistRow({
  complete,
  detail,
  label,
  onPress,
}: {
  complete: boolean;
  detail: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale accessibilityRole="button" onPress={onPress}>
      <View style={styles.checklistRow}>
        <View style={styles.checkIcon}>
          <Ionicons
            color={complete ? colors.goldStrong : colors.muted}
            name={complete ? 'checkmark-circle' : 'ellipse-outline'}
            size={21}
          />
        </View>
        <View style={styles.checkCopy}>
          <Text style={styles.checkTitle}>{label}</Text>
          <Text style={styles.checkDetail}>{detail}</Text>
        </View>
        <Ionicons color={colors.muted} name="chevron-forward" size={18} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  body: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
    maxWidth: 360,
  },
  brandRow: {
    paddingHorizontal: spacing.md,
  },
  checkCopy: { flex: 1 },
  checkDetail: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  checkIcon: {
    alignItems: 'center',
    width: 24,
  },
  checklistRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    paddingVertical: spacing.sm,
  },
  checklistSection: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  checkTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
  },
  content: {
    paddingHorizontal: spacing.md,
  },
  errorBlock: {
    gap: spacing.md,
  },
  hero: {
    height: 245,
  },
  intro: {
    marginTop: spacing.sm,
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  loadingText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  primaryArea: {
    marginTop: spacing.xl,
  },
  progressCount: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  progressRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  progressTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 21,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  scroll: {
    paddingBottom: spacing.xxl,
  },
  signOutArea: {
    marginTop: spacing.sm,
  },
  statusText: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 31,
    letterSpacing: -0.55,
    lineHeight: 37,
  },
});
