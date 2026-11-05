import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, typography } from '@mmg/brand';
import { type RenterProfileRecord } from '@mmg/contracts';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
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

import { PressableScale } from '../../../components/pressable-scale';
import { ScreenHeader } from '../../../components/screen-header';
import { useAuth } from '../../../core/auth/auth-context';
import { useTheme, useThemeStyles } from '../../../core/theme';
import { AuthLoadingScreen } from '../../auth/screens/auth-loading-screen';
import { uploadRenterProfilePhoto } from '../data/renter-profile-photo';
import { useRenterProfile } from '../hooks/use-renter-profile';

type RenterProfileFormProps = {
  profile: RenterProfileRecord | null;
  userDisplayName?: string | null;
  userEmail?: string | null;
  userPhotoUrl?: string | null;
  isSaving: boolean;
  isUploadingPhoto: boolean;
  signingOut: boolean;
  onChangePhoto: () => Promise<void>;
  onSave: (data: {
    fullName: string;
    phone: string;
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
  onSave,
  onRequestDeletion,
  onSignOut,
}: RenterProfileFormProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useProfileStyles();
  const [fullName, setFullName] = useState(() => profile?.fullName || userDisplayName || '');
  const [phone, setPhone] = useState(() => profile?.phone || '+234');
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

    try {
      await onSave({
        fullName: fullName.trim(),
        phone: phone.trim(),
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
            accessibilityHint="Upload a new profile photo"
            accessibilityLabel="Change profile photo"
            accessibilityRole="button"
            disabled={isUploadingPhoto}
            onPress={() => void onChangePhoto()}
            style={styles.photoButtonPressable}
          >
            <View style={styles.photoButton}>
              {isUploadingPhoto ? (
                <ActivityIndicator color={colors.textPrimary} size="small" />
              ) : (
                <Ionicons color={colors.textPrimary} name="camera" size={16} />
              )}
            </View>
          </PressableScale>
        </View>

        <Text style={styles.name}>{fullName || 'MMG Renter'}</Text>
        {userEmail ? (
          <View style={styles.emailRow}>
            <Ionicons color={colors.textMuted} name="mail-outline" size={14} />
            <Text style={styles.emailText}>{userEmail}</Text>
          </View>
        ) : null}

        <Text style={styles.identityHint}>
          MMG Concierge uses your contact details to deliver chauffeur services. Renters do not upload government ID.
        </Text>
      </View>

      {successMessage ? (
        <View style={styles.successBanner}>
          <Ionicons color={colors.success} name="checkmark-circle-outline" size={16} />
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      ) : null}

      {isDeletionPending ? (
        <View style={styles.noticeRow}>
          <Ionicons color={colors.primary} name="alert-circle-outline" size={18} />
          <Text style={styles.noticeText}>Account deletion has been requested.</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile details</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>NAME</Text>
          <TextInput
            editable={!isSaving}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={fullName}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>PHONE</Text>
          <TextInput
            editable={!isSaving}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            keyboardType="phone-pad"
            onChangeText={setPhone}
            placeholder="+2348012345678"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={phone}
          />
        </View>

        <PressableScale accessibilityRole="button" disabled={isSaving} onPress={handleSave}>
          <View style={styles.primaryButton}>
            {isSaving ? (
              <ActivityIndicator color={colors.buttonPrimaryText} size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>Save profile details</Text>
            )}
          </View>
        </PressableScale>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>

        <View style={styles.termsRow}>
          <Ionicons color={colors.primaryStrong} name="document-text-outline" size={18} />
          <Text style={styles.termsRowText}>Renter terms & privacy notice</Text>
          <Ionicons color={colors.success} name="checkmark-circle" size={17} />
        </View>

        <PressableScale accessibilityRole="button" disabled={signingOut} onPress={onSignOut} testID="account-sign-out">
          <View style={styles.secondaryButton}>
            {signingOut ? (
              <ActivityIndicator color={colors.buttonSecondaryText} size="small" />
            ) : (
              <>
                <Ionicons color={colors.buttonSecondaryText} name="log-out-outline" size={18} />
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
            editable={!isSaving}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            multiline
            numberOfLines={3}
            onChangeText={setDeletionReason}
            placeholder="Tell us why you are leaving (optional)"
            placeholderTextColor={colors.textMuted}
            style={styles.modalInput}
            value={deletionReason}
          />
            <View style={styles.modalActions}>
              <PressableScale
                accessibilityRole="button"
                disabled={isSaving}
                onPress={() => setDeleteModalVisible(false)}
                style={styles.modalAction}
              >
                <View style={styles.modalCancel}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </View>
              </PressableScale>
              <PressableScale
                accessibilityRole="button"
                disabled={isSaving}
                onPress={() => void handleConfirmDeletion()}
                style={styles.modalAction}
              >
                <View style={styles.modalConfirm}>
                  {isSaving ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Confirm deletion</Text>
                  )}
                </View>
              </PressableScale>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

export function RenterProfileScreen() {
  const { refreshUser, signOut, signingOut, user } = useAuth();
  const { colors } = useTheme();
  const styles = useProfileStyles();
  const {
    errorMessage,
    isLoading,
    isSaving,
    profile,
    refresh,
    requestDeletion,
    saveProfile,
  } = useRenterProfile();
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const handleChangePhoto = async () => {
    if (!user?.uid) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'Allow photo-library access to choose a profile picture.',
      );
      return;
    }

    const pickerRes = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });

    if (pickerRes.canceled || !pickerRes.assets?.[0]) return;

    const asset = pickerRes.assets[0];
    const contentType = asset.mimeType || 'image/jpeg';
    setIsUploadingPhoto(true);
    try {
      await uploadRenterProfilePhoto(user.uid, asset.uri, contentType);
      await refreshUser();
      await refresh();
    } catch (error) {
      Alert.alert(
        'Could not update photo',
        error instanceof Error ? error.message : 'Try again.',
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSave = async (data: {
    fullName: string;
    phone: string;
  }) => {
    await saveProfile({
      fullName: data.fullName,
      phone: data.phone,
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
          <ActivityIndicator color={colors.primaryStrong} size="large" />
          <Text style={styles.loadingText}>Loading account…</Text>
        </View>
      ) : (
        <RenterProfileForm
          isSaving={isSaving}
          isUploadingPhoto={isUploadingPhoto}
          onChangePhoto={handleChangePhoto}
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

export default RenterProfileScreen;

function useProfileStyles() {
  return useThemeStyles(({ colors, isDark }) =>
    StyleSheet.create({
      avatarFallback: {
        alignItems: 'center',
        backgroundColor: colors.surfaceRaised,
        height: '100%',
        justifyContent: 'center',
        width: '100%',
      },
      avatarImage: { height: '100%', width: '100%' },
      avatarShell: {
        borderColor: colors.borderStrong,
        borderRadius: 48,
        borderWidth: 1,
        height: 88,
        overflow: 'visible',
        position: 'relative',
        width: 88,
      },
      avatarText: {
        color: colors.textPrimary,
        fontFamily: typography.bodySemiBold,
        fontSize: 30,
      },
      content: {
        gap: spacing.xl,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
      },
      deleteButton: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44,
      },
      deleteButtonText: {
        color: colors.danger,
        fontFamily: typography.bodyMedium,
        fontSize: 13,
      },
      emailRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
      emailText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 13 },
      errorBanner: {
        alignItems: 'center',
        backgroundColor: isDark ? 'rgba(209,133,120,0.10)' : 'rgba(192,57,43,0.10)',
        flexDirection: 'row',
        gap: spacing.sm,
        marginHorizontal: spacing.lg,
        padding: spacing.md,
      },
      errorText: { color: colors.danger, flex: 1, fontFamily: typography.bodyMedium, fontSize: 13 },
      fieldGroup: { gap: spacing.xs },
      identityHint: {
        color: colors.textMuted,
        fontFamily: typography.body,
        fontSize: 12,
        lineHeight: 18,
        maxWidth: 320,
        textAlign: 'center',
      },
      identitySection: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.sm },
      input: {
        borderBottomColor: colors.borderStrong,
        borderBottomWidth: StyleSheet.hairlineWidth,
        color: colors.textPrimary,
        fontFamily: typography.body,
        fontSize: 15,
        minHeight: 48,
        paddingHorizontal: 0,
      },
      label: { color: colors.textMuted, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 0.8 },
      loadingContainer: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
      loadingText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 13 },
      modalAction: { flex: 1 },
      modalActions: { flexDirection: 'row', gap: spacing.sm },
      modalBackdrop: {
        alignItems: 'center',
        backgroundColor: colors.scrim,
        flex: 1,
        justifyContent: 'center',
        padding: spacing.lg,
      },
      modalCancel: {
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderRadius: radii.button,
        borderWidth: 1,
        justifyContent: 'center',
        minHeight: 46,
      },
      modalCancelText: { color: colors.textPrimary, fontFamily: typography.bodyMedium },
      modalCard: {
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.borderStrong,
        borderRadius: radii.lg,
        borderWidth: 1,
        gap: spacing.md,
        maxWidth: 420,
        padding: spacing.xl,
        width: '100%',
      },
      modalConfirm: {
        alignItems: 'center',
        backgroundColor: colors.danger,
        borderRadius: radii.button,
        justifyContent: 'center',
        minHeight: 46,
      },
      modalConfirmText: { color: '#FFFFFF', fontFamily: typography.bodySemiBold, fontSize: 13 },
      modalDescription: { color: colors.textMuted, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
      modalInput: {
        backgroundColor: colors.surfaceInput,
        borderColor: colors.borderStrong,
        borderRadius: radii.md,
        borderWidth: 1,
        color: colors.textPrimary,
        fontFamily: typography.body,
        minHeight: 76,
        padding: spacing.md,
        textAlignVertical: 'top',
      },
      modalTitle: { color: colors.textPrimary, fontFamily: typography.bodySemiBold, fontSize: 18 },
      name: { color: colors.textPrimary, fontFamily: typography.bodySemiBold, fontSize: 22 },
      noticeRow: {
        alignItems: 'center',
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        gap: spacing.sm,
        paddingBottom: spacing.md,
      },
      noticeText: { color: colors.primary, fontFamily: typography.bodyMedium, fontSize: 13 },
      photoButton: {
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderRadius: 18,
        borderWidth: 1,
        height: 34,
        justifyContent: 'center',
        width: 34,
      },
      photoButtonPressable: { bottom: -2, position: 'absolute', right: -2 },
      primaryButton: {
        alignItems: 'center',
        backgroundColor: colors.buttonPrimaryBg,
        borderRadius: radii.button,
        justifyContent: 'center',
        minHeight: 50,
      },
      primaryButtonText: { color: colors.buttonPrimaryText, fontFamily: typography.bodySemiBold, fontSize: 14 },
      screen: { backgroundColor: colors.canvas, flex: 1 },
      secondaryButton: {
        alignItems: 'center',
        backgroundColor: colors.buttonSecondaryBg,
        borderColor: colors.buttonSecondaryBorder,
        borderRadius: radii.button,
        borderWidth: 1,
        flexDirection: 'row',
        gap: spacing.sm,
        justifyContent: 'center',
        minHeight: 50,
      },
      secondaryButtonText: { color: colors.buttonSecondaryText, fontFamily: typography.bodyMedium, fontSize: 14 },
      section: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.md, paddingTop: spacing.lg },
      sectionTitle: { color: colors.textPrimary, fontFamily: typography.bodySemiBold, fontSize: 17 },
      successBanner: {
        alignItems: 'center',
        backgroundColor: isDark ? 'rgba(46,204,113,0.10)' : 'rgba(46,125,50,0.10)',
        flexDirection: 'row',
        gap: spacing.sm,
        padding: spacing.md,
      },
      successText: { color: colors.success, fontFamily: typography.bodyMedium, fontSize: 13 },
      termsRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 48, paddingVertical: spacing.sm },
      termsRowText: { color: colors.textPrimary, flex: 1, fontFamily: typography.bodyMedium, fontSize: 14 },
      topBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    }),
  );
}
