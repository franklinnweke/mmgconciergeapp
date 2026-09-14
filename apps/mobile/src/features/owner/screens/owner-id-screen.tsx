import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { GovernmentIdKind, OwnerVisibleProfile } from '@mmg/contracts';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { useAuth } from '@/core/auth/auth-context';
import { saveDraftUpload } from '../data/owner-draft-store';
import { createOwnerVerificationGateway } from '../data/owner-verification-gateway';
import { createOwnerVerificationRepository } from '../data/owner-verification-repository';
import { isNigerianE164, isOwnerApplicationEditable } from '../domain/owner-application';
import { ownerCommandErrorMessage } from '../domain/owner-errors';

const DOCUMENT_KINDS: { kind: GovernmentIdKind; label: string; description: string }[] = [
  {
    kind: 'national_id',
    label: 'National Identity Slip / Card (NIN)',
    description: 'NIMC digital slip or physical identity card',
  },
  {
    kind: 'drivers_licence',
    label: 'Driver’s Licence',
    description: 'Federal Road Safety Corps (FRSC) valid licence',
  },
  {
    kind: 'international_passport',
    label: 'International Passport',
    description: 'Nigerian Immigration Service passport data page',
  },
  {
    kind: 'voters_card',
    label: 'Permanent Voter’s Card (PVC)',
    description: 'INEC issued permanent voter’s card',
  },
  {
    kind: 'residence_permit',
    label: 'Residence Permit (CERPAC)',
    description: 'Valid Nigerian combined expatriate card',
  },
];

export function OwnerIdScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [documentKind, setDocumentKind] = useState<GovernmentIdKind>('national_id');
  const [selectedAsset, setSelectedAsset] = useState<{
    uri: string;
    fileName: string;
    mimeType: string;
    fileSize?: number;
  } | null>(null);
  const [profile, setProfile] = useState<OwnerVisibleProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(Boolean(auth.user?.uid));
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const ownerId = auth.user?.uid;
    if (!ownerId) return;

    const repository = createOwnerVerificationRepository();
    const unsubscribe = repository.subscribe(
      ownerId,
      (updatedProfile) => {
        setProfile(updatedProfile);
        setLoadingProfile(false);
      },
      () => setLoadingProfile(false),
    );

    return () => unsubscribe();
  }, [auth.user?.uid]);

  const emailVerified = Boolean(auth.user?.emailVerified);
  const identityComplete = Boolean(
    profile?.legalName &&
      profile?.address?.line1 &&
      profile?.address?.areaLabel &&
      profile?.termsAcceptedAt,
  );
  const phoneComplete = isNigerianE164(auth.user?.phoneNumber);
  const prerequisitesMet = emailVerified && identityComplete && phoneComplete;
  const applicationIsEditable = isOwnerApplicationEditable(profile?.verificationStatus);

  const handleTakePhoto = async () => {
    if (!applicationIsEditable) {
      setErrorMessage('This owner application is no longer editable. Return to your Owner Desk.');
      return;
    }
    if (!prerequisitesMet) {
      if (!emailVerified) setErrorMessage('Verify your email address before uploading identification.');
      else if (!identityComplete) setErrorMessage('Complete your owner identity details and accept terms before uploading identification.');
      else setErrorMessage('Verify your Nigerian phone number before uploading identification.');
      return;
    }

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Camera Access Required',
          'MMG Concierge uses the camera only to photograph your government ID for owner verification. The image stays private.',
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setSelectedAsset({
          uri: asset.uri,
          fileName: asset.fileName || `id-photo-${Date.now()}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          fileSize: asset.fileSize,
        });
      }
    } catch {
      setErrorMessage('Could not open camera. Please check device permissions.');
    }
  };

  const handlePickLibrary = async () => {
    if (!applicationIsEditable) {
      setErrorMessage('This owner application is no longer editable. Return to your Owner Desk.');
      return;
    }
    if (!prerequisitesMet) {
      if (!emailVerified) setErrorMessage('Verify your email address before uploading identification.');
      else if (!identityComplete) setErrorMessage('Complete your owner identity details and accept terms before uploading identification.');
      else setErrorMessage('Verify your Nigerian phone number before uploading identification.');
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Photo Library Access Required',
          'MMG Concierge accesses your photo library so you can upload your government ID for owner verification. The image stays private.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setSelectedAsset({
          uri: asset.uri,
          fileName: asset.fileName || `id-file-${Date.now()}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          fileSize: asset.fileSize,
        });
      }
    } catch {
      setErrorMessage('Could not open photo library. Please check device permissions.');
    }
  };

  const handleUpload = async () => {
    if (!selectedAsset || !auth.user?.uid || uploading) return;
    if (!applicationIsEditable) {
      setErrorMessage('This owner application is no longer editable. Return to your Owner Desk.');
      return;
    }
    if (!prerequisitesMet) {
      if (!emailVerified) setErrorMessage('Verify your email address before uploading identification.');
      else if (!identityComplete) setErrorMessage('Complete your owner identity details and accept terms before uploading identification.');
      else setErrorMessage('Verify your Nigerian phone number before uploading identification.');
      return;
    }

    setUploading(true);
    setErrorMessage(null);
    try {
      const gateway = createOwnerVerificationGateway();
      const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const uploadedMeta = await gateway.uploadPrivateIdDocument(
        auth.user.uid,
        uploadId,
        selectedAsset.uri,
        selectedAsset.mimeType,
      );

      const byteSize = uploadedMeta.byteSize > 0 ? uploadedMeta.byteSize : (selectedAsset.fileSize && selectedAsset.fileSize > 0 ? selectedAsset.fileSize : null);
      if (!byteSize) {
        throw new Error('Could not verify file size. Please re-select or re-take your ID photo.');
      }

      await saveDraftUpload(auth.user.uid, {
        uploadId,
        documentKind,
        originalFileName: selectedAsset.fileName,
        contentType: selectedAsset.mimeType,
        byteSize,
        uploadedAt: uploadedMeta.uploadedAt || new Date().toISOString(),
      });

      router.push({
        pathname: '/(owner)/submit' as Href,
        params: {
          uploadId,
          documentKind,
          originalFileName: selectedAsset.fileName,
        },
      } as any);
    } catch (err) {
      const code = (err as { code?: unknown })?.code;
      if (code === 'storage/unauthorized') {
        setErrorMessage(
          'Upload not permitted. Ensure your email is verified and your owner profile details are saved before uploading your ID.',
        );
      } else {
        setErrorMessage(ownerCommandErrorMessage(err));
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <ScreenHeader onBack={() => router.back()} showBrand={false} title="Government ID" />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.privacyBox}>
          <Ionicons color={colors.goldStrong} name="lock-closed-outline" size={20} />
          <Text style={styles.privacyText}>
            Your ID is used only for owner verification, stored privately, and never shown to renters.
          </Text>
        </View>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Ionicons color={colors.danger} name="alert-circle-outline" size={18} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {loadingProfile ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.goldStrong} size="small" />
            <Text style={styles.loadingText}>Checking verification status…</Text>
          </View>
        ) : !applicationIsEditable ? (
          <View style={styles.prerequisiteCard}>
            <View style={styles.prerequisiteHeader}>
              <Ionicons color={colors.goldStrong} name="information-circle-outline" size={22} />
              <Text style={styles.prerequisiteTitle}>Application status managed by MMG</Text>
            </View>
            <Text style={styles.prerequisiteBody}>
              Your owner application is no longer editable. Return to your Owner Desk to see its current status.
            </Text>
            <PressableScale onPress={() => router.replace('/(owner)' as Href)} style={styles.cardAction}>
              <View style={styles.prerequisiteButton}>
                <Text style={styles.prerequisiteButtonText}>RETURN TO OWNER DESK</Text>
              </View>
            </PressableScale>
          </View>
        ) : !prerequisitesMet ? (
          <View style={styles.prerequisiteCard}>
            <View style={styles.prerequisiteHeader}>
              <Ionicons color={colors.goldStrong} name="lock-closed-outline" size={22} />
              <Text style={styles.prerequisiteTitle}>Prerequisites required</Text>
            </View>
            <Text style={styles.prerequisiteBody}>
              {!emailVerified
                ? 'Verify your email address before uploading government identification.'
                : !identityComplete
                ? 'Complete your owner identity details and accept platform terms before uploading identification.'
                : 'Verify your Nigerian mobile number before uploading identification.'}
            </Text>
            <PressableScale
              onPress={() => {
                if (!emailVerified) router.push('/' as Href);
                else if (!identityComplete) router.push('/(owner)/identity' as Href);
                else router.push('/(owner)/phone' as Href);
              }}
              style={styles.cardAction}
            >
              <View style={styles.prerequisiteButton}>
                <Text style={styles.prerequisiteButtonText}>
                  {!emailVerified
                    ? 'VERIFY EMAIL'
                    : !identityComplete
                    ? 'COMPLETE OWNER IDENTITY'
                    : 'LINK NIGERIAN PHONE'}
                </Text>
              </View>
            </PressableScale>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Select Document Type</Text>
            <View style={styles.kindsList}>
              {DOCUMENT_KINDS.map((item) => {
                const isSelected = documentKind === item.kind;
                return (
                  <Pressable
                    key={item.kind}
                    onPress={() => setDocumentKind(item.kind)}
                    style={[styles.kindRow, isSelected && styles.kindRowActive]}
                  >
                    <View style={[styles.radio, isSelected && styles.radioActive]}>
                      {isSelected ? <View style={styles.radioDot} /> : null}
                    </View>
                    <View style={styles.kindCopy}>
                      <Text style={[styles.kindLabel, isSelected && styles.kindLabelActive]}>{item.label}</Text>
                      <Text style={styles.kindDescription}>{item.description}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.documentPhotoTitle}>Document Photo</Text>
            {selectedAsset ? (
              <View style={styles.previewContainer}>
                <Image contentFit="contain" source={{ uri: selectedAsset.uri }} style={styles.previewImage} />
                <View style={styles.previewMeta}>
                  <Text style={styles.fileName}>{selectedAsset.fileName}</Text>
                  <PressableScale onPress={() => setSelectedAsset(null)}>
                    <Text style={styles.changeText}>Change Photo</Text>
                  </PressableScale>
                </View>
              </View>
            ) : (
              <View style={styles.captureRow}>
                <PressableScale onPress={handleTakePhoto} style={styles.captureAction}>
                  <View style={styles.captureButton}>
                    <Ionicons color={colors.goldStrong} name="camera-outline" size={24} />
                    <Text style={styles.captureButtonText}>Take Photo</Text>
                  </View>
                </PressableScale>

                <PressableScale onPress={handlePickLibrary} style={styles.captureAction}>
                  <View style={styles.captureButton}>
                    <Ionicons color={colors.goldStrong} name="images-outline" size={24} />
                    <Text style={styles.captureButtonText}>Choose File</Text>
                  </View>
                </PressableScale>
              </View>
            )}

            <PressableScale
              onPress={handleUpload}
              style={[styles.primaryAction, (!selectedAsset || uploading) && styles.disabledAction]}
            >
              <View style={styles.primaryButton}>
                {uploading ? (
                  <ActivityIndicator color={colors.black} size="small" />
                ) : (
                  <Text style={styles.primaryText}>SAVE DOCUMENT</Text>
                )}
              </View>
            </PressableScale>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  captureAction: { flex: 1 },
  captureButton: { alignItems: 'center', backgroundColor: colors.graphiteRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, gap: spacing.xs, justifyContent: 'center', minHeight: 110, padding: spacing.md },
  captureButtonText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 13 },
  captureRow: { flexDirection: 'row', gap: spacing.md },
  cardAction: { marginTop: spacing.md },
  changeText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 12 },
  disabledAction: { opacity: 0.5 },
  documentPhotoTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13, marginBottom: spacing.sm, marginTop: spacing.lg },
  errorBox: { alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.md },
  errorText: { color: colors.danger, flex: 1, fontFamily: typography.body, fontSize: 13 },
  fileName: { color: colors.ivory, fontFamily: typography.body, fontSize: 12 },
  header: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  kindCopy: { flex: 1 },
  kindDescription: { color: colors.muted, fontFamily: typography.body, fontSize: 11, marginTop: 2 },
  kindLabel: { color: colors.silver, fontFamily: typography.bodySemiBold, fontSize: 13 },
  kindLabelActive: { color: colors.goldStrong },
  kindRow: { alignItems: 'center', backgroundColor: colors.graphiteRaised, borderColor: colors.line, borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xs, padding: spacing.md },
  kindRowActive: { borderColor: colors.goldStrong },
  kindsList: { marginBottom: spacing.sm },
  loadingBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  loadingText: { color: colors.silver, fontFamily: typography.body, fontSize: 14 },
  prerequisiteBody: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  prerequisiteButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', minHeight: 48 },
  prerequisiteButtonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 13, letterSpacing: 0.5 },
  prerequisiteCard: { backgroundColor: colors.graphiteRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, padding: spacing.lg },
  prerequisiteHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  prerequisiteTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 16 },
  previewContainer: { backgroundColor: '#090A0C', borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  previewImage: { height: 200, width: '100%' },
  previewMeta: { alignItems: 'center', backgroundColor: colors.graphiteRaised, flexDirection: 'row', justifyContent: 'space-between', padding: spacing.sm },
  primaryAction: { marginTop: spacing.xl },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', minHeight: 54 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14, letterSpacing: 0.5 },
  privacyBox: { alignItems: 'center', backgroundColor: 'rgba(200,157,70,0.08)', borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, padding: spacing.md },
  privacyText: { color: colors.silver, flex: 1, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  radio: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: 10, borderWidth: 1.5, height: 20, justifyContent: 'center', width: 20 },
  radioActive: { borderColor: colors.goldStrong },
  radioDot: { backgroundColor: colors.goldStrong, borderRadius: 5, height: 10, width: 10 },
  screen: { backgroundColor: colors.black, flex: 1 },
  scroll: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  sectionTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13, marginBottom: spacing.sm },
});
