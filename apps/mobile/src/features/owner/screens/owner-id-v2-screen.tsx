import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { GovernmentIdKind, OwnerVisibleProfile } from '@mmg/contracts';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { useAuth } from '@/core/auth/auth-context';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import { createOwnerVerificationRepository } from '../data/owner-verification-repository';
import { computeOwnerIdScreenState } from '../domain/owner-application';
import { validateOwnerIdCandidate } from '../domain/owner-id-preflight';
import { useOwnerIdUpload } from '../domain/owner-id-upload-context';

const DOCUMENTS: { kind: GovernmentIdKind; label: string; detail: string }[] = [
  { kind: 'national_id', label: 'National ID / NIN', detail: 'NIMC digital slip or physical identity card' },
  { kind: 'drivers_licence', label: 'Driver’s licence', detail: 'Valid FRSC-issued licence' },
  { kind: 'international_passport', label: 'International passport', detail: 'Nigerian passport data page' },
  { kind: 'voters_card', label: 'Permanent voter’s card', detail: 'INEC-issued PVC' },
  { kind: 'residence_permit', label: 'Residence permit / CERPAC', detail: 'Valid Nigerian residence permit' },
];

export function OwnerIdV2Screen() {
  const auth = useAuth();
  const router = useRouter();
  const { startUpload } = useOwnerIdUpload();
  const [profile, setProfile] = useState<OwnerVisibleProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(auth.user?.uid));
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [documentKind, setDocumentKind] = useState<GovernmentIdKind>('national_id');
  const [selected, setSelected] = useState<{ uri: string; fileName: string; mimeType: string; fileSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.user?.uid || auth.signingOut) return undefined;
    return createOwnerVerificationRepository().subscribe(
      auth.user.uid,
      (next) => {
        if (auth.signingOut) return;
        setProfile(next);
        setProfileLoadError(null);
        setLoading(false);
      },
      () => {
        if (auth.signingOut) return;
        setProfileLoadError('We could not load your owner application. Try again.');
        setLoading(false);
      },
    );
  }, [auth.signingOut, auth.user?.uid, retryKey]);

  const emailVerified = Boolean(auth.user?.emailVerified);
  const {
    identityComplete,
    prerequisitesMet,
    editable,
    hasExistingDocument,
    canContinueToReview,
  } = computeOwnerIdScreenState({
    profile,
    phoneNumber: auth.user?.phoneNumber,
    emailVerified,
    hasSelectedAsset: Boolean(selected),
  });

  const acceptAsset = (asset: ImagePicker.ImagePickerAsset) => {
    try {
      const validated = validateOwnerIdCandidate({ uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType, fileSize: asset.fileSize }, `owner-id-${Date.now()}`);
      setSelected({ uri: validated.uri, fileName: validated.fileName, mimeType: validated.mimeType, fileSize: validated.fileSize });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This identification photo could not be used.');
    }
  };

  const takePhoto = async () => {
    if (!prerequisitesMet || !editable || profileLoadError) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Allow camera access to photograph your government ID for owner verification.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: false });
    if (!result.canceled && result.assets[0]) acceptAsset(result.assets[0]);
  };

  const choosePhoto = async () => {
    if (!prerequisitesMet || !editable || profileLoadError) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo-library access to choose a government ID photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: false });
    if (!result.canceled && result.assets[0]) acceptAsset(result.assets[0]);
  };

  const continueToReview = () => {
    if (!auth.user?.uid || !canContinueToReview || profileLoadError) return;
    if (selected) startUpload(auth.user.uid, selected, documentKind);
    router.push('/(owner)/submit' as Href);
  };

  const prerequisiteAction = () => {
    if (!emailVerified) router.replace('/auth' as Href);
    else if (!identityComplete) router.push('/(owner)/identity' as Href);
    else router.push('/(owner)/phone' as Href);
  };

  const retryProfile = () => {
    setLoading(true);
    setProfileLoadError(null);
    setRetryKey((value) => value + 1);
  };

  if (auth.signingOut) {
    return <AuthLoadingScreen message="Signing out" />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}><ScreenHeader onBack={() => router.back()} showBrand={false} title="Government ID" /></View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.privacy}>
          <Ionicons color={colors.goldStrong} name="lock-closed-outline" size={18} />
          <Text style={styles.privacyText}>Your ID stays private and is used only for owner verification. Deletion is triggered after the final verification decision, while verification and audit metadata is retained.</Text>
        </View>

        {loading ? <View style={styles.center}><ActivityIndicator color={colors.goldStrong} /><Text style={styles.muted}>Checking application status…</Text></View> : null}
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}

        {!loading && profileLoadError ? (
          <View style={styles.blocked}>
            <Text style={styles.title}>Owner application unavailable</Text>
            <Text accessibilityLiveRegion="polite" style={styles.muted}>{profileLoadError}</Text>
            <PressableScale onPress={retryProfile}><Text style={styles.link}>Try again</Text></PressableScale>
            <PressableScale onPress={() => router.replace('/(owner)' as Href)}><Text style={styles.link}>Return to Owner Desk</Text></PressableScale>
          </View>
        ) : !loading && !editable ? (
          <View style={styles.blocked}>
            <Text style={styles.title}>Application is not editable</Text>
            <Text style={styles.muted}>Return to Owner Desk to see the current review status.</Text>
            <PressableScale onPress={() => router.replace('/(owner)' as Href)}><Text style={styles.link}>Return to Owner Desk</Text></PressableScale>
          </View>
        ) : !loading && !prerequisitesMet ? (
          <View style={styles.blocked}>
            <Text style={styles.title}>Complete the previous step first</Text>
            <Text style={styles.muted}>{!emailVerified ? 'Verify your email before uploading owner identification.' : !identityComplete ? 'Complete owner identity and accept the current agreements first.' : 'Verify your Nigerian +234 phone number first.'}</Text>
            <PressableScale onPress={prerequisiteAction}><Text style={styles.link}>Continue setup</Text></PressableScale>
          </View>
        ) : !loading ? (
          <>
            <Text style={styles.title}>Choose identification</Text>
            <Text style={styles.muted}>Use one current Nigerian identity document.</Text>
            <View style={styles.documentList}>
              {DOCUMENTS.map((document) => {
                const active = document.kind === documentKind;
                return (
                  <PressableScale key={document.kind} onPress={() => setDocumentKind(document.kind)}>
                    <View style={styles.documentRow}>
                      <Ionicons color={active ? colors.goldStrong : colors.muted} name={active ? 'radio-button-on' : 'radio-button-off'} size={20} />
                      <View style={styles.flex}><Text style={styles.documentTitle}>{document.label}</Text><Text style={styles.muted}>{document.detail}</Text></View>
                    </View>
                  </PressableScale>
                );
              })}
            </View>

            <View style={styles.guidance}>
              <Ionicons color={colors.muted} name="scan-outline" size={18} />
              <Text style={styles.muted}>Make sure all four corners are visible, the text is legible, and there is no flash glare.</Text>
            </View>

            {selected ? (
              <View style={styles.preview}>
                <Image contentFit="contain" source={{ uri: selected.uri }} style={styles.previewImage} />
                <View style={styles.previewFooter}><Text numberOfLines={1} style={styles.fileName}>{selected.fileName}</Text><PressableScale onPress={() => setSelected(null)}><Text style={styles.link}>Change</Text></PressableScale></View>
              </View>
            ) : (
              <View style={styles.captureRow}>
                <PressableScale onPress={() => void takePhoto()} style={styles.capture}><Ionicons color={colors.goldStrong} name="camera-outline" size={23} /><Text style={styles.captureText}>Take photo</Text></PressableScale>
                <PressableScale onPress={() => void choosePhoto()} style={styles.capture}><Ionicons color={colors.goldStrong} name="images-outline" size={23} /><Text style={styles.captureText}>Choose photo</Text></PressableScale>
              </View>
            )}

            {hasExistingDocument && !selected ? <Text style={styles.muted}>An identification upload is already attached. You can continue or choose a replacement.</Text> : null}

            <PressableScale disabled={!canContinueToReview} onPress={continueToReview} style={!canContinueToReview ? styles.disabled : undefined}>
              <View style={styles.primaryButton}><Text style={styles.primaryText}>Continue to review</Text></View>
            </PressableScale>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  blocked: { gap: spacing.md, paddingVertical: spacing.lg },
  capture: { alignItems: 'center', borderColor: colors.line, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flex: 1, gap: spacing.xs, justifyContent: 'center', minHeight: 104 },
  captureRow: { flexDirection: 'row', gap: spacing.md },
  captureText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 13 },
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  content: { gap: spacing.lg, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  disabled: { opacity: 0.5 },
  documentList: { gap: 0 },
  documentRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 66, paddingVertical: spacing.sm },
  documentTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14 },
  error: { color: colors.danger, fontFamily: typography.body, fontSize: 13 },
  fileName: { color: colors.ivory, flex: 1, fontFamily: typography.body, fontSize: 12 },
  flex: { flex: 1 },
  guidance: { alignItems: 'flex-start', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md },
  header: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  link: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 13, paddingVertical: spacing.xs },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  preview: { borderColor: colors.line, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  previewFooter: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  previewImage: { backgroundColor: colors.graphiteRaised, height: 220, width: '100%' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', minHeight: 52 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  privacy: { alignItems: 'flex-start', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.md },
  privacyText: { color: colors.silver, flex: 1, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  screen: { backgroundColor: colors.black, flex: 1 },
  title: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 20 },
});
