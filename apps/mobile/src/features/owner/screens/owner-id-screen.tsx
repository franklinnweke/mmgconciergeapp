import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { GovernmentIdKind } from '@mmg/contracts';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
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
import { useAuth } from '@/core/auth/auth-context';
import { createOwnerVerificationGateway } from '../data/owner-verification-gateway';
import { saveDraftUpload } from '../data/owner-draft-store';
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

  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleTakePhoto = async () => {
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

      // Persist draft document so desk and submit screens have truthful access
      await saveDraftUpload(auth.user.uid, {
        uploadId,
        documentKind,
        originalFileName: selectedAsset.fileName,
        contentType: selectedAsset.mimeType,
        // Real measured bytes only — never a fabricated fallback size. 0
        // reads as "not measured" rather than inventing a plausible number.
        byteSize: uploadedMeta.byteSize || selectedAsset.fileSize || 0,
        uploadedAt: uploadedMeta.uploadedAt || new Date().toISOString(),
      });

      // Navigate to review & submit screen
      router.push({
        pathname: '/(owner)/submit' as Href,
        params: {
          uploadId,
          documentKind,
          originalFileName: selectedAsset.fileName,
        },
      } as any);
    } catch (err) {
      setErrorMessage(ownerCommandErrorMessage(err));
    } finally {
      setUploading(false);
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
            <Text style={styles.title}>Government Identification</Text>
          </View>
        </View>

        {/* Privacy Notice Box */}
        <View style={styles.privacyBox}>
          <Ionicons color={colors.goldStrong} name="lock-closed-outline" size={20} />
          <Text style={styles.privacyText}>
            MMG Concierge uses the camera or photo library only to capture your government-issued ID for owner verification. The image is stored privately in a secure vault. Renters never see it.
          </Text>
        </View>

        {errorMessage && (
          <View style={styles.errorBox}>
            <Ionicons color="#EF4444" name="alert-circle-outline" size={18} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* Document Kind Selector */}
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
                  {isSelected && <View style={styles.radioDot} />}
                </View>
                <View style={styles.kindCopy}>
                  <Text style={[styles.kindLabel, isSelected && styles.kindLabelActive]}>{item.label}</Text>
                  <Text style={styles.kindDescription}>{item.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Capture / Select Controls */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Document Photo</Text>

        {selectedAsset ? (
          <View style={styles.previewContainer}>
            <Image
              contentFit="contain"
              source={{ uri: selectedAsset.uri }}
              style={styles.previewImage}
            />
            <View style={styles.previewMeta}>
              <Text style={styles.fileName}>{selectedAsset.fileName}</Text>
              <PressableScale onPress={() => setSelectedAsset(null)}>
                <Text style={styles.changeText}>Change Photo</Text>
              </PressableScale>
            </View>
          </View>
        ) : (
          <View style={styles.captureRow}>
            <PressableScale onPress={handleTakePhoto} style={{ flex: 1 }}>
              <View style={styles.captureButton}>
                <Ionicons color={colors.goldStrong} name="camera-outline" size={24} />
                <Text style={styles.captureButtonText}>Take Photo</Text>
              </View>
            </PressableScale>

            <PressableScale onPress={handlePickLibrary} style={{ flex: 1 }}>
              <View style={styles.captureButton}>
                <Ionicons color={colors.goldStrong} name="images-outline" size={24} />
                <Text style={styles.captureButtonText}>Choose File</Text>
              </View>
            </PressableScale>
          </View>
        )}

        {/* Primary Upload Button */}
        <PressableScale
          onPress={handleUpload}
          style={[{ marginTop: spacing.xl }, (!selectedAsset || uploading) && { opacity: 0.5 }]}
        >
          <View style={styles.primaryButton}>
            {uploading ? (
              <ActivityIndicator color={colors.black} size="small" />
            ) : (
              <>
                <Text style={styles.primaryText}>SAVE DOCUMENT</Text>
                <Ionicons color={colors.black} name="arrow-forward" size={18} />
              </>
            )}
          </View>
        </PressableScale>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, height: 44, justifyContent: 'center', minHeight: 44, minWidth: 44, width: 44 },
  captureButton: { alignItems: 'center', backgroundColor: colors.graphiteRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, gap: spacing.xs, justifyContent: 'center', minHeight: 110, padding: spacing.md },
  captureButtonText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 13 },
  captureRow: { flexDirection: 'row', gap: spacing.md },
  changeText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 12 },
  errorBox: { alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.md },
  errorText: { color: '#EF4444', flex: 1, fontFamily: typography.body, fontSize: 13 },
  fileName: { color: colors.ivory, fontFamily: typography.body, fontSize: 12 },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  kindCopy: { flex: 1 },
  kindDescription: { color: colors.muted, fontFamily: typography.body, fontSize: 11, marginTop: 2 },
  kindLabel: { color: colors.silver, fontFamily: typography.bodySemiBold, fontSize: 13 },
  kindLabelActive: { color: colors.goldStrong },
  kindRow: { alignItems: 'center', backgroundColor: colors.graphiteRaised, borderColor: colors.line, borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xs, padding: spacing.md },
  kindRowActive: { borderColor: colors.goldStrong },
  kindsList: { marginBottom: spacing.sm },
  previewContainer: { backgroundColor: '#090A0C', borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  previewImage: { height: 200, width: '100%' },
  previewMeta: { alignItems: 'center', backgroundColor: colors.graphiteRaised, flexDirection: 'row', justifyContent: 'space-between', padding: spacing.sm },
  privacyBox: { alignItems: 'center', backgroundColor: 'rgba(200,157,70,0.08)', borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, padding: spacing.md },
  privacyText: { color: colors.silver, flex: 1, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 54 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14, letterSpacing: 0.5 },
  radio: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: 10, borderWidth: 1.5, height: 20, justifyContent: 'center', width: 20 },
  radioActive: { borderColor: colors.goldStrong },
  radioDot: { backgroundColor: colors.goldStrong, borderRadius: 5, height: 10, width: 10 },
  screen: { backgroundColor: colors.black, flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sectionTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13, marginBottom: spacing.sm },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 26, letterSpacing: -0.4, marginTop: 2 },
});
