import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import {
  LAGOS_AREA_LABELS,
  MAX_OWNER_DAILY_RATE_KOBO,
  MIN_OWNER_DAILY_RATE_KOBO,
  MIN_VEHICLE_YEAR,
  type LagosAreaLabel,
  type VehicleCategory,
  type VehicleFeatureKey,
  type VehicleFuelType,
  type VehicleTransmission,
} from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import {
  FieldLabel,
  InlineNotice,
  MobileHeader,
  PrimaryAction,
  SectionHeading,
} from '@/components/ui/mobile-primitives';
import { createOwnerFleetGateway } from '../data/owner-fleet-gateway';

const FEATURE_LABELS: Record<VehicleFeatureKey, string> = {
  climate_control: 'Climate control',
  leather: 'Leather upholstery',
  privacy_glass: 'Privacy glass',
  wifi: 'Onboard Wi-Fi',
  panoramic_roof: 'Panoramic roof',
  apple_carplay: 'Apple CarPlay',
  android_auto: 'Android Auto',
  third_row: 'Third-row seating',
};

const STEP_TITLES = [
  'Vehicle details',
  'Garage & registration',
  'Daily rate',
  'Features',
  'Photos',
  'Review',
] as const;

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
type SelectedPhoto = {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
};

function mapVehicleError(err: unknown): string {
  if (!err) return 'An unexpected error occurred. Please try again.';
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes('not_approved_owner') || lower.includes('must be approved')) {
    return 'Your owner verification must be approved before you can list a vehicle.';
  }
  if (lower.includes('listing_incomplete') || lower.includes('at least 1') || lower.includes('no images')) {
    return 'Add and upload at least one vehicle photo before submitting for review.';
  }
  if (lower.includes('terms_stale')) {
    return 'Your owner agreement is outdated. Review and accept the latest owner terms.';
  }
  if (lower.includes('stale') || lower.includes('modified by another') || lower.includes('refresh')) {
    return 'The vehicle record changed during submission. Refresh and try again.';
  }
  if (lower.includes('idempotency_conflict')) {
    return 'A submission for this request is already in progress. Please refresh.';
  }
  if (lower.includes('failed_precondition')) {
    return 'This listing cannot be submitted in its current state. Check the details and try again.';
  }
  if (lower.includes('unauthenticated')) return 'Please sign in to list your vehicle.';
  if (lower.includes('permission') || lower.includes('forbidden')) {
    return 'You do not have authorization to perform this action.';
  }
  return 'The vehicle could not be submitted. Check the details and try again.';
}

export function AddVehicleWizardScreen() {
  const router = useRouter();
  const gateway = useMemo(() => createOwnerFleetGateway(), []);
  const [step, setStep] = useState<WizardStep>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submissionProgress, setSubmissionProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [areaPickerVisible, setAreaPickerVisible] = useState(false);

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [category, setCategory] = useState<VehicleCategory>('executive_suv');
  const [colour, setColour] = useState('');
  const [seats, setSeats] = useState('');
  const [transmission, setTransmission] = useState<VehicleTransmission>('automatic');
  const [fuelType, setFuelType] = useState<VehicleFuelType>('petrol');
  const [areaLabel, setAreaLabel] = useState<LagosAreaLabel>('Ikoyi');
  const [streetAddress, setStreetAddress] = useState('');
  const [plate, setPlate] = useState('');
  const [dailyRateNaira, setDailyRateNaira] = useState('');
  const [features, setFeatures] = useState<VehicleFeatureKey[]>([]);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);

  const rateKobo = (parseInt(dailyRateNaira.replace(/[^0-9]/g, ''), 10) || 0) * 100;

  const toggleFeature = (feature: VehicleFeatureKey) => {
    setFeatures((current) =>
      current.includes(feature)
        ? current.filter((item) => item !== feature)
        : [...current, feature],
    );
  };

  const pickPhotos = async () => {
    setErrorMsg(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Photo access required',
          'MMG Concierge uses your photo library only so you can upload exterior and interior vehicle photos for review.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: 20 - photos.length,
      });
      if (!result.canceled && result.assets?.length) {
        const nextPhotos: SelectedPhoto[] = result.assets.map((asset, index) => ({
          uri: asset.uri,
          fileName: asset.fileName || `vehicle-photo-${Date.now()}-${index}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          fileSize: asset.fileSize,
        }));
        setPhotos((current) => [...current, ...nextPhotos].slice(0, 20));
      }
    } catch {
      setErrorMsg('Could not open the photo library. Check device permissions and try again.');
    }
  };

  const handleNext = () => {
    setErrorMsg(null);
    if (step === 1) {
      const vehicleYear = parseInt(year, 10);
      const seatCount = parseInt(seats, 10);
      if (!make.trim()) return setErrorMsg('Enter the vehicle make.');
      if (!model.trim()) return setErrorMsg('Enter the vehicle model.');
      if (Number.isNaN(vehicleYear) || vehicleYear < MIN_VEHICLE_YEAR || vehicleYear > 2026) {
        return setErrorMsg(`Year must be between ${MIN_VEHICLE_YEAR} and 2026.`);
      }
      if (!colour.trim()) return setErrorMsg('Enter the vehicle exterior colour.');
      if (Number.isNaN(seatCount) || seatCount < 2 || seatCount > 8) {
        return setErrorMsg('Passenger seats must be between 2 and 8.');
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!streetAddress.trim() || streetAddress.trim().length < 5) {
        return setErrorMsg('Enter the full Lagos garage street address.');
      }
      const cleanPlate = plate.trim().toUpperCase();
      if (!/^[A-Z]{3}-?\d{3}[A-Z]{2}$/.test(cleanPlate)) {
        return setErrorMsg('Enter a valid Nigerian registration plate, for example ABC-123XY.');
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      if (rateKobo < MIN_OWNER_DAILY_RATE_KOBO) {
        return setErrorMsg(`Daily rate must be at least ₦${(MIN_OWNER_DAILY_RATE_KOBO / 100).toLocaleString()}.`);
      }
      if (rateKobo > MAX_OWNER_DAILY_RATE_KOBO) {
        return setErrorMsg(`Daily rate cannot exceed ₦${(MAX_OWNER_DAILY_RATE_KOBO / 100).toLocaleString()}.`);
      }
      setStep(4);
      return;
    }
    if (step === 4) {
      if (description.trim().length < 40) return setErrorMsg('Description must be at least 40 characters.');
      if (description.trim().length > 2000) return setErrorMsg('Description cannot exceed 2,000 characters.');
      setStep(5);
      return;
    }
    if (step === 5) {
      if (!photos.length) return setErrorMsg('Add at least one vehicle photo before continuing.');
      setStep(6);
    }
  };

  const handleBack = () => {
    setErrorMsg(null);
    if (step > 1) setStep((current) => (current - 1) as WizardStep);
    else router.back();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const upperPlate = plate.trim().toUpperCase();
      const normalizedPlate = upperPlate.includes('-')
        ? upperPlate
        : `${upperPlate.substring(0, 3)}-${upperPlate.substring(3)}`;

      setSubmissionProgress('Creating vehicle listing');
      const draftResult = await gateway.createDraft({
        specs: {
          make: make.trim(),
          model: model.trim(),
          year: parseInt(year, 10),
          category,
          colour: colour.trim(),
          seats: parseInt(seats, 10),
          transmission,
          fuelType,
          description: description.trim(),
          features,
        },
        areaLabel,
        baseAddress: {
          areaLabel,
          line1: streetAddress.trim(),
          city: 'Lagos',
          country: 'NG',
        },
        plate: normalizedPlate,
        ownerDailyRateKobo: rateKobo,
      });

      const vehicleId = draftResult.result.vehicleId;
      let latestVersion = draftResult.result.version;

      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index];
        setSubmissionProgress(`Uploading photo ${index + 1} of ${photos.length}`);
        const uploadSession = await gateway.createUploadSession({
          vehicleId,
          purpose: 'listing_image',
          contentType: photo.mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
          byteSize: photo.fileSize || 1024 * 500,
          originalFileName: photo.fileName,
        });
        await gateway.uploadVehiclePhoto(
          uploadSession.result.storagePath,
          photo.uri,
          photo.mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
        );
        setSubmissionProgress(`Processing photo ${index + 1} of ${photos.length}`);
        await gateway.finalizeImage({
          vehicleId,
          uploadId: uploadSession.result.uploadId,
          order: index,
        });
        latestVersion += 1;
      }

      const currentVehicle = await gateway.getOwnerVehicle(vehicleId);
      const submitExpectedVersion = currentVehicle?.version ?? latestVersion;
      setSubmissionProgress('Submitting for MMG review');
      await gateway.submitForReview({ vehicleId, expectedVersion: submitExpectedVersion });

      Alert.alert(
        'Vehicle submitted',
        'Your vehicle and photos were sent to MMG operations for review. You can track the status from Fleet.',
        [{ text: 'View fleet', onPress: () => router.replace('/(owner)/fleet' as never) }],
      );
    } catch (err: unknown) {
      setErrorMsg(mapVehicleError(err));
    } finally {
      setSubmitting(false);
      setSubmissionProgress('');
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.header}>
          <MobileHeader onBack={handleBack} title="Add vehicle" />
          <View style={styles.progressMeta}>
            <Text style={styles.stepLabel}>Step {step} of 6 · {STEP_TITLES[step - 1]}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(step / 6) * 100}%` }]} />
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {errorMsg ? <InlineNotice icon="alert-circle-outline" tone="danger">{errorMsg}</InlineNotice> : null}

          {step === 1 ? (
            <VehicleDetailsStep
              category={category}
              colour={colour}
              fuelType={fuelType}
              make={make}
              model={model}
              seats={seats}
              setCategory={setCategory}
              setColour={setColour}
              setFuelType={setFuelType}
              setMake={setMake}
              setModel={setModel}
              setSeats={setSeats}
              setTransmission={setTransmission}
              setYear={setYear}
              transmission={transmission}
              year={year}
            />
          ) : null}

          {step === 2 ? (
            <View>
              <StepIntro title="Garage & registration" subtitle="Your exact garage and plate stay private. Renters only see the approximate Lagos area." />
              <FieldGroup label="Operating area">
                <PressableScale accessibilityRole="button" onPress={() => setAreaPickerVisible(true)}>
                  <View style={styles.selector}>
                    <Text style={styles.selectorText}>{areaLabel}</Text>
                    <Ionicons color={colors.muted} name="chevron-down" size={18} />
                  </View>
                </PressableScale>
              </FieldGroup>
              <FieldGroup label="Garage street address">
                <TextInput
                  onChangeText={setStreetAddress}
                  placeholder="15 Alexander Avenue, Ikoyi"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={streetAddress}
                />
              </FieldGroup>
              <FieldGroup label="Nigerian registration plate">
                <TextInput
                  autoCapitalize="characters"
                  onChangeText={setPlate}
                  placeholder="ABC-123XY"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={plate}
                />
              </FieldGroup>
              <InlineNotice icon="lock-closed-outline">Exact garage address and plate are private and used only for owner operations and moderation.</InlineNotice>
            </View>
          ) : null}

          {step === 3 ? (
            <View>
              <StepIntro title="Daily rate" subtitle="Set the owner rate for one rental day. MMG calculates renter totals and owner earnings from the active pricing configuration." />
              <FieldGroup label="Daily rate">
                <View style={styles.currencyRow}>
                  <Text style={styles.currencyPrefix}>₦</Text>
                  <TextInput
                    keyboardType="number-pad"
                    onChangeText={(value) => setDailyRateNaira(value.replace(/[^0-9]/g, ''))}
                    placeholder="350,000"
                    placeholderTextColor={colors.muted}
                    style={styles.currencyInput}
                    value={dailyRateNaira ? parseInt(dailyRateNaira, 10).toLocaleString() : ''}
                  />
                </View>
              </FieldGroup>
              <View style={styles.ratePreview}>
                <Text style={styles.ratePreviewLabel}>Owner daily rate</Text>
                <Text style={styles.ratePreviewValue}>{formatNairaFromKobo(rateKobo)}</Text>
              </View>
            </View>
          ) : null}

          {step === 4 ? (
            <View>
              <StepIntro title="Features & description" subtitle="Only select features that are actually present on this vehicle." />
              <View style={styles.sectionBlock}>
                <SectionHeading>Features</SectionHeading>
                <View style={styles.choiceList}>
                  {(Object.keys(FEATURE_LABELS) as VehicleFeatureKey[]).map((feature) => (
                    <CheckRow
                      checked={features.includes(feature)}
                      key={feature}
                      label={FEATURE_LABELS[feature]}
                      onPress={() => toggleFeature(feature)}
                    />
                  ))}
                </View>
              </View>
              <FieldGroup label="Description">
                <TextInput
                  maxLength={2000}
                  multiline
                  numberOfLines={5}
                  onChangeText={setDescription}
                  placeholder="Describe the condition, interior and service experience."
                  placeholderTextColor={colors.muted}
                  style={[styles.input, styles.textArea]}
                  value={description}
                />
                <Text style={styles.counter}>{description.length}/2,000 · minimum 40</Text>
              </FieldGroup>
            </View>
          ) : null}

          {step === 5 ? (
            <View>
              <StepIntro title="Photos" subtitle="Add 1 to 20 clear exterior and interior photos. The first photo becomes the cover." />
              <PressableScale accessibilityRole="button" haptic="light" onPress={() => void pickPhotos()}>
                <View style={styles.photoAction}>
                  <Ionicons color={colors.goldStrong} name="images-outline" size={24} />
                  <View style={styles.photoActionCopy}>
                    <Text style={styles.photoActionTitle}>{photos.length ? 'Add more photos' : 'Choose photos'}</Text>
                    <Text style={styles.photoActionBody}>JPEG or PNG · up to 10 MB each</Text>
                  </View>
                  <Ionicons color={colors.muted} name="chevron-forward" size={18} />
                </View>
              </PressableScale>
              <Text style={styles.photoCount}>{photos.length} of 20 selected</Text>
              {photos.length ? (
                <View style={styles.photoGrid}>
                  {photos.map((photo, index) => (
                    <View key={`${photo.uri}-${index}`} style={styles.photoTile}>
                      <Image contentFit="cover" source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} />
                      {index === 0 ? <View style={styles.coverLabel}><Text style={styles.coverLabelText}>Cover</Text></View> : null}
                      <PressableScale accessibilityLabel={`Remove photo ${index + 1}`} accessibilityRole="button" onPress={() => setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                        <View style={styles.removePhoto}><Ionicons color={colors.ivory} name="close" size={16} /></View>
                      </PressableScale>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyPhotos}>No photos selected yet.</Text>
              )}
            </View>
          ) : null}

          {step === 6 ? (
            <View>
              <StepIntro title="Review your vehicle" subtitle="Check these details before sending the listing to MMG operations." />
              <View style={styles.reviewSection}>
                <SectionHeading>{`${year} ${make} ${model}`}</SectionHeading>
                <ReviewRow label="Category" value={category === 'executive_suv' ? 'Executive SUV' : 'Executive sedan'} />
                <ReviewRow label="Seats" value={seats} />
                <ReviewRow label="Colour" value={colour} />
                <ReviewRow label="Transmission" value={transmission.charAt(0).toUpperCase() + transmission.slice(1)} />
                <ReviewRow label="Fuel" value={fuelType.charAt(0).toUpperCase() + fuelType.slice(1)} />
                <ReviewRow label="Base area" value={areaLabel} />
                <ReviewRow label="Garage address" value={streetAddress} />
                <ReviewRow label="Registration" value={plate.toUpperCase()} />
                <ReviewRow label="Daily rate" value={formatNairaFromKobo(rateKobo)} />
                <ReviewRow label="Photos" value={`${photos.length}`} />
              </View>
              {submitting && submissionProgress ? (
                <View style={styles.submissionProgress} accessibilityLiveRegion="polite">
                  <ActivityIndicator color={colors.goldStrong} size="small" />
                  <Text style={styles.submissionProgressText}>{submissionProgress}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.primaryArea}>
            {step < 6 ? (
              <PrimaryAction icon="arrow-forward" label="Continue" onPress={handleNext} />
            ) : (
              <PrimaryAction icon="checkmark" label="Submit for review" loading={submitting} onPress={() => void handleSubmit()} />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal animationType="slide" onRequestClose={() => setAreaPickerVisible(false)} transparent visible={areaPickerVisible}>
        <View style={styles.modalBackdrop}>
          <Pressable onPress={() => setAreaPickerVisible(false)} style={StyleSheet.absoluteFill} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Operating area</Text>
              <PressableScale accessibilityLabel="Close" accessibilityRole="button" onPress={() => setAreaPickerVisible(false)}>
                <View style={styles.closeTarget}><Ionicons color={colors.ivory} name="close" size={22} /></View>
              </PressableScale>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {LAGOS_AREA_LABELS.map((area) => (
                <PressableScale
                  accessibilityRole="radio"
                  accessibilityState={{ selected: areaLabel === area }}
                  key={area}
                  onPress={() => {
                    setAreaLabel(area);
                    setAreaPickerVisible(false);
                  }}
                >
                  <View style={styles.sheetRow}>
                    <Text style={[styles.sheetRowText, areaLabel === area && styles.sheetRowTextSelected]}>{area}</Text>
                    {areaLabel === area ? <Ionicons color={colors.goldStrong} name="checkmark" size={20} /> : null}
                  </View>
                </PressableScale>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function VehicleDetailsStep(props: {
  category: VehicleCategory;
  colour: string;
  fuelType: VehicleFuelType;
  make: string;
  model: string;
  seats: string;
  transmission: VehicleTransmission;
  year: string;
  setCategory: (value: VehicleCategory) => void;
  setColour: (value: string) => void;
  setFuelType: (value: VehicleFuelType) => void;
  setMake: (value: string) => void;
  setModel: (value: string) => void;
  setSeats: (value: string) => void;
  setTransmission: (value: VehicleTransmission) => void;
  setYear: (value: string) => void;
}) {
  return (
    <View>
      <StepIntro title="Vehicle details" subtitle="Enter the facts MMG will review before this vehicle can appear to renters." />
      <View style={styles.sectionBlock}>
        <SectionHeading>Category</SectionHeading>
        <ChoiceRow label="Executive SUV" onPress={() => props.setCategory('executive_suv')} selected={props.category === 'executive_suv'} />
        <ChoiceRow label="Executive sedan" onPress={() => props.setCategory('executive_sedan')} selected={props.category === 'executive_sedan'} />
      </View>
      <FieldGroup label="Make">
        <TextInput onChangeText={props.setMake} placeholder="Toyota" placeholderTextColor={colors.muted} style={styles.input} value={props.make} />
      </FieldGroup>
      <FieldGroup label="Model">
        <TextInput onChangeText={props.setModel} placeholder="Land Cruiser Prado" placeholderTextColor={colors.muted} style={styles.input} value={props.model} />
      </FieldGroup>
      <View style={styles.twoColumn}>
        <View style={styles.flex}>
          <FieldGroup label={`Year (${MIN_VEHICLE_YEAR}–2026)`}>
            <TextInput keyboardType="number-pad" maxLength={4} onChangeText={props.setYear} placeholder="2024" placeholderTextColor={colors.muted} style={styles.input} value={props.year} />
          </FieldGroup>
        </View>
        <View style={styles.flex}>
          <FieldGroup label="Passenger seats">
            <TextInput keyboardType="number-pad" maxLength={1} onChangeText={props.setSeats} placeholder="6" placeholderTextColor={colors.muted} style={styles.input} value={props.seats} />
          </FieldGroup>
        </View>
      </View>
      <FieldGroup label="Exterior colour">
        <TextInput onChangeText={props.setColour} placeholder="Obsidian Black" placeholderTextColor={colors.muted} style={styles.input} value={props.colour} />
      </FieldGroup>
      <View style={styles.sectionBlock}>
        <SectionHeading>Transmission</SectionHeading>
        {(['automatic', 'manual'] as const).map((value) => (
          <ChoiceRow key={value} label={value.charAt(0).toUpperCase() + value.slice(1)} onPress={() => props.setTransmission(value)} selected={props.transmission === value} />
        ))}
      </View>
      <View style={styles.sectionBlock}>
        <SectionHeading>Fuel</SectionHeading>
        {(['petrol', 'diesel', 'hybrid'] as const).map((value) => (
          <ChoiceRow key={value} label={value.charAt(0).toUpperCase() + value.slice(1)} onPress={() => props.setFuelType(value)} selected={props.fuelType === value} />
        ))}
      </View>
    </View>
  );
}

function StepIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.stepIntro}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

function FieldGroup({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <View style={styles.fieldGroup}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </View>
  );
}

function ChoiceRow({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return (
    <PressableScale accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress}>
      <View style={styles.choiceRow}>
        <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
        <Ionicons color={selected ? colors.goldStrong : colors.lineStrong} name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} />
      </View>
    </PressableScale>
  );
}

function CheckRow({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress}>
      <View style={styles.choiceRow}>
        <Text style={[styles.choiceText, checked && styles.choiceTextSelected]}>{label}</Text>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked ? <Ionicons color={colors.black} name="checkmark" size={14} /> : null}
        </View>
      </View>
    </PressableScale>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.xs,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: colors.goldStrong,
    borderColor: colors.goldStrong,
  },
  choiceList: { marginTop: spacing.sm },
  choiceRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  choiceText: {
    color: colors.silver,
    fontFamily: typography.body,
    fontSize: 14,
  },
  choiceTextSelected: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
  },
  closeTarget: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  content: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  counter: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  coverLabel: {
    backgroundColor: 'rgba(4,4,4,.72)',
    borderRadius: radii.xs,
    left: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    position: 'absolute',
    top: spacing.xs,
  },
  coverLabelText: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: 10,
  },
  currencyInput: {
    color: colors.ivory,
    flex: 1,
    fontFamily: typography.display,
    fontSize: 25,
    paddingVertical: 0,
  },
  currencyPrefix: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 20,
  },
  currencyRow: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 58,
    paddingHorizontal: spacing.md,
  },
  emptyPhotos: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    marginTop: spacing.lg,
  },
  fieldGroup: { marginTop: spacing.md },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.md },
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
  modalBackdrop: {
    backgroundColor: 'rgba(0,0,0,.68)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  photoAction: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 74,
    marginTop: spacing.lg,
  },
  photoActionBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
    marginTop: 2,
  },
  photoActionCopy: { flex: 1 },
  photoActionTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
  },
  photoCount: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    marginTop: spacing.md,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  photoTile: {
    backgroundColor: colors.graphite,
    borderRadius: radii.sm,
    height: 112,
    overflow: 'hidden',
    width: '48%',
  },
  primaryArea: { marginTop: spacing.xl },
  progressFill: {
    backgroundColor: colors.goldStrong,
    height: '100%',
  },
  progressMeta: { paddingBottom: spacing.sm },
  progressTrack: {
    backgroundColor: colors.line,
    borderRadius: radii.pill,
    height: 2,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  ratePreview: {
    alignItems: 'baseline',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
  },
  ratePreviewLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  ratePreviewValue: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 23,
  },
  removePhoto: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,4,4,.74)',
    borderRadius: radii.pill,
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xs,
    top: spacing.xs,
    width: 32,
  },
  reviewLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    width: 108,
  },
  reviewRow: {
    alignItems: 'flex-start',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 54,
    paddingVertical: spacing.md,
  },
  reviewSection: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  reviewValue: {
    color: colors.silver,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    textAlign: 'right',
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  sectionBlock: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
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
    maxHeight: '72%',
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
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
  stepIntro: { marginTop: spacing.lg },
  stepLabel: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
  },
  submissionProgress: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
  },
  submissionProgressText: {
    color: colors.silver,
    flex: 1,
    fontFamily: typography.body,
    fontSize: 13,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  textArea: {
    minHeight: 120,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 31,
    letterSpacing: -0.55,
  },
  twoColumn: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
