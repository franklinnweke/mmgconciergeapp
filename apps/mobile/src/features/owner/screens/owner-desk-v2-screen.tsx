import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { OwnerVisibleProfile } from '@mmg/contracts';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { useAuth } from '@/core/auth/auth-context';
import { clearDraftUpload, getDraftUpload } from '../data/owner-draft-store';
import { createOwnerVerificationRepository } from '../data/owner-verification-repository';
import {
  computeApplicationCompleteness,
  getStepLockReason,
  type LocalUploadedDocument,
  type OwnerApplicationStep,
} from '../domain/owner-application';

function stepRoute(step: OwnerApplicationStep): Href {
  if (step === 'phone') return '/(owner)/phone' as Href;
  if (step === 'id') return '/(owner)/id' as Href;
  if (step === 'submit') return '/(owner)/submit' as Href;
  return '/(owner)/identity' as Href;
}

export function OwnerDeskV2Screen() {
  const auth = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<OwnerVisibleProfile | null>(null);
  const [draftUpload, setDraftUpload] = useState<LocalUploadedDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const ownerId = auth.user?.uid;
    if (!ownerId) return undefined;
    void getDraftUpload(ownerId).then(setDraftUpload);
    const repository = createOwnerVerificationRepository();
    return repository.subscribe(
      ownerId,
      (next) => {
        setProfile(next);
        setError(null);
        setLoading(false);
        if (next?.verificationStatus && !['draft', 'rejected'].includes(next.verificationStatus)) {
          void clearDraftUpload(ownerId);
          setDraftUpload(null);
        }
      },
      () => {
        setError('Your owner application could not be loaded.');
        setLoading(false);
      },
    );
  }, [auth.user?.uid, retryKey]);

  const completeness = useMemo(() => computeApplicationCompleteness(
    profile,
    auth.user?.phoneNumber,
    draftUpload,
    auth.user?.emailVerified ?? false,
  ), [profile, auth.user?.phoneNumber, auth.user?.emailVerified, draftUpload]);

  const status = profile?.verificationStatus ?? 'draft';
  const editable = status === 'draft' || status === 'rejected';
  const rejectedIdWasCleared = status === 'rejected' && profile?.governmentId?.status === 'cleared';

  const headerRight = (
    <PressableScale accessibilityLabel="Back to renting" onPress={() => router.replace('/(renter)' as Href)} style={styles.headerAction}>
      <Ionicons color={colors.ivory} name="storefront-outline" size={18} />
    </PressableScale>
  );

  const primary = (() => {
    if (status === 'approved') return { label: 'Manage fleet', route: '/(owner)/fleet' as Href };
    if (status === 'rejected') {
      if (rejectedIdWasCleared || !completeness.idUploaded) return { label: 'Upload replacement ID', route: '/(owner)/id' as Href };
      return { label: 'Update application', route: '/(owner)/identity' as Href };
    }
    if (status !== 'draft') return null;
    if (completeness.canSubmit) return { label: 'Review and submit', route: '/(owner)/submit' as Href };
    return { label: 'Continue application', route: stepRoute(completeness.firstIncompleteStep ?? 'identity') };
  })();

  const copy = (() => {
    if (status === 'approved') return ['APPROVED', 'You are verified.', 'Manage your fleet, availability, requests and bookings from the owner tools.'];
    if (status === 'submitted') return ['SUBMITTED', 'Your file is with MMG.', 'MMG operations has received your owner application for review.'];
    if (status === 'under_review') return ['UNDER REVIEW', 'MMG is reviewing your file.', 'Your identity, address and verification document are being checked by authorized operations staff.'];
    if (status === 'rejected') return ['CHANGES REQUESTED', 'Your application needs an update.', profile?.lastDecisionReason || 'Review the feedback, correct the relevant step and submit again.'];
    if (status === 'suspended') return ['SUSPENDED', 'Your owner access is paused.', profile?.lastDecisionReason || 'Contact MMG Concierge support for details.'];
    if (status === 'revoked') return ['REVOKED', 'This owner account cannot continue.', profile?.lastDecisionReason || 'This owner capability has been revoked by MMG operations.'];
    return ['OWNER DESK', completeness.canSubmit ? 'Your application is ready.' : 'Prepare your owner application.', completeness.canSubmit ? 'Review the completed details and send them to MMG.' : 'Complete identity, Nigerian phone verification and government ID.'];
  })();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}><ScreenHeader right={headerRight} showBrand={false} title="Owner Desk" /></View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.goldStrong} /><Text style={styles.muted}>Loading owner status…</Text></View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <PressableScale onPress={() => { setLoading(true); setError(null); setRetryKey((value) => value + 1); }}><Text style={styles.link}>Try again</Text></PressableScale>
          </View>
        ) : (
          <>
            <Text style={styles.eyebrow}>{copy[0]}</Text>
            <Text style={styles.title}>{copy[1]}</Text>
            <Text style={styles.body}>{copy[2]}</Text>

            {status === 'rejected' && profile?.lastDecisionReason ? (
              <View style={styles.feedback}>
                <Text style={styles.feedbackTitle}>MMG feedback</Text>
                <Text style={styles.body}>{profile.lastDecisionReason}</Text>
              </View>
            ) : null}

            {editable ? (
              <View style={styles.steps}>
                <StepRow
                  complete={completeness.identityComplete}
                  label="Owner identity"
                  detail={completeness.identityComplete ? `${profile?.legalName} · ${profile?.address?.areaLabel}` : 'Legal name, Lagos address and owner agreements.'}
                  locked={!completeness.identityUnlocked}
                  lockReason={getStepLockReason('identity', completeness)}
                  onPress={() => router.push('/(owner)/identity' as Href)}
                />
                <StepRow
                  complete={completeness.phoneComplete}
                  label="Nigerian phone number"
                  detail={completeness.phoneComplete ? `${auth.user?.phoneNumber} · verified` : 'Verify an active +234 mobile number.'}
                  locked={!completeness.phoneUnlocked}
                  lockReason={getStepLockReason('phone', completeness)}
                  onPress={() => router.push('/(owner)/phone' as Href)}
                />
                <StepRow
                  complete={completeness.idUploaded && !rejectedIdWasCleared}
                  label="Government identification"
                  detail={completeness.idUploaded && !rejectedIdWasCleared ? 'Identification uploaded privately.' : 'Upload NIN, driver’s licence, passport, PVC or CERPAC.'}
                  locked={!completeness.idUnlocked}
                  lockReason={getStepLockReason('id', completeness)}
                  onPress={() => router.push('/(owner)/id' as Href)}
                />
              </View>
            ) : null}

            {primary ? (
              <PressableScale onPress={() => router.push(primary.route)}>
                <View style={styles.primaryButton}><Text style={styles.primaryText}>{primary.label}</Text></View>
              </PressableScale>
            ) : null}

            {status === 'approved' ? (
              <PressableScale onPress={() => router.push('/(owner)/owner-bookings' as Href)}>
                <View style={styles.secondaryButton}><Text style={styles.secondaryText}>Requests & bookings</Text></View>
              </PressableScale>
            ) : null}

            <PressableScale disabled={auth.signingOut} onPress={() => void auth.signOut()}>
              <View style={styles.signOut}><Text style={styles.secondaryText}>Sign out</Text></View>
            </PressableScale>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StepRow({ complete, label, detail, locked, lockReason, onPress }: { complete: boolean; label: string; detail: string; locked: boolean; lockReason: string | null; onPress(): void }) {
  return (
    <PressableScale accessibilityState={{ disabled: locked }} disabled={locked} onPress={onPress}>
      <View style={[styles.step, locked && styles.stepLocked]}>
        <View style={[styles.stepIcon, complete && styles.stepIconComplete]}>
          <Ionicons color={complete ? colors.black : locked ? colors.muted : colors.goldStrong} name={complete ? 'checkmark' : locked ? 'lock-closed-outline' : 'arrow-forward'} size={17} />
        </View>
        <View style={styles.stepCopy}>
          <Text style={styles.stepTitle}>{label}</Text>
          <Text style={styles.muted}>{locked ? lockReason : detail}</Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  content: { gap: spacing.lg, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  eyebrow: { color: colors.muted, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1 },
  error: { color: colors.danger, fontFamily: typography.body, fontSize: 13 },
  feedback: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingVertical: spacing.md },
  feedbackTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13 },
  header: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerAction: { alignItems: 'center', borderColor: colors.line, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, height: 40, justifyContent: 'center', width: 40 },
  link: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 13, padding: spacing.sm },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', minHeight: 52 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  screen: { backgroundColor: colors.black, flex: 1 },
  secondaryButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 50 },
  secondaryText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 13 },
  signOut: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  step: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 72, paddingVertical: spacing.sm },
  stepCopy: { flex: 1, gap: 3 },
  stepIcon: { alignItems: 'center', borderColor: colors.line, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, height: 36, justifyContent: 'center', width: 36 },
  stepIconComplete: { backgroundColor: colors.ivory, borderColor: colors.ivory },
  stepLocked: { opacity: 0.6 },
  stepTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14 },
  steps: { gap: 0 },
  title: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 28 },
});
