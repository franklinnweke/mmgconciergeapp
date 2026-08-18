import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import {
  LAGOS_AREA_LABELS,
  LagosAreaLabel,
  MIN_OWNER_DAILY_RATE_KOBO,
  MAX_OWNER_DAILY_RATE_KOBO,
  MIN_VEHICLE_YEAR,
  VehicleCategory,
  VehicleFeatureKey,
  VehicleFuelType,
  VehicleTransmission,
} from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { createOwnerFleetGateway } from '../data/owner-fleet-gateway';

const FEATURE_LABELS: Record<VehicleFeatureKey, string> = {
  climate_control: 'Dual-Zone Climate Control',
  leather: 'Executive Leather Upholstery',
  privacy_glass: 'Executive Privacy Glass',
  wifi: 'Onboard High-Speed Wi-Fi',
  panoramic_roof: 'Panoramic Sunroof',
  apple_carplay: 'Apple CarPlay Support',
  android_auto: 'Android Auto Support',
  third_row: 'Third Row Seating',
};

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
    return 'Please add and upload at least one vehicle photo before submitting for review.';
  }
  if (lower.includes('terms_stale')) {
    return 'Your owner agreement is outdated. Please review and accept the latest owner terms.';
  }
  if (lower.includes('stale') || lower.includes('modified by another') || lower.includes('refresh')) {
    return 'The vehicle record was updated during submission. Please refresh and try again.';
  }
  if (lower.includes('idempotency_conflict')) {
    return 'A submission with this request is already in progress. Please refresh.';
  }
  if (lower.includes('failed_precondition')) {
    return 'Vehicle listing cannot be submitted in its current state. Please verify all details.';
  }
  if (lower.includes('unauthenticated')) {
    return 'Please sign in to list your vehicle.';
  }
  if (lower.includes('permission') || lower.includes('forbidden')) {
    return 'You do not have authorization to perform this action.';
  }
  return 'Failed to submit vehicle listing. Please check the vehicle details and try again.';
}

export function AddVehicleWizardScreen() {
  const router = useRouter();
  const gateway = useMemo(() => createOwnerFleetGateway(), []);

  const [step, setStep] = useState<WizardStep>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submissionProgress, setSubmissionProgress] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Step 1: Specs (Clean Empty State)
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [category, setCategory] = useState<VehicleCategory>('executive_suv');
  const [colour, setColour] = useState('');
  const [seats, setSeats] = useState('');
  const [transmission, setTransmission] = useState<VehicleTransmission>('automatic');
  const [fuelType, setFuelType] = useState<VehicleFuelType>('petrol');

  // Step 2: Location & Plate (Clean Empty State)
  const [areaLabel, setAreaLabel] = useState<LagosAreaLabel>('Ikoyi');
  const [streetAddress, setStreetAddress] = useState('');
  const [plate, setPlate] = useState('');

  // Step 3: Rate
  const [dailyRateNaira, setDailyRateNaira] = useState('');

  // Step 4: Features & Description
  const [features, setFeatures] = useState<VehicleFeatureKey[]>([]);
  const [description, setDescription] = useState('');

  // Step 5: Photos (1 to 20 Photos Required)
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);

  const rateKobo = (parseInt(dailyRateNaira.replace(/[^0-9]/g, ''), 10) || 0) * 100;
  const ownerCommissionKobo = Math.round(rateKobo * 0.15);
  const ownerNetTakeHomeKobo = rateKobo - ownerCommissionKobo;

  const toggleFeature = (feat: VehicleFeatureKey) => {
    setFeatures((prev) =>
      prev.includes(feat) ? prev.filter((f) => f !== feat) : [...prev, feat],
    );
  };

  const pickPhotos = async () => {
    setErrorMsg(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Photo Permission Required',
          'MMG Concierge accesses your photo library to upload exterior and interior vehicle photos for moderation review.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: 20 - photos.length,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newSelected: SelectedPhoto[] = result.assets.map((asset, idx) => ({
          uri: asset.uri,
          fileName: asset.fileName || `vehicle-photo-${Date.now()}-${idx}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          fileSize: asset.fileSize,
        }));

        setPhotos((prev) => [...prev, ...newSelected].slice(0, 20));
      }
    } catch {
      setErrorMsg('Could not open photo library. Please check device permissions.');
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    setErrorMsg(null);

    if (step === 1) {
      const yr = parseInt(year, 10);
      const st = parseInt(seats, 10);
      if (!make.trim()) { setErrorMsg('Enter the vehicle make.'); return; }
      if (!model.trim()) { setErrorMsg('Enter the vehicle model.'); return; }
      if (isNaN(yr) || yr < MIN_VEHICLE_YEAR || yr > 2026) {
        setErrorMsg(`Year must be between ${MIN_VEHICLE_YEAR} and 2026.`);
        return;
      }
      if (!colour.trim()) { setErrorMsg('Enter the vehicle exterior colour.'); return; }
      if (isNaN(st) || st < 2 || st > 8) {
        setErrorMsg('Seats must be between 2 and 8.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!streetAddress.trim() || streetAddress.trim().length < 5) {
        setErrorMsg('Enter the full Lagos garage street address.');
        return;
      }
      const cleanPlate = plate.trim().toUpperCase();
      if (!/^[A-Z]{3}-?\d{3}[A-Z]{2}$/.test(cleanPlate)) {
        setErrorMsg('Enter a valid Nigerian registration plate (e.g. ABC-123XY or ABC123XY).');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      if (rateKobo < MIN_OWNER_DAILY_RATE_KOBO) {
        setErrorMsg(`Daily rate must be at least ₦${(MIN_OWNER_DAILY_RATE_KOBO / 100).toLocaleString()}.`);
        return;
      }
      if (rateKobo > MAX_OWNER_DAILY_RATE_KOBO) {
        setErrorMsg(`Daily rate cannot exceed ₦${(MAX_OWNER_DAILY_RATE_KOBO / 100).toLocaleString()}.`);
        return;
      }
      setStep(4);
    } else if (step === 4) {
      if (description.trim().length < 40) {
        setErrorMsg('Description must be at least 40 characters detailing the executive experience.');
        return;
      }
      if (description.trim().length > 2000) {
        setErrorMsg('Description cannot exceed 2,000 characters.');
        return;
      }
      setStep(5);
    } else if (step === 5) {
      if (photos.length < 1) {
        setErrorMsg('Please select at least 1 high-resolution vehicle photo before proceeding.');
        return;
      }
      setStep(6);
    }
  };

  const handleBack = () => {
    setErrorMsg(null);
    if (step > 1) {
      setStep((prev) => (prev - 1) as WizardStep);
    } else {
      router.back();
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const normalizedPlate = plate.trim().toUpperCase().includes('-')
        ? plate.trim().toUpperCase()
        : `${plate.trim().toUpperCase().substring(0, 3)}-${plate.trim().toUpperCase().substring(3)}`;

      // 1. Create draft
      setSubmissionProgress('Creating vehicle listing draft...');
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

      // 2. Upload and finalize photos
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        setSubmissionProgress(`Uploading photo ${i + 1} of ${photos.length}...`);

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

        setSubmissionProgress(`Processing image ${i + 1} of ${photos.length}...`);
        await gateway.finalizeImage({
          vehicleId,
          uploadId: uploadSession.result.uploadId,
          order: i,
        });
        latestVersion += 1;
      }

      // 3. Confirm authoritative version from server before submit
      const currentVehicle = await gateway.getOwnerVehicle(vehicleId);
      const submitExpectedVersion = currentVehicle?.version ?? latestVersion;

      setSubmissionProgress('Submitting listing for operations review...');
      await gateway.submitForReview({
        vehicleId,
        expectedVersion: submitExpectedVersion,
      });

      Alert.alert(
        'Listing Submitted',
        'Your luxury vehicle and photos have been submitted to the MMG Concierge operations desk for review. You can track the listing review status directly from your Fleet desk.',
        [
          {
            text: 'View Fleet',
            onPress: () => router.replace('/(owner)/fleet' as any),
          },
        ],
      );
    } catch (err: unknown) {
      setErrorMsg(mapVehicleError(err));
    } finally {
      setSubmitting(false);
      setSubmissionProgress('');
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <PressableScale accessibilityRole="button" onPress={handleBack} style={styles.backButton}>
            <Ionicons color={colors.ivory} name="arrow-back" size={20} />
          </PressableScale>
          <View style={styles.stepIndicator}>
            <Text style={styles.stepText}>STEP {step} OF 6</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(step / 6) * 100}%` }]} />
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {errorMsg ? (
            <View style={styles.errorBox}>
              <Ionicons color={colors.danger} name="alert-circle" size={18} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* STEP 1: Vehicle Specifications */}
          {step === 1 && (
            <View style={styles.stepContainer}>
              <Text style={styles.title}>Vehicle Specifications</Text>
              <Text style={styles.subtitle}>
                Specify the executive vehicle make, model, category, and capacity.
              </Text>

              <Text style={styles.fieldLabel}>CATEGORY</Text>
              <View style={styles.pillRow}>
                <PressableScale
                  onPress={() => setCategory('executive_suv')}
                  style={[styles.pill, category === 'executive_suv' && styles.pillSelected]}
                >
                  <Ionicons
                    color={category === 'executive_suv' ? colors.black : colors.ivory}
                    name="car-sport"
                    size={16}
                  />
                  <Text style={[styles.pillText, category === 'executive_suv' && styles.pillTextSelected]}>
                    Executive SUV
                  </Text>
                </PressableScale>
                <PressableScale
                  onPress={() => setCategory('executive_sedan')}
                  style={[styles.pill, category === 'executive_sedan' && styles.pillSelected]}
                >
                  <Ionicons
                    color={category === 'executive_sedan' ? colors.black : colors.ivory}
                    name="car"
                    size={16}
                  />
                  <Text style={[styles.pillText, category === 'executive_sedan' && styles.pillTextSelected]}>
                    Executive Saloon
                  </Text>
                </PressableScale>
              </View>

              <Text style={styles.fieldLabel}>MAKE</Text>
              <TextInput
                onChangeText={setMake}
                placeholder="e.g. Toyota, Mercedes-Benz, Lexus"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={make}
              />

              <Text style={styles.fieldLabel}>MODEL</Text>
              <TextInput
                onChangeText={setModel}
                placeholder="e.g. Land Cruiser Prado, S-Class, LX600"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={model}
              />

              <View style={styles.twoColumnRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>YEAR ({MIN_VEHICLE_YEAR}–2026)</Text>
                  <TextInput
                    keyboardType="number-pad"
                    maxLength={4}
                    onChangeText={setYear}
                    placeholder="2024"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    value={year}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>PASSENGER SEATS (2–8)</Text>
                  <TextInput
                    keyboardType="number-pad"
                    maxLength={1}
                    onChangeText={setSeats}
                    placeholder="7"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    value={seats}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>EXTERIOR COLOUR</Text>
              <TextInput
                onChangeText={setColour}
                placeholder="e.g. Obsidian Black, Pearl White, Deep Navy"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={colour}
              />

              <Text style={styles.fieldLabel}>TRANSMISSION</Text>
              <View style={styles.pillRow}>
                {(['automatic', 'manual'] as const).map((t) => (
                  <PressableScale
                    key={t}
                    onPress={() => setTransmission(t)}
                    style={[styles.pill, transmission === t && styles.pillSelected]}
                  >
                    <Text style={[styles.pillText, transmission === t && styles.pillTextSelected]}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </PressableScale>
                ))}
              </View>

              <Text style={styles.fieldLabel}>FUEL TYPE</Text>
              <View style={styles.pillRow}>
                {(['petrol', 'diesel', 'hybrid'] as const).map((f) => (
                  <PressableScale
                    key={f}
                    onPress={() => setFuelType(f)}
                    style={[styles.pill, fuelType === f && styles.pillSelected]}
                  >
                    <Text style={[styles.pillText, fuelType === f && styles.pillTextSelected]}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </View>
          )}

          {/* STEP 2: Base & Registration */}
          {step === 2 && (
            <View style={styles.stepContainer}>
              <Text style={styles.title}>Base & Registration</Text>
              <Text style={styles.subtitle}>
                Specify the Lagos home garage for dispatch and the Nigerian registration plate.
              </Text>

              <Text style={styles.fieldLabel}>PRIMARY LAGOS DISTRICT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
                <View style={styles.pillRow}>
                  {LAGOS_AREA_LABELS.map((area) => (
                    <PressableScale
                      key={area}
                      onPress={() => setAreaLabel(area)}
                      style={[styles.pill, areaLabel === area && styles.pillSelected]}
                    >
                      <Text style={[styles.pillText, areaLabel === area && styles.pillTextSelected]}>
                        {area}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.fieldLabel}>GARAGE STREET ADDRESS</Text>
              <TextInput
                onChangeText={setStreetAddress}
                placeholder="e.g. 15 Alexander Avenue, Ikoyi, Lagos"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={streetAddress}
              />
              <Text style={styles.helperText}>
                The physical garage is kept private. Renters only see the approximate district.
              </Text>

              <Text style={styles.fieldLabel}>NIGERIAN REGISTRATION PLATE</Text>
              <TextInput
                autoCapitalize="characters"
                onChangeText={setPlate}
                placeholder="e.g. ABC-123XY"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={plate}
              />
              <Text style={styles.helperText}>
                Plates are masked on public discovery and verified during staff moderation.
              </Text>
            </View>
          )}

          {/* STEP 3: Pricing */}
          {step === 3 && (
            <View style={styles.stepContainer}>
              <Text style={styles.title}>Chauffeured Daily Rate</Text>
              <Text style={styles.subtitle}>
                Set your daily rental rate in Nigerian Naira. Uniformed executive chauffeur and delivery are included.
              </Text>

              <Text style={styles.fieldLabel}>DAILY RATE (NGN)</Text>
              <View style={styles.currencyInputContainer}>
                <Text style={styles.currencyPrefix}>₦</Text>
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={(val) => setDailyRateNaira(val.replace(/[^0-9]/g, ''))}
                  placeholder="350,000"
                  placeholderTextColor={colors.muted}
                  style={styles.currencyInput}
                  value={dailyRateNaira ? parseInt(dailyRateNaira, 10).toLocaleString() : ''}
                />
              </View>

              <View style={styles.breakdownCard}>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Gross Daily Rate</Text>
                  <Text style={styles.breakdownValue}>{formatNairaFromKobo(rateKobo)}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>MMG Commission (15%)</Text>
                  <Text style={[styles.breakdownValue, { color: colors.muted }]}>
                    - {formatNairaFromKobo(ownerCommissionKobo)}
                  </Text>
                </View>
                <View style={styles.breakdownDivider} />
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: colors.goldStrong, fontFamily: typography.bodySemiBold }]}>
                    Your Net Take-Home
                  </Text>
                  <Text style={[styles.breakdownValue, { color: colors.goldStrong, fontFamily: typography.display, fontSize: 18 }]}>
                    {formatNairaFromKobo(ownerNetTakeHomeKobo)} / day
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* STEP 4: Features & Description */}
          {step === 4 && (
            <View style={styles.stepContainer}>
              <Text style={styles.title}>Amenities & Description</Text>
              <Text style={styles.subtitle}>
                Highlight luxury cabin features and write an executive description for VIP renters.
              </Text>

              <Text style={styles.fieldLabel}>LUXURY AMENITIES</Text>
              <View style={styles.featureGrid}>
                {(Object.keys(FEATURE_LABELS) as VehicleFeatureKey[]).map((feat) => {
                  const selected = features.includes(feat);
                  return (
                    <PressableScale
                      key={feat}
                      onPress={() => toggleFeature(feat)}
                      style={[styles.featurePill, selected && styles.featurePillSelected]}
                    >
                      <Ionicons
                        color={selected ? colors.black : colors.muted}
                        name={selected ? 'checkmark-circle' : 'add-circle-outline'}
                        size={16}
                      />
                      <Text style={[styles.featureText, selected && styles.featureTextSelected]}>
                        {FEATURE_LABELS[feat]}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>EXECUTIVE DESCRIPTION (MIN 40 CHARS)</Text>
              <TextInput
                multiline
                numberOfLines={4}
                onChangeText={setDescription}
                placeholder="Describe vehicle condition, chauffeur standards, interior comfort, and suited executive occasions..."
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.textArea]}
                value={description}
              />
              <Text style={styles.charCountText}>{description.length} / 2,000 characters</Text>
            </View>
          )}

          {/* STEP 5: Photos */}
          {step === 5 && (
            <View style={styles.stepContainer}>
              <Text style={styles.title}>Vehicle Photos</Text>
              <Text style={styles.subtitle}>
                Upload 1 to 20 pristine exterior and cabin photos. The first photo will be used as the primary cover.
              </Text>

              <PressableScale onPress={pickPhotos} style={styles.photoPickerButton}>
                <Ionicons color={colors.goldStrong} name="images-outline" size={24} />
                <Text style={styles.photoPickerText}>
                  {photos.length === 0 ? 'Select Photos from Library' : 'Add More Photos'}
                </Text>
                <Text style={styles.photoPickerSubtext}>High-resolution JPEG or PNG · Max 10MB each</Text>
              </PressableScale>

              <Text style={styles.fieldLabel}>SELECTED PHOTOS ({photos.length} / 20)</Text>

              {photos.length === 0 ? (
                <View style={styles.emptyPhotosBox}>
                  <Ionicons color={colors.muted} name="car-outline" size={36} />
                  <Text style={styles.emptyPhotosText}>No photos selected yet.</Text>
                  <Text style={styles.emptyPhotosSubtext}>At least 1 photo is required to submit for moderation.</Text>
                </View>
              ) : (
                <View style={styles.photoGrid}>
                  {photos.map((p, idx) => (
                    <View key={p.uri + idx} style={styles.photoThumbnailWrapper}>
                      <Image source={{ uri: p.uri }} style={styles.photoThumbnail} />
                      {idx === 0 && (
                        <View style={styles.primaryCoverBadge}>
                          <Text style={styles.primaryCoverText}>COVER</Text>
                        </View>
                      )}
                      <PressableScale onPress={() => removePhoto(idx)} style={styles.removePhotoBadge}>
                        <Ionicons color={colors.ivory} name="close" size={14} />
                      </PressableScale>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* STEP 6: Review & Final Submission */}
          {step === 6 && (
            <View style={styles.stepContainer}>
              <Text style={styles.title}>Review & Submit</Text>
              <Text style={styles.subtitle}>
                Confirm your listing details before sending to the MMG operations desk.
              </Text>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>{`${year} ${make} ${model}`}</Text>
                <Text style={styles.summaryCategory}>{category.replace('_', ' ').toUpperCase()} · {seats} SEATS · {colour}</Text>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Base District</Text>
                  <Text style={styles.summaryValue}>{areaLabel}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Garage Address</Text>
                  <Text style={styles.summaryValue}>{streetAddress}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Registration Plate</Text>
                  <Text style={styles.summaryValue}>{plate.toUpperCase()}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Daily Rate</Text>
                  <Text style={[styles.summaryValue, { color: colors.goldStrong, fontFamily: typography.display, fontSize: 16 }]}>
                    {formatNairaFromKobo(rateKobo)} / day
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Photos Attached</Text>
                  <Text style={styles.summaryValue}>{photos.length} photos</Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.includedRow}>
                  <Ionicons color={colors.success} name="shield-checkmark" size={16} />
                  <Text style={styles.includedText}>Executive Chauffeur & Lagos Delivery Included</Text>
                </View>
              </View>

              {submitting && submissionProgress ? (
                <View style={styles.progressNotice}>
                  <ActivityIndicator color={colors.goldStrong} size="small" />
                  <Text style={styles.progressNoticeText}>{submissionProgress}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Action Button */}
          <View style={styles.bottomBar}>
            {step < 6 ? (
              <PressableScale onPress={handleNext} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>CONTINUE</Text>
                <Ionicons color={colors.black} name="arrow-forward" size={16} />
              </PressableScale>
            ) : (
              <PressableScale
                disabled={submitting}
                onPress={handleSubmit}
                style={[styles.primaryButton, submitting && { opacity: 0.6 }]}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.black} size="small" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>SUBMIT FOR EXECUTIVE REVIEW</Text>
                    <Ionicons color={colors.black} name="checkmark-circle" size={18} />
                  </>
                )}
              </PressableScale>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    padding: spacing.xs,
  },
  bottomBar: {
    marginTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  breakdownCard: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  breakdownDivider: {
    backgroundColor: colors.line,
    height: 1,
    marginVertical: spacing.xs,
  },
  breakdownLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  breakdownRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
  },
  charCountText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  content: {
    padding: spacing.lg,
  },
  currencyInput: {
    color: colors.ivory,
    flex: 1,
    fontFamily: typography.display,
    fontSize: 24,
    paddingVertical: spacing.sm,
  },
  currencyInputContainer: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  currencyPrefix: {
    color: colors.goldStrong,
    fontFamily: typography.display,
    fontSize: 22,
  },
  emptyPhotosBox: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  emptyPhotosSubtext: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
  },
  emptyPhotosText: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
  },
  errorBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(209,133,120,0.12)',
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  featurePill: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  featurePillSelected: {
    backgroundColor: colors.goldStrong,
    borderColor: colors.goldStrong,
  },
  featureText: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  featureTextSelected: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
  },
  fieldLabel: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  helperText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
    marginTop: 4,
  },
  includedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  includedText: {
    color: colors.success,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  input: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 14,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoPickerButton: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.gold,
    borderRadius: radii.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 4,
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  photoPickerSubtext: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
  },
  photoPickerText: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
  },
  photoThumbnail: {
    borderRadius: radii.sm,
    height: 90,
    width: '100%',
  },
  photoThumbnailWrapper: {
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    position: 'relative',
    width: '31%',
  },
  pill: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pillSelected: {
    backgroundColor: colors.goldStrong,
    borderColor: colors.goldStrong,
  },
  pillText: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  pillTextSelected: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
    letterSpacing: 1.2,
  },
  primaryCoverBadge: {
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: 'absolute',
    top: 4,
  },
  primaryCoverText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: 8,
  },
  progressBar: {
    backgroundColor: colors.graphite,
    borderRadius: radii.pill,
    height: 4,
    overflow: 'hidden',
    width: 120,
  },
  progressFill: {
    backgroundColor: colors.goldStrong,
    height: '100%',
  },
  progressNotice: {
    alignItems: 'center',
    backgroundColor: 'rgba(227,195,101,0.1)',
    borderColor: colors.gold,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  progressNoticeText: {
    color: colors.gold,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  removePhotoBadge: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radii.pill,
    padding: 3,
    position: 'absolute',
    right: 4,
    top: 4,
  },
  safeArea: {
    backgroundColor: colors.black,
    flex: 1,
  },
  stepContainer: {
    gap: spacing.xs,
  },
  stepIndicator: {
    alignItems: 'flex-end',
    flex: 1,
    gap: 4,
  },
  stepText: {
    color: colors.muted,
    fontFamily: typography.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  summaryCard: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  summaryCategory: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  summaryDivider: {
    backgroundColor: colors.line,
    height: 1,
    marginVertical: spacing.xs,
  },
  summaryLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 20,
  },
  summaryValue: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  textArea: {
    minHeight: 100,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 24,
    letterSpacing: -0.4,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
