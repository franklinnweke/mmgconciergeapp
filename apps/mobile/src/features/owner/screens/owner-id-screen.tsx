import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { GovernmentIdKind } from '@mmg/contracts';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import {
  InlineNotice,
  MobileHeader,
  PrimaryAction,
  SectionHeading,
} from '@/components/ui/mobile-primitives';
import { useAuth } from '@/core/auth/auth-context';
import { createOwnerVerificationGateway } from '../data/owner-verification-gateway';
import { saveDraftUpload } from '../data/owner-draft-store';
import { ownerCommandErrorMessage } from '../domain/owner-errors';

const DOCUMENT_KINDS: { kind: GovernmentIdKind; label: string; description: string }[] = [
  { kind: 'national_id', label: 'National ID (NIN)', description: 'NIMC digital slip or physical identity card' },
  { kind: 'drivers_licence', label: 'Driver’s licence', description: 'Valid FRSC licence' },
  { kind: 'international_passport', label: 'International passport', description: 'Nigerian passport data page' },
  { kind: 'voters_card', label: 'Permanent voter’s card', description: 'INEC-issued PVC' },
  { kind: 'residence_permit', label: 'Residence permit', description: 'Valid CERPAC card' },
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
          'Camera access required',
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
      setErrorMessage('Could not open the camera. Check your device permissions and try again.');
    }
  };

  const handlePickLibrary = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Photo library access required',
          'MMG Concierge accesses your photo library only so you can upload your government ID. The image stays private.',
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
      setErrorMessage('Could not open the photo library. Check your device permissions and try again.');
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
      await saveDraftUpload(auth.user.uid, {
        uploadId,
        documentKind,
        originalFileName: selectedAsset.fileName,
        contentType: selectedAsset.mimeType,
        byteSize: uploadedMeta.byteSize || selectedAsset.fileSize || 0,
        uploadedAt: uploadedMeta.uploadedAt || new Date().toISOString(),
      });
      router.push({
        pathname: '/(owner)/submit' as Href,
        params: {
          uploadId,
          documentKind,
          originalFileName: selectedAsset.fileName,
        },
      } as never);
    } catch (err) {
      setErrorMessage(ownerCommandErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MobileHeader onBack={() => router.back()} title="Government ID" />
        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>Verify your identity</Text>
          <Text style={styles.subtitle}>Choose one current government-issued document.</Text>
        </View>

        <InlineNotice icon="lock-closed-outline">
          Your ID is stored privately for owner verification. Renters never see this document.
        </InlineNotice>
        {errorMessage ? <InlineNotice icon="alert-circle-outline" tone="danger">{errorMessage}</InlineNotice> : null}

        <View style={styles.section}>
          <SectionHeading>Document</SectionHeading>
          <View style={styles.documentList}>
            {DOCUMENT_KINDS.map((item) => {
              const selected = documentKind === item.kind;
              return (
                <PressableScale
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  key={item.kind}
                  onPress={() => setDocumentKind(item.kind)}
                >
                  <View style={styles.documentRow}>
                    <View style={styles.documentCopy}>
                      <Text style={[styles.documentLabel, selected && styles.documentLabelSelected]}>{item.label}</Text>
                      <Text style={styles.documentDescription}>{item.description}</Text>
                    </View>
                    <Ionicons
                      color={selected ? colors.goldStrong : colors.lineStrong}
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                    />
                  </View>
                </PressableScale>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeading>Photo</SectionHeading>
          {selectedAsset ? (
            <View style={styles.preview}>
              <Image contentFit="contain" source={{ uri: selectedAsset.uri }} style={styles.previewImage} />
              <View style={styles.previewMeta}>
                <Text numberOfLines={1} style={styles.fileName}>{selectedAsset.fileName}</Text>
                <PressableScale accessibilityRole="button" onPress={() => setSelectedAsset(null)}>
                  <Text style={styles.changeText}>Change</Text>
                </PressableScale>
              </View>
            </View>
          ) : (
            <View style={styles.captureActions}>
              <CaptureAction icon="camera-outline" label="Take photo" onPress={() => void handleTakePhoto()} />
              <CaptureAction icon="images-outline" label="Choose from library" onPress={() => void handlePickLibrary()} />
            </View>
          )}
        </View>

        <View style={styles.primaryArea}>
          <PrimaryAction
            disabled={!selectedAsset}
            icon="arrow-forward"
            label="Save document"
            loading={uploading}
            onPress={() => void handleUpload()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CaptureAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" onPress={onPress} style={styles.captureShell}>
      <View style={styles.captureRow}>
        <Ionicons color={colors.goldStrong} name={icon} size={21} />
        <Text style={styles.captureText}>{label}</Text>
        <Ionicons color={colors.muted} name="chevron-forward" size={18} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  captureActions: {
    marginTop: spacing.sm,
  },
  captureRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 58,
  },
  captureShell: { alignSelf: 'stretch' },
  captureText: {
    color: colors.ivory,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
  },
  changeText: {
    color: colors.goldStrong,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  content: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  documentCopy: { flex: 1 },
  documentDescription: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: 2,
  },
  documentLabel: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
  },
  documentLabelSelected: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
  },
  documentList: {
    marginTop: spacing.sm,
  },
  documentRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 62,
    paddingVertical: spacing.xs,
  },
  fileName: {
    color: colors.silver,
    flex: 1,
    fontFamily: typography.body,
    fontSize: 12,
  },
  intro: {
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  preview: {
    backgroundColor: colors.graphite,
    borderRadius: radii.md,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  previewImage: {
    height: 220,
    width: '100%',
  },
  previewMeta: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.md,
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
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 31,
    letterSpacing: -0.55,
  },
});
