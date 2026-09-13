import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { OwnerVisibleProfile } from '@mmg/contracts';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { useReducedMotion } from '@/components/use-reduced-motion';
import { useAuth } from '@/core/auth/auth-context';
import { clearDraftUpload, getDraftUpload } from '../data/owner-draft-store';
import { createOwnerVerificationRepository } from '../data/owner-verification-repository';
import {
  computeApplicationCompleteness,
  getDeskPresentation,
  getStepLockReason,
  type LocalUploadedDocument,
} from '../domain/owner-application';

const heroImage = require('../../../../assets/images/fleet/prado-250-obsidian-hero.png');

export function OwnerApplicationDeskScreen() {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const [profile, setProfile] = useState<OwnerVisibleProfile | null>(null);
  const [draftUpload, setDraftUpload] = useState<LocalUploadedDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, { duration: 420, toValue: 1, useNativeDriver: true }).start();
  }, [opacity, reduceMotion]);

  const [retryTrigger, setRetryTrigger] = useState(0);

  const handleRetry = () => {
    setLoading(true);
    setSyncError(null);
    setRetryTrigger((c) => c + 1);
  };

  useEffect(() => {
    const ownerId = auth.user?.uid;
    if (!ownerId) return;

    // Check for locally saved draft document upload
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

        // If server profile is submitted/approved, clear local draft
        if (
          updatedProfile?.verificationStatus &&
          updatedProfile.verificationStatus !== 'draft' &&
          updatedProfile.verificationStatus !== 'rejected'
        ) {
          void clearDraftUpload(ownerId);
          setDraftUpload(null);
        }
      },
      (_err) => {
        setLoading(false);
        setSyncError('Your application status could not be loaded.');
      },
    );
    return () => unsubscribe();
  }, [auth.user?.uid, retryTrigger]);

  const completeness = useMemo(() => {
    return computeApplicationCompleteness(
      profile,
      auth.user?.phoneNumber,
      draftUpload,
      auth.user?.emailVerified ?? false,
    );
  }, [profile, auth.user?.phoneNumber, draftUpload, auth.user?.emailVerified]);

  const presentation = useMemo(() => {
    return getDeskPresentation(profile?.verificationStatus, completeness, profile?.lastDecisionReason);
  }, [profile?.verificationStatus, completeness, profile?.lastDecisionReason]);

  const handlePrimaryAction = () => {
    if (!presentation.primaryAction) return;
    router.push(presentation.primaryAction.route as Href);
  };

  const isWebPreview = Platform.OS === 'web';

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} style={styles.scrollView}>
        <View style={styles.hero}>
          <Image contentFit="cover" source={heroImage} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(4,4,4,0.18)', 'rgba(4,4,4,0.45)', colors.black]}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[styles.brandRow, { paddingTop: insets.top + spacing.md }]}
          >
            <BrandWordmark withLogo />
          </View>
        </View>

        {isWebPreview && (
          <View style={styles.previewBanner}>
            <Ionicons color={colors.goldStrong} name="flask-outline" size={16} />
            <Text style={styles.previewBannerText}>
              DEVELOPMENT FIXTURE · ACTIONS DO NOT CHANGE LIVE DATA
            </Text>
          </View>
        )}

        <Animated.View style={[styles.content, { opacity }]}>
          {loading ? (
            <View style={styles.loadingBox}>
              <Text accessibilityLiveRegion="polite" style={styles.loadingText}>
                Loading your owner desk...
              </Text>
            </View>
          ) : syncError ? (
            <View style={{ gap: spacing.md }}>
              <View style={styles.errorBox}>
                <Ionicons color={colors.danger} name="alert-circle-outline" size={20} />
                <Text style={styles.errorText}>{syncError}</Text>
              </View>
              <PressableScale onPress={handleRetry}>
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

              {presentation.lastDecisionReason && presentation.status === 'rejected' && (
                <View style={styles.reasonCard}>
                  <Text style={styles.reasonTitle}>Feedback from MMG Reviewer:</Text>
                  <Text style={styles.reasonBody}>{presentation.lastDecisionReason}</Text>
                </View>
              )}

              {presentation.showChecklist && (
                <View style={styles.steps}>
                  {/* Step 1: Owner Identity */}
                  <PressableScale
                    accessibilityLabel={
                      completeness.identityUnlocked
                        ? 'Owner Identity'
                        : `Owner Identity, locked. ${getStepLockReason('identity', completeness)}`
                    }
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
                              : !completeness.identityUnlocked
                              ? colors.muted
                              : colors.goldStrong
                          }
                          name={
                            completeness.identityComplete
                              ? 'checkmark'
                              : !completeness.identityUnlocked
                              ? 'lock-closed-outline'
                              : 'person-outline'
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
                            : !completeness.identityUnlocked
                            ? getStepLockReason('identity', completeness)
                            : 'Legal name, Lagos operating address, and platform terms.'}
                        </Text>
                      </View>
                      <Ionicons
                        color={colors.muted}
                        name={completeness.identityUnlocked ? 'chevron-forward' : 'lock-closed'}
                        size={completeness.identityUnlocked ? 18 : 16}
                      />
                    </View>
                  </PressableScale>

                  {/* Step 2: Nigerian Phone */}
                  <PressableScale
                    accessibilityLabel={
                      completeness.phoneUnlocked
                        ? 'Nigerian Phone Number'
                        : `Nigerian Phone Number, locked. ${getStepLockReason('phone', completeness)}`
                    }
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
                              : !completeness.phoneUnlocked
                              ? colors.muted
                              : colors.goldStrong
                          }
                          name={
                            completeness.phoneComplete
                              ? 'checkmark'
                              : !completeness.phoneUnlocked
                              ? 'lock-closed-outline'
                              : 'call-outline'
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
                            : !completeness.phoneUnlocked
                            ? getStepLockReason('phone', completeness)
                            : 'Link an active Nigerian (+234) mobile phone.'}
                        </Text>
                      </View>
                      <Ionicons
                        color={colors.muted}
                        name={completeness.phoneUnlocked ? 'chevron-forward' : 'lock-closed'}
                        size={completeness.phoneUnlocked ? 18 : 16}
                      />
                    </View>
                  </PressableScale>

                  {/* Step 3: Government ID */}
                  <PressableScale
                    accessibilityLabel={
                      completeness.idUnlocked
                        ? 'Government Identification'
                        : `Government Identification, locked. ${getStepLockReason('id', completeness)}`
                    }
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
                              : !completeness.idUnlocked
                              ? colors.muted
                              : colors.goldStrong
                          }
                          name={
                            completeness.idUploaded
                              ? 'checkmark'
                              : !completeness.idUnlocked
                              ? 'lock-closed-outline'
                              : 'shield-checkmark-outline'
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
                            : !completeness.idUnlocked
                            ? getStepLockReason('id', completeness)
                            : 'Photograph your NIN, Driver’s Licence, or Passport.'}
                        </Text>
                      </View>
                      <Ionicons
                        color={colors.muted}
                        name={completeness.idUnlocked ? 'chevron-forward' : 'lock-closed'}
                        size={completeness.idUnlocked ? 18 : 16}
                      />
                    </View>
                  </PressableScale>
                </View>
              )}

              {/* Primary Action Button */}
              {presentation.primaryAction && (
                <PressableScale onPress={handlePrimaryAction} style={{ marginTop: spacing.xl }}>
                  <View style={styles.primaryButton}>
                    <Text style={styles.primaryText}>{presentation.primaryAction.label}</Text>
                    <Ionicons color={colors.black} name="arrow-forward" size={18} />
                  </View>
                </PressableScale>
              )}

              {/* Sign Out Action */}
              <PressableScale onPress={() => void auth.signOut()} style={{ marginTop: spacing.md }}>
                <View style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Sign out</Text>
                </View>
              </PressableScale>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 22, marginTop: spacing.xxs },
  brandRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  errorBox: { alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  errorText: { color: colors.danger, flex: 1, fontFamily: typography.body, fontSize: 13 },
  hero: { height: 210 },
  loadingBox: { alignItems: 'center', paddingVertical: spacing.xxl },
  loadingText: { color: colors.silver, fontFamily: typography.body, fontSize: 14 },
  previewBanner: { alignItems: 'center', backgroundColor: 'rgba(200,157,70,0.12)', borderColor: colors.lineStrong, borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  previewBannerText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 54 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14, letterSpacing: 0.5 },
  reasonCard: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)', borderRadius: radii.md, borderWidth: 1, marginVertical: spacing.md, padding: spacing.md },
  reasonTitle: { color: '#F87171', fontFamily: typography.bodySemiBold, fontSize: 12, marginBottom: 4 },
  reasonBody: { color: colors.ivory, fontFamily: typography.body, fontSize: 13, lineHeight: 19 },
  screen: { backgroundColor: colors.black, flex: 1 },
  scroll: { paddingBottom: spacing.xxl },
  scrollView: { flex: 1 },
  secondaryButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, justifyContent: 'center', minHeight: 52 },
  secondaryText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 14 },
  stepCopy: { flex: 1 },
  stepDescription: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: 2 },
  stepIcon: { alignItems: 'center', height: 42, justifyContent: 'center', width: 28 },
  stepIconComplete: { backgroundColor: colors.goldStrong, borderRadius: radii.pill, width: 28 },
  stepPressable: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  stepRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  stepRowLocked: { opacity: 0.55 },
  stepIconLocked: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radii.pill, width: 28 },
  stepTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14, marginTop: 2 },
  stepTitleLocked: { color: colors.silver },
  statusText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.2, marginBottom: spacing.xs },
  steps: { marginTop: spacing.lg },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 32, letterSpacing: -0.6, lineHeight: 38, marginBottom: spacing.xs, marginTop: spacing.xxs },
});
