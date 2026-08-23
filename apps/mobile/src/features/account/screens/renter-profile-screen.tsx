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
import {
  FieldLabel,
  InlineNotice,
  PrimaryAction,
  SecondaryAction,
  SectionHeading,
} from '@/components/ui/mobile-primitives';
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
  const [fullName, setFullName] = useState(() => profile?.fullName || userDisplayName || '');
  const [phone, setPhone] = useState(() => profile?.phone || '+234');
  const [selectedArea, setSelectedArea] = useState<LagosAreaLabel>(
    () => (profile?.defaultDeliveryAddress?.areaLabel as LagosAreaLabel) || 'Victoria Island',
  );
  const [streetAddress, setStreetAddress] = useState(
    () => profile?.defaultDeliveryAddress?.streetAddress || '',
  );
  const [landmark, setLandmark] = useState(() => profile?.defaultDeliveryAddress?.landmark || '');
  const [areaModalVisible, setAreaModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const isDeletionPending = profile?.accountStatus === 'deletion_requested';

  const handleSave = async () => {
    if (!fullName.trim() || fullName.trim().length < 2) {
      Alert.alert('Name required', 'Please enter your full name.');
      return;
    }
    if (!phone.startsWith('+234') || phone.length < 13) {
      Alert.alert('Phone number required', 'Enter a valid Nigerian phone number beginning with +234.');
      return;
    }
    if (!streetAddress.trim() || streetAddress.trim().length < 5) {
      Alert.alert('Address required', 'Enter your default Lagos delivery address.');
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
      setSuccessToast('Profile saved');
      setTimeout(() => setSuccessToast(null), 3000);
    } catch {
      // Parent hook exposes the safe error message.
    }
  };

  const handleConfirmDeletion = async () => {
    try {
      await onRequestDeletion(deletionReason.trim() || undefined);
      setDeleteModalVisible(false);
      Alert.alert(
        'Deletion requested',
        'Your request has been submitted. Any active rentals must finish before final deletion can proceed.',
      );
    } catch {
      // Parent hook exposes the safe error message.
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(fullName || userDisplayName || 'M').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.profileCopy}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.profileName}>
            {fullName || userDisplayName || 'Your account'}
          </Text>
          <Text numberOfLines={1} style={styles.emailText}>{userEmail}</Text>
        </View>
      </View>

      {successToast ? <InlineNotice icon="checkmark-circle-outline" tone="success">{successToast}</InlineNotice> : null}
      {isDeletionPending ? (
        <InlineNotice icon="time-outline">Account deletion is pending.</InlineNotice>
      ) : null}

      <View style={styles.section}>
        <SectionHeading>Personal details</SectionHeading>
        <View style={styles.fieldGroup}>
          <FieldLabel>Full name</FieldLabel>
          <TextInput
            autoCapitalize="words"
            editable={!isSaving}
            onChangeText={setFullName}
            placeholder="Your full name"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={fullName}
          />
        </View>
        <View style={styles.fieldGroup}>
          <FieldLabel>Phone number</FieldLabel>
          <TextInput
            editable={!isSaving}
            keyboardType="phone-pad"
            onChangeText={setPhone}
            placeholder="+234 801 234 5678"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={phone}
          />
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeading>Delivery address</SectionHeading>
        <View style={styles.fieldGroup}>
          <FieldLabel>Area</FieldLabel>
          <PressableScale
            accessibilityLabel={`Delivery area, ${selectedArea}`}
            accessibilityRole="button"
            onPress={() => setAreaModalVisible(true)}
          >
            <View style={styles.selector}>
              <Text style={styles.selectorText}>{selectedArea}</Text>
              <Ionicons color={colors.muted} name="chevron-down" size={18} />
            </View>
          </PressableScale>
        </View>
        <View style={styles.fieldGroup}>
          <FieldLabel>Street address</FieldLabel>
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
          <FieldLabel>Landmark or building name <Text style={styles.optional}>Optional</Text></FieldLabel>
          <TextInput
            editable={!isSaving}
            onChangeText={setLandmark}
            placeholder="Nearby landmark"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={landmark}
          />
        </View>
      </View>

      <View style={styles.legalRow}>
        <Ionicons color={colors.muted} name="document-text-outline" size={18} />
        <View style={styles.legalCopy}>
          <Text style={styles.legalTitle}>Terms and privacy</Text>
          <Text style={styles.legalText}>Current renter terms and privacy notice accepted.</Text>
        </View>
      </View>

      <PrimaryAction icon="checkmark" label="Save changes" loading={isSaving} onPress={() => void handleSave()} />

      <View style={styles.accountActions}>
        {!isDeletionPending ? (
          <SecondaryAction
            destructive
            icon="trash-outline"
            label="Request account deletion"
            onPress={() => setDeleteModalVisible(true)}
          />
        ) : null}
        <SecondaryAction icon="log-out-outline" label="Sign out" onPress={onSignOut} />
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setAreaModalVisible(false)}
        transparent
        visible={areaModalVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Delivery area</Text>
              <PressableScale accessibilityLabel="Close" accessibilityRole="button" onPress={() => setAreaModalVisible(false)}>
                <View style={styles.closeTarget}><Ionicons color={colors.ivory} name="close" size={22} /></View>
              </PressableScale>
            </View>
            {LAGOS_AREAS.map((area) => (
              <PressableScale
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedArea === area }}
                key={area}
                onPress={() => {
                  setSelectedArea(area);
                  setAreaModalVisible(false);
                }}
              >
                <View style={styles.sheetRow}>
                  <Text style={[styles.sheetRowText, selectedArea === area && styles.sheetRowTextSelected]}>{area}</Text>
                  {selectedArea === area ? <Ionicons color={colors.goldStrong} name="checkmark" size={20} /> : null}
                </View>
              </PressableScale>
            ))}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setDeleteModalVisible(false)}
        transparent
        visible={deleteModalVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Delete account</Text>
              <PressableScale accessibilityLabel="Close" accessibilityRole="button" onPress={() => setDeleteModalVisible(false)}>
                <View style={styles.closeTarget}><Ionicons color={colors.ivory} name="close" size={22} /></View>
              </PressableScale>
            </View>
            <Text style={styles.deleteCopy}>
              This requests permanent deletion and anonymization of your profile. Active rentals must finish first.
            </Text>
            <TextInput
              multiline
              numberOfLines={3}
              onChangeText={setDeletionReason}
              placeholder="Reason, if you want to share one"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.deleteInput]}
              value={deletionReason}
            />
            <View style={styles.sheetActions}>
              <SecondaryAction label="Cancel" onPress={() => setDeleteModalVisible(false)} />
              <PrimaryAction label="Submit deletion request" onPress={() => void handleConfirmDeletion()} />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

export function RenterProfileScreen() {
  const { signOut, user } = useAuth();
  const { profile, isLoading, isSaving, errorMessage, saveProfile, requestDeletion } = useRenterProfile();

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

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}><BrandWordmark compact withLogo /></View>
      {errorMessage ? (
        <View style={styles.outerNotice}><InlineNotice icon="alert-circle-outline" tone="danger">{errorMessage}</InlineNotice></View>
      ) : null}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.goldStrong} size="small" />
          <Text style={styles.loadingText}>Loading account</Text>
        </View>
      ) : (
        <RenterProfileForm
          isSaving={isSaving}
          onRequestDeletion={async (reason) => {
            await requestDeletion({ confirmation: true, reason });
          }}
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
  accountActions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderRadius: radii.md,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  avatarText: {
    color: colors.goldStrong,
    fontFamily: typography.display,
    fontSize: 23,
  },
  closeTarget: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  content: {
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  deleteCopy: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
  },
  deleteInput: {
    minHeight: 96,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  emailText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    marginTop: 3,
  },
  fieldGroup: {
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  legalCopy: { flex: 1 },
  legalRow: {
    alignItems: 'flex-start',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  legalText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: 2,
  },
  legalTitle: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  modalBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.66)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  optional: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
  },
  outerNotice: {
    paddingHorizontal: spacing.md,
  },
  profileCopy: { flex: 1 },
  profileHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  profileName: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 25,
    letterSpacing: -0.35,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  section: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.lg,
  },
  selector: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  selectorText: {
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 15,
  },
  sheet: {
    backgroundColor: colors.graphite,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    gap: spacing.sm,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  sheetActions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  sheetRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  sheetRowText: {
    color: colors.silver,
    fontFamily: typography.body,
    fontSize: 15,
  },
  sheetRowTextSelected: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
  },
  sheetTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 23,
  },
  topBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
});
