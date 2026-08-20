import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { type LagosAreaLabel, type RenterProfileRecord } from '@mmg/contracts';
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

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { useAuth } from '@/core/auth/auth-context';
import { useRenterProfile } from '../hooks/use-renter-profile';

const LAGOS_AREAS: readonly LagosAreaLabel[] = [
  'Ikoyi',
  'Victoria Island',
  'Lekki Phase 1',
  'Banana Island',
  'Lagos Island',
  'Ikeja',
];

type RenterProfileFormProps = {
  profile: RenterProfileRecord | null;
  userDisplayName?: string | null;
  userEmail?: string | null;
  isSaving: boolean;
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
  isSaving,
  onSave,
  onRequestDeletion,
  onSignOut,
}: RenterProfileFormProps) {
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState(
    () => profile?.fullName || userDisplayName || '',
  );
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
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const isDeletionPending = profile?.accountStatus === 'deletion_requested';

  const handleSave = async () => {
    if (!fullName.trim() || fullName.trim().length < 2) {
      Alert.alert('Full Name Required', 'Please provide your full legal name.');
      return;
    }

    if (!phone.startsWith('+234') || phone.length < 13) {
      Alert.alert('Phone Number Required', 'Please provide a valid Nigerian phone number starting with +234.');
      return;
    }

    if (!streetAddress.trim() || streetAddress.trim().length < 5) {
      Alert.alert('Delivery Address Required', 'Please enter your default street address for chauffeur delivery in Lagos.');
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
      setSuccessToast('Profile saved successfully.');
      setTimeout(() => setSuccessToast(null), 3000);
    } catch {
      // Error handled by parent
    }
  };

  const handleConfirmDeletion = async () => {
    try {
      await onRequestDeletion(deletionReason.trim() || undefined);
      setDeleteModalVisible(false);
      Alert.alert(
        'Deletion Requested',
        'Your account deletion request has been submitted. Any scheduled rentals must conclude before final anonymization.',
      );
    } catch {
      // Error handled by parent
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Profile Header */}
      <View style={styles.headerSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(fullName || userDisplayName || 'M').charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.title}>{fullName || userDisplayName || 'MMG Guest'}</Text>
        <Text style={styles.emailText}>{userEmail}</Text>
        {isDeletionPending ? (
          <View style={styles.deletionBadge}>
            <Ionicons color={colors.gold} name="alert-circle" size={13} />
            <Text style={styles.deletionBadgeText}>DELETION REQUESTED</Text>
          </View>
        ) : null}
      </View>

      {successToast && (
        <View style={styles.successBanner}>
          <Ionicons color={colors.success} name="checkmark-circle" size={16} />
          <Text style={styles.successText}>{successToast}</Text>
        </View>
      )}

      {/* Contact Details Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Personal details</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>FULL LEGAL NAME</Text>
          <TextInput
            editable={!isSaving}
            onChangeText={setFullName}
            placeholder="e.g. Babatunde Adeleke"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={fullName}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>NIGERIAN PHONE NUMBER (E.164)</Text>
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

      {/* Default Lagos Delivery Address */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Lagos delivery address</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>PRIMARY LAGOS DISTRICT</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.areaScroll}>
            {LAGOS_AREAS.map((area) => {
              const isSelected = selectedArea === area;
              return (
                <PressableScale
                  accessibilityLabel={`Select Lagos district ${area}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  key={area}
                  onPress={() => setSelectedArea(area)}
                  style={[styles.areaPill, isSelected && styles.areaPillSelected]}
                >
                  <Text style={[styles.areaPillText, isSelected && styles.areaPillTextSelected]}>
                    {area}
                  </Text>
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
            placeholder="e.g. 15 Queens Drive, Ikoyi"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={streetAddress}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>NEARBY LANDMARK / BUILDING NAME</Text>
          <TextInput
            editable={!isSaving}
            onChangeText={setLandmark}
            placeholder="e.g. Near Federal High Court"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={landmark}
          />
        </View>
      </View>

      {/* Legal & Terms Badge */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Terms and privacy</Text>
        <View style={styles.termsRow}>
          <Ionicons color={colors.goldStrong} name="document-text-outline" size={18} />
          <View style={styles.termsInfo}>
            <Text style={styles.termsHeading}>Renter Terms & Privacy Notice</Text>
          </View>
          <Ionicons color={colors.success} name="checkmark-circle" size={18} />
        </View>
      </View>

      {/* Save Button */}
      <PressableScale
        accessibilityRole="button"
        disabled={isSaving}
        onPress={handleSave}
        style={styles.savePressable}
      >
        <View style={styles.saveButton}>
          {isSaving ? (
            <ActivityIndicator color={colors.black} size="small" />
          ) : (
            <>
              <Ionicons color={colors.black} name="save-outline" size={18} />
              <Text style={styles.saveButtonText}>SAVE PROFILE</Text>
            </>
          )}
        </View>
      </PressableScale>

      {/* Account Deletion / Data Rights */}
      {!isDeletionPending && (
        <PressableScale
          accessibilityRole="button"
          onPress={() => setDeleteModalVisible(true)}
          style={styles.deletePressable}
        >
          <View style={styles.deleteButton}>
            <Ionicons color={colors.danger} name="trash-outline" size={17} />
            <Text style={styles.deleteButtonText}>Request Account Deletion</Text>
          </View>
        </PressableScale>
      )}

      {/* Sign Out */}
      <PressableScale
        accessibilityRole="button"
        onPress={onSignOut}
        style={styles.signOutPressable}
      >
        <View style={styles.signOutButton}>
          <Ionicons color={colors.ivory} name="log-out-outline" size={18} />
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </View>
      </PressableScale>

      {/* Deletion Confirmation Modal */}
      <Modal
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
        transparent
        visible={deleteModalVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons color={colors.danger} name="warning" size={28} />
            </View>
            <Text style={styles.modalTitle}>Request Account Deletion</Text>
            <Text style={styles.modalDescription}>
              This will request permanent deletion and anonymization of your profile and contact records under NDPR/GDPR.
              Any active rentals must complete before deletion proceeds.
            </Text>

            <TextInput
              multiline
              numberOfLines={3}
              onChangeText={setDeletionReason}
              placeholder="Reason for deletion (optional)"
              placeholderTextColor={colors.muted}
              style={styles.modalInput}
              value={deletionReason}
            />

            <View style={styles.modalActions}>
              <PressableScale onPress={() => setDeleteModalVisible(false)} style={styles.modalCancelPress}>
                <View style={styles.modalCancelButton}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </View>
              </PressableScale>

              <PressableScale onPress={handleConfirmDeletion} style={styles.modalConfirmPress}>
                <View style={styles.modalConfirmButton}>
                  <Text style={styles.modalConfirmText}>Confirm Deletion</Text>
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
  const { signOut, user } = useAuth();
  const { profile, isLoading, isSaving, errorMessage, saveProfile, requestDeletion } =
    useRenterProfile();

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
    await requestDeletion({
      confirmation: true,
      reason,
    });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}>
        <BrandWordmark compact withLogo />
      </View>

      {errorMessage && (
        <View style={styles.errorBanner}>
          <Ionicons color={colors.danger} name="warning-outline" size={16} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.goldStrong} size="large" />
          <Text style={styles.loadingText}>Loading profile details...</Text>
        </View>
      ) : (
        <RenterProfileForm
          isSaving={isSaving}
          onRequestDeletion={handleRequestDeletion}
          onSave={handleSave}
          onSignOut={() => void signOut()}
          profile={profile}
          userDisplayName={user?.displayName}
          userEmail={user?.email}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  areaPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginRight: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  areaPillSelected: {
    backgroundColor: colors.goldStrong,
    borderColor: colors.goldStrong,
  },
  areaPillText: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  areaPillTextSelected: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
  },
  areaScroll: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  avatarText: {
    color: colors.black,
    fontFamily: typography.display,
    fontSize: 32,
  },
  card: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  cardTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  content: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  deleteButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  deleteButtonText: {
    color: colors.danger,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  deletePressable: {
    alignSelf: 'center',
    marginTop: spacing.xs,
  },
  deletionBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(227,195,101,0.12)',
    borderColor: colors.gold,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  deletionBadgeText: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  emailText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
  },
  errorBanner: {
    alignItems: 'center',
    backgroundColor: 'rgba(209,133,120,0.12)',
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  headerSection: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 14,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  label: {
    color: colors.muted,
    fontFamily: typography.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  loadingContainer: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  loadingText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCancelButton: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: spacing.lg,
  },
  modalCancelPress: {
    flex: 1,
  },
  modalCancelText: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  modalCard: {
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.md,
    maxWidth: 400,
    padding: spacing.xl,
    width: '100%',
  },
  modalConfirmButton: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: spacing.lg,
  },
  modalConfirmPress: {
    flex: 1,
  },
  modalConfirmText: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
  },
  modalDescription: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  modalIcon: {
    alignItems: 'center',
  },
  modalInput: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 13,
    minHeight: 70,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  modalTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 20,
    textAlign: 'center',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
  },
  saveButtonText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
    letterSpacing: 1.2,
  },
  savePressable: {
    marginTop: spacing.sm,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  signOutButton: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
  },
  signOutButtonText: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
  },
  signOutPressable: {
    marginBottom: spacing.lg,
  },
  statusDot: {
    backgroundColor: '#4ECDC4',
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  successBanner: {
    alignItems: 'center',
    backgroundColor: 'rgba(46,204,113,0.12)',
    borderColor: colors.success,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  successText: {
    color: colors.success,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  termsHeading: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  termsInfo: {
    flex: 1,
    gap: 2,
  },
  termsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  termsSub: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 28,
    letterSpacing: -0.5,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
