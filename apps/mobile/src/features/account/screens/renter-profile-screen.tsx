import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { type LagosAreaLabel, type RenterProfileRecord } from '@mmg/contracts';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { useAuth } from '@/core/auth/auth-context';
import { AuthLoadingScreen } from '@/features/auth/screens/auth-loading-screen';
import { uploadRenterProfilePhoto } from '../data/renter-profile-photo';
import { useRenterProfile } from '../hooks/use-renter-profile';

const LAGOS_AREAS: readonly LagosAreaLabel[] = [
  'Ikoyi',
  'Victoria Island',
  'Lekki',
  'Lekki Phase 1',
  'Lagos Island',
  'Banana Island',
  'Oniru',
  'Ikeja',
  'Maryland',
  'Ajah',
  'Yaba',
  'Surulere',
];

type RenterProfileFormProps = {
  profile: RenterProfileRecord | null;
  userDisplayName?: string | null;
  userEmail?: string | null;
  userPhotoUrl?: string | null;
  isSaving: boolean;
  isUploadingPhoto: boolean;
  signingOut: boolean;
  onChangePhoto: () => Promise<void>;
  onOpenOwnerDesk: () => void;
  onSave: (data: {
    fullName: string;
    phone: string;
    areaLabel: LagosAreaLabel;
    streetAddress: string;
    landmark?: string;
  }) => Promise<void>;
  onRequestDeletion: (reason?: string) => Promise<void>;
  onSignOut: () => void;
};

function RenterProfileForm({
  profile,
  userDisplayName,
  userEmail,
  userPhotoUrl,
  isSaving,
  isUploadingPhoto,
  signingOut,
  onChangePhoto,
  onOpenOwnerDesk,
  onSave,
  onRequestDeletion,
  onSignOut,
}: RenterProfileFormProps) {
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState(() => profile?.fullName || userDisplayName || '');
  const [phone, setPhone] = useState(() => profile?.phone || '+234');
  const [selectedArea, setSelectedArea] = useState<LagosAreaLabel>(
    () => (profile?.defaultDeliveryAddress?.areaLabel as LagosAreaLabel) || 'Victoria Island',
  );
  const [streetAddress, setStreetAddress] = useState(
    () => profile?.defaultDeliveryAddress?.streetAddress || '',
  );
  const [landmark, setLandmark] = useState(
    () => profile?.defaultDeliveryAddress?.landmark || '',
  );
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isDeletionPending = profile?.accountStatus === 'deletion_requested';

  const handleSave = async () => {
    if (fullName.trim().length < 2) {
      Alert.alert('Complete profile details', 'Add your name before saving these details.');
      return;
    }
    if (!/^\+234[789]\d{9}$/.test(phone.trim())) {
      Alert.alert('Complete profile details', 'Enter a valid Nigerian mobile number starting with +234.');
      return;
    }
    if (streetAddress.trim().length < 5) {
      Alert.alert('Complete profile details', 'Add a Lagos delivery address before saving these details.');
      return;
    }

    try {
      await onSave({
        fullName: fullName.trim(),
        phone: phone.trim(),
        areaLabel: selectedArea,
        streetAddress: streetAddress.trim(),
        landmark: landmark.trim() || undefined,
      });
      setSuccessMessage('Profile details saved.');
      setTimeout(() => setSuccessMessage(null), 2500);
    } catch {
      // Parent surfaces the provider-safe error.
    }
  };

  const handleConfirmDeletion = async () => {
    try {
      await onRequestDeletion(deletionReason.trim() || undefined);
      setDeleteModalVisible(false);
      Alert.alert(
        'Deletion requested',
        'Your request has been submitted. Active rentals must conclude before final deletion can complete.',
      );
    } catch {
      // Parent surfaces the provider-safe error.
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.identitySection}>
        <View style={styles.avatarShell}>
          {userPhotoUrl ? (
            <Image contentFit="cover" source={{ uri: userPhotoUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarText}>
                {(fullName || userDisplayName || 'M').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <PressableScale
            accessibilityLabel="Change profile photo"
            accessibilityRole="button"
            disabled={isUploadingPhoto}
            onPress={() => void onChangePhoto()}
            style={styles.photoButtonPressable}
          >
            <View style={styles.photoButton}>
              {isUploadingPhoto ? (
                <ActivityIndicator color={colors.ivory} size="small" />
              ) : (
                <Ionicons color={colors.ivory} name="camera-outline" size={16} />
              )}
            </View>
          </PressableScale>
        </View>
        <Text style={styles.name}>{fullName || userDisplayName || 'MMG account'}</Text>
        <View style={styles.emailRow}>
          <Ionicons color={colors.success} name="checkmark-circle" size={14} />
          <Text style={styles.emailText}>{userEmail}</Text>
        </View>
      </View>

      {successMessage ? (
        <View style={styles.successBanner}>
          <Ionicons color={colors.success} name="checkmark-circle" size={16} />
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      ) : null}

      {isDeletionPending ? (
        <View style={styles.noticeRow}>
          <Ionicons color={colors.gold} name="alert-circle-outline" size={18} />
          <Text style={styles.noticeText}>Account deletion has been requested.</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile details</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>NAME</Text>
          <TextInput
            editable={!isSaving}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={fullName}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>PHONE</Text>
          <TextInput
            editable={!isSaving}
            keyboardType="phone-pad"
            onChangeText={setPhone}
            placeholder="+2348012345678"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={phone}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Default delivery</Text>
        <Text style={styles.sectionDescription}>Used as a convenient starting point for future chauffeur delivery. You can still choose another location during booking.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>AREA</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {LAGOS_AREAS.map((area) => {
              const selected = area === selectedArea;
              return (
                <PressableScale
                  accessibilityLabel={`Select ${area}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  key={area}
                  onPress={() => setSelectedArea(area)}
                  style={[styles.areaPill, selected && styles.areaPillSelected]}
                >
                  <Text style={[styles.areaText, selected && styles.areaTextSelected]}>{area}</Text>
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>STREET ADDRESS</Text>
          <TextInput
            editable={!isSaving}
            onChangeText={setStreetAddress}
            placeholder="15 Queens Drive, Ikoyi"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={streetAddress}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>LANDMARK (OPTIONAL)</Text>
          <TextInput
            editable={!isSaving}
            onChangeText={setLandmark}
            placeholder="Nearby building or landmark"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={landmark}
          />
        </View>

        <PressableScale accessibilityRole="button" disabled={isSaving} onPress={handleSave}>
          <View style={styles.primaryButton}>
            {isSaving ? (
              <ActivityIndicator color={colors.black} size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>Save profile details</Text>
            )}
          </View>
        </PressableScale>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>

        <PressableScale
          accessibilityLabel="List a car"
          accessibilityRole="button"
          onPress={onOpenOwnerDesk}
        >
          <View style={styles.accountRow}>
            <Ionicons color={colors.goldStrong} name="car-sport-outline" size={18} />
            <Text style={styles.accountRowText}>List a car</Text>
            <Ionicons color={colors.muted} name="chevron-forward" size={17} />
          </View>
        </PressableScale>

        <View style={styles.accountRow}>
          <Ionicons color={colors.goldStrong} name="document-text-outline" size={18} />
          <Text style={styles.accountRowText}>Renter terms & privacy notice</Text>
          <Ionicons color={colors.success} name="checkmark-circle" size={17} />
        </View>

        <PressableScale accessibilityRole="button" disabled={signingOut} onPress={onSignOut}>
          <View style={styles.secondaryButton}>
            {signingOut ? (
              <ActivityIndicator color={colors.ivory} size="small" />
            ) : (
              <>
                <Ionicons color={colors.ivory} name="log-out-outline" size={18} />
                <Text style={styles.secondaryButtonText}>Sign out</Text>
              </>
            )}
          </View>
        </PressableScale>

        {!isDeletionPending ? (
          <PressableScale accessibilityRole="button" onPress={() => setDeleteModalVisible(true)}>
            <View style={styles.deleteButton}>
              <Text style={styles.deleteButtonText}>Request account deletion</Text>
            </View>
          </PressableScale>
        ) : null}
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
        transparent
        visible={deleteModalVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request account deletion</Text>
            <Text style={styles.modalDescription}>
              This requests permanent deletion and anonymization of your renter profile and contact records. Active rentals must complete first.
            </Text>
            <TextInput
              multiline
              numberOfLines={3}
              onChangeText={setDeletionReason}
              placeholder="Reason (optional)"
              placeholderTextColor={colors.muted}
              style={styles.modalInput}
              value={deletionReason}
            />
            <View style={styles.modalActions}>
              <PressableScale onPress={() => setDeleteModalVisible(false)} style={styles.modalAction}>
                <View style={styles.modalCancel}><Text style={styles.modalCancelText}>Cancel</Text></View>
              </PressableScale>
              <PressableScale onPress={handleConfirmDeletion} style={styles.modalAction}>
                <View style={styles.modalConfirm}><Text style={styles.modalConfirmText}>Request deletion</Text></View>
              </PressableScale>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

export function RenterProfileScreen() {
  const router = useRouter();
  const { refreshUser, signOut, signingOut, user } = useAuth();
  const { profile, isLoading, isSaving, errorMessage, saveProfile, requestDeletion } = useRenterProfile();
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const handleChangePhoto = async () => {
    if (!user?.uid) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo-library access to choose a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const contentType = asset.mimeType || 'image/jpeg';
    setIsUploadingPhoto(true);
    try {
      await uploadRenterProfilePhoto(user.uid, asset.uri, contentType);
      await refreshUser();
    } catch (error) {
      Alert.alert('Could not update photo', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSave = async (data: {
    fullName: string;
    phone: string;
    areaLabel: LagosAreaLabel;
    streetAddress: string;
    landmark?: string;
  }) => {
    await saveProfile({
      fullName: data.fullName,
      phone: data.phone,
      defaultDeliveryAddress: {
        areaLabel: data.areaLabel,
        streetAddress: data.streetAddress,
        landmark: data.landmark,
      },
      acceptedRenterTermsVersion: '2026-03-01',
      acceptedPrivacyNoticeVersion: '2026-03-01',
    });
  };

  const handleRequestDeletion = async (reason?: string) => {
    await requestDeletion({ confirmation: true, reason });
  };

  if (signingOut) {
    return <AuthLoadingScreen message="Signing out" />;
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}><ScreenHeader showBrand={false} title="Account" /></View>
      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Ionicons color={colors.danger} name="warning-outline" size={16} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.goldStrong} size="large" />
          <Text style={styles.loadingText}>Loading account…</Text>
        </View>
      ) : (
        <RenterProfileForm
          isSaving={isSaving}
          isUploadingPhoto={isUploadingPhoto}
          onChangePhoto={handleChangePhoto}
          onOpenOwnerDesk={() => router.push('/(owner)' as Href)}
          onRequestDeletion={handleRequestDeletion}
          onSave={handleSave}
          onSignOut={() => void signOut()}
          profile={profile}
          signingOut={signingOut}
          userDisplayName={user?.displayName}
          userEmail={user?.email}
          userPhotoUrl={user?.photoURL}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  accountRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 48, paddingVertical: spacing.sm },
  accountRowText: { color: colors.ivory, flex: 1, fontFamily: typography.bodyMedium, fontSize: 14 },
  areaPill: { borderColor: colors.line, borderRadius: radii.pill, borderWidth: 1, marginRight: spacing.sm, minHeight: 42, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  areaPillSelected: { backgroundColor: colors.ivory, borderColor: colors.ivory },
  areaText: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 12 },
  areaTextSelected: { color: colors.black },
  avatarFallback: { alignItems: 'center', backgroundColor: colors.graphite, height: '100%', justifyContent: 'center', width: '100%' },
  avatarImage: { height: '100%', width: '100%' },
  avatarShell: { borderColor: colors.lineStrong, borderRadius: 48, borderWidth: 1, height: 88, overflow: 'visible', position: 'relative', width: 88 },
  avatarText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 30 },
  content: { gap: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  deleteButton: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  deleteButtonText: { color: colors.danger, fontFamily: typography.bodyMedium, fontSize: 13 },
  emailRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  emailText: { color: colors.muted, fontFamily: typography.body, fontSize: 13 },
  errorBanner: { alignItems: 'center', backgroundColor: 'rgba(209,133,120,0.10)', flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.lg, padding: spacing.md },
  errorText: { color: colors.danger, flex: 1, fontFamily: typography.bodyMedium, fontSize: 13 },
  fieldGroup: { gap: spacing.xs },
  identityHint: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18, maxWidth: 320, textAlign: 'center' },
  identitySection: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.sm },
  input: { borderBottomColor: colors.lineStrong, borderBottomWidth: StyleSheet.hairlineWidth, color: colors.ivory, fontFamily: typography.body, fontSize: 15, minHeight: 48, paddingHorizontal: 0 },
  label: { color: colors.muted, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 0.8 },
  loadingContainer: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  loadingText: { color: colors.muted, fontFamily: typography.body, fontSize: 13 },
  modalAction: { flex: 1 },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.76)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  modalCancel: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.button, borderWidth: 1, minHeight: 46, justifyContent: 'center' },
  modalCancelText: { color: colors.ivory, fontFamily: typography.bodyMedium },
  modalCard: { backgroundColor: colors.graphite, borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, gap: spacing.md, maxWidth: 420, padding: spacing.xl, width: '100%' },
  modalConfirm: { alignItems: 'center', backgroundColor: colors.danger, borderRadius: radii.button, minHeight: 46, justifyContent: 'center' },
  modalConfirmText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13 },
  modalDescription: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  modalInput: { borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, color: colors.ivory, fontFamily: typography.body, minHeight: 76, padding: spacing.md, textAlignVertical: 'top' },
  modalTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 18 },
  name: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 22 },
  noticeRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.md },
  noticeText: { color: colors.gold, fontFamily: typography.bodyMedium, fontSize: 13 },
  photoButton: { alignItems: 'center', backgroundColor: colors.graphite, borderColor: colors.lineStrong, borderRadius: 18, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  photoButtonPressable: { bottom: -2, position: 'absolute', right: -2 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.ivory, borderRadius: radii.button, justifyContent: 'center', minHeight: 50 },
  primaryButtonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  screen: { backgroundColor: colors.black, flex: 1 },
  secondaryButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.button, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 50 },
  secondaryButtonText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 14 },
  section: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.md, paddingTop: spacing.lg },
  sectionDescription: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 19 },
  sectionTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 17 },
  successBanner: { alignItems: 'center', backgroundColor: 'rgba(46,204,113,0.10)', flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  successText: { color: colors.success, fontFamily: typography.bodyMedium, fontSize: 13 },
  topBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
