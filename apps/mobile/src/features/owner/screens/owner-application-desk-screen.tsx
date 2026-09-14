import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { OwnerVisibleProfile } from '@mmg/contracts';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { useAuth } from '@/core/auth/auth-context';
import { clearDraftUpload, getDraftUpload } from '../data/owner-draft-store';
import { createOwnerVerificationRepository } from '../data/owner-verification-repository';
import {
  computeApplicationCompleteness,
  getDeskPresentation,
  getStepLockReason,
  type LocalUploadedDocument,
} from '../domain/owner-application';

export function OwnerApplicationDeskScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<OwnerVisibleProfile | null>(null);
  const [draftUpload, setDraftUpload] = useState<LocalUploadedDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const handleRetry = () => {
    setLoading(true);
    setSyncError(null);
    setRetryTrigger((current) => current + 1);
  };

  useEffect(() => {
    const ownerId = auth.user?.uid;
    if (!ownerId) return;

    void getDraftUpload(ownerId).then((savedDraft) => {
      setDraftUpload(savedDraft);
    });

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
    () => computeApplicationCompleteness(
      profile,
      auth.user?.phoneNumber,
      draftUpload,
      auth.user?.emailVerified ?? false,
    ),
    [profile, auth.user?.phoneNumber, draftUpload, auth.user?.emailVerified],
  );

  const presentation = useMemo(
    () => getDeskPresentation(
      profile?.verificationStatus,
      completeness,
      profile?.lastDecisionReason,
    ),
    [profile?.verificationStatus, completeness, profile?.lastDecisionReason],
  );

  const handlePrimaryAction = () => {
    if (presentation.primaryAction) {
      router.push(presentation.primaryAction.route as Href);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <ScreenHeader showBrand={false} title="Owner Desk" />
      </View>

      {Platform.OS === 'web' ? (
        <View style={styles.previewBanner}>
          <Ionicons color={colors.goldStrong} name="flask-outline" size={16} />
          <Text style={styles.previewBannerText}>
            DEVELOPMENT FIXTURE · ACTIONS DO NOT CHANGE LIVE DATA
          </Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {loading ? (
            <View style={styles.loadingBox}>
              <Text accessibilityLiveRegion="polite" style={styles.loadingText}>
                Loading owner status…
              </Text>
            </View>
          ) : syncError ? (
            <View style={styles.errorStack}>
              <View style={styles.errorBox}>
                <Ionicons color={colors.danger} name="alert-circle-outline" size={20} />
                <Text style={styles.errorText}>{syncError}</Text>
              </View>
              <PressableScale accessibilityRole="button" onPress={handleRetry}>
                <View style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Retry</Text>
                </View>
              </PressableScale>
            </View>
          ) : (
            <>
              <Text style={styles.statusText}>{presentation.eyebrow}</Text>
              <Text style={styles.title}>{presentation.title}</Text>
              <Text style={styles.body}>{presentation.body}</Text>

              {presentation.lastDecisionReason && presentation.status === 'rejected' ? (
                <View style={styles.reasonCard}>
                  <Text style={styles.reasonTitle}>Reviewer feedback</Text>
                  <Text style={styles.reasonBody}>{presentation.lastDecisionReason}</Text>
                </View>
              ) : null}

              {presentation.showChecklist ? (
                <View style={styles.steps}>
                  <PressableScale
                    accessibilityLabel={
                      completeness.identityUnlocked
                        ? 'Owner Identity'
                        : `Owner Identity, locked. ${getStepLockReason('identity', completeness)}`
                    }
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !completeness.identityUnlocked }}
                    disabled={!completeness.identityUnlocked}
                    onPress={() => {
                      if (completeness.identityUnlocked) {
                        router.push('/(owner)/identity' as Href);
                      }
                    }}
                    style={styles.stepPressable}
                  >
                    <View style={[styles.stepRow, !completeness.identityUnlocked && styles.stepRowLocked]}>
                      <View
                        style={[
                          styles.stepIcon,
                          completeness.identityComplete && styles.stepIconComplete,
                          !completeness.identityUnlocked && styles.stepIconLocked,
                        ]}
                      >
                        <Ionicons
                          color={
                            completeness.identityComplete
                              ? colors.black
                              : completeness.identityUnlocked
                              ? colors.goldStrong
                              : colors.muted
                          }
                          name={
                            completeness.identityComplete
                              ? 'checkmark'
                              : completeness.identityUnlocked
                              ? 'person-outline'
                              : 'lock-closed-outline'
                          }
                          size={20}
                        />
                      </View>
                      <View style={styles.stepCopy}>
                        <Text style={[styles.stepTitle, !completeness.identityUnlocked && styles.stepTitleLocked]}>
                          Owner Identity
                        </Text>
                        <Text style={styles.stepDescription}>
                          {completeness.identityComplete
                            ? `${profile?.legalName} · ${profile?.address?.areaLabel}`
                            : completeness.identityUnlocked
                            ? 'Legal name, Lagos address and terms.'
                            : getStepLockReason('identity', completeness)}
                        </Text>
                      </View>
                    </View>
                  </PressableScale>

                  <PressableScale
                    accessibilityLabel={
                      completeness.phoneUnlocked
                        ? 'Nigerian Phone Number'
                        : `Nigerian Phone Number, locked. ${getStepLockReason('phone', completeness)}`
                    }
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !completeness.phoneUnlocked }}
                    disabled={!completeness.phoneUnlocked}
                    onPress={() => {
                      if (completeness.phoneUnlocked) {
                        router.push('/(owner)/phone' as Href);
                      }
                    }}
                    style={styles.stepPressable}
                  >
                    <View style={[styles.stepRow, !completeness.phoneUnlocked && styles.stepRowLocked]}>
                      <View
                        style={[
                          styles.stepIcon,
                          completeness.phoneComplete && styles.stepIconComplete,
                          !completeness.phoneUnlocked && styles.stepIconLocked,
                        ]}
                      >
                        <Ionicons
                          color={
                            completeness.phoneComplete
                              ? colors.black
                              : completeness.phoneUnlocked
                              ? colors.goldStrong
                              : colors.muted
                          }
                          name={
                            completeness.phoneComplete
                              ? 'checkmark'
                              : completeness.phoneUnlocked
                              ? 'call-outline'
                              : 'lock-closed-outline'
                          }
                          size={20}
                        />
                      </View>
                      <View style={styles.stepCopy}>
                        <Text style={[styles.stepTitle, !completeness.phoneUnlocked && styles.stepTitleLocked]}>
                          Nigerian Phone Number
                        </Text>
                        <Text style={styles.stepDescription}>
                          {completeness.phoneComplete
                            ? `${auth.user?.phoneNumber} (Verified)`
                            : completeness.phoneUnlocked
                            ? 'Verify an active Nigerian (+234) mobile number.'
                            : getStepLockReason('phone', completeness)}
                        </Text>
                      </View>
                    </View>
                  </PressableScale>

                  <PressableScale
                    accessibilityLabel={
                      completeness.idUnlocked
                        ? 'Government Identification'
                        : `Government Identification, locked. ${getStepLockReason('id', completeness)}`
                    }
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !completeness.idUnlocked }}
                    disabled={!completeness.idUnlocked}
                    onPress={() => {
                      if (completeness.idUnlocked) {
                        router.push('/(owner)/id' as Href);
                      }
                    }}
                    style={styles.stepPressable}
                  >
                    <View style={[styles.stepRow, !completeness.idUnlocked && styles.stepRowLocked]}>
                      <View
                        style={[
                          styles.stepIcon,
                          completeness.idUploaded && styles.stepIconComplete,
                          !completeness.idUnlocked && styles.stepIconLocked,
                        ]}
                      >
                        <Ionicons
                          color={
                            completeness.idUploaded
                              ? colors.black
                              : completeness.idUnlocked
                              ? colors.goldStrong
                              : colors.muted
                          }
                          name={
                            completeness.idUploaded
                              ? 'checkmark'
                              : completeness.idUnlocked
                              ? 'shield-checkmark-outline'
                              : 'lock-closed-outline'
                          }
                          size={20}
                        />
                      </View>
                      <View style={styles.stepCopy}>
                        <Text style={[styles.stepTitle, !completeness.idUnlocked && styles.stepTitleLocked]}>
                          Government Identification
                        </Text>
                        <Text style={styles.stepDescription}>
                          {completeness.idUploaded
                            ? 'Identification document uploaded privately'
                            : completeness.idUnlocked
                            ? 'Upload NIN, driver’s licence or passport.'
                            : getStepLockReason('id', completeness)}
                        </Text>
                      </View>
                    </View>
                  </PressableScale>
                </View>
              ) : null}

              {presentation.primaryAction ? (
                <PressableScale onPress={handlePrimaryAction} style={styles.primaryAction}>
                  <View style={styles.primaryButton}>
                    <Text style={styles.primaryText}>{presentation.primaryAction.label}</Text>
                  </View>
                </PressableScale>
              ) : null}

              <PressableScale onPress={() => void auth.signOut()} style={styles.signOutAction}>
                <View style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Sign out</Text>
                </View>
              </PressableScale>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 21, marginTop: spacing.xxs },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  errorBox: { alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  errorStack: { gap: spacing.md },
  errorText: { color: colors.danger, flex: 1, fontFamily: typography.body, fontSize: 13 },
  header: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  loadingBox: { alignItems: 'center', paddingVertical: spacing.xxl },
  loadingText: { color: colors.silver, fontFamily: typography.body, fontSize: 14 },
  previewBanner: { alignItems: 'center', backgroundColor: 'rgba(200,157,70,0.12)', borderBottomColor: colors.lineStrong, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  previewBannerText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1 },
  primaryAction: { marginTop: spacing.xl },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', minHeight: 54 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14, letterSpacing: 0.5 },
  reasonBody: { color: colors.ivory, fontFamily: typography.body, fontSize: 13, lineHeight: 19 },
  reasonCard: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)', borderRadius: radii.md, borderWidth: 1, marginVertical: spacing.md, padding: spacing.md },
  reasonTitle: { color: '#F87171', fontFamily: typography.bodySemiBold, fontSize: 12, marginBottom: 4 },
  screen: { backgroundColor: colors.black, flex: 1 },
  scroll: { paddingBottom: spacing.xxl },
  secondaryButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 52 },
  secondaryText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 14 },
  signOutAction: { marginTop: spacing.md },
  statusText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.2, marginBottom: spacing.xs },
  stepCopy: { flex: 1 },
  stepDescription: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: 2 },
  stepIcon: { alignItems: 'center', height: 42, justifyContent: 'center', width: 28 },
  stepIconComplete: { backgroundColor: colors.goldStrong, borderRadius: radii.pill, width: 28 },
  stepIconLocked: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radii.pill, width: 28 },
  stepPressable: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  stepRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  stepRowLocked: { opacity: 0.55 },
  steps: { marginTop: spacing.lg },
  stepTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14, marginTop: 2 },
  stepTitleLocked: { color: colors.silver },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 28, letterSpacing: -0.5, lineHeight: 34, marginBottom: spacing.xs },
});
