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
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ScreenHeader } from '@/components/screen-header';
import { useAuth } from '@/core/auth/auth-context';
import { createOwnerFleetGateway } from '../data/owner-fleet-gateway';
import {
  createOwnerVehicleEditorGateway,
  type VehicleEditorSeed,
} from '../data/owner-vehicle-editor-gateway';
import {
  clearOwnerVehicleEditorSession,
  getOwnerVehicleEditorSession,
  saveOwnerVehicleEditorSession,
  type OwnerVehicleEditorStep,
} from '../data/owner-vehicle-editor-store';
import {
  validateVehiclePhotoCandidate,
  VehiclePhotoValidationError,
  type ValidatedVehiclePhoto,
} from '../domain/vehicle-photo-preflight';

const MAX_YEAR = 2035;

const FEATURE_LABELS: Record<VehicleFeatureKey, string> = {
  climate_control: 'Climate control',
  leather: 'Leather interior',
  privacy_glass: 'Privacy glass',
  wifi: 'Wi-Fi',
  panoramic_roof: 'Panoramic roof',
  apple_carplay: 'Apple CarPlay',
  android_auto: 'Android Auto',
  third_row: 'Third-row seating',
};

function normalizedPlate(value: string) {
  const compact = value.trim().toUpperCase().replace(/-/g, '');
  return compact.length === 8 ? `${compact.slice(0, 3)}-${compact.slice(3)}` : value.trim().toUpperCase();
}

function friendlyVehicleError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes('must be approved') || message.includes('not_approved_owner')) {
    return 'Your owner verification must be approved before you can manage vehicle listings.';
  }
  if (message.includes('image_dimensions') || message.includes('pixels') || message.includes('resolution')) {
    return error instanceof Error ? error.message : 'Photo resolution is too low. Vehicle photos must be at least 1280×720 pixels.';
  }
  if (message.includes('stale') || message.includes('modified') || message.includes('version')) {
    return 'This listing changed while you were editing it. Reopen it from Fleet and try again.';
  }
  if (message.includes('listing_incomplete') || message.includes('complete all required')) {
    return 'Complete the required vehicle details and add at least one usable photo before submitting.';
  }
  if (message.includes('permission') || message.includes('forbidden')) {
    return 'You are not authorized to update this vehicle.';
  }
  return 'We could not save this vehicle listing. Check your connection and try again.';
}

export function OwnerVehicleEditorScreen() {
  const router = useRouter();
  const { vehicleId: routeVehicleId } = useLocalSearchParams<{ vehicleId?: string }>();
  const { user } = useAuth();
  const fleetGateway = useMemo(() => createOwnerFleetGateway(), []);
  const editorGateway = useMemo(() => createOwnerVehicleEditorGateway(), []);

  const [step, setStep] = useState<OwnerVehicleEditorStep>(1);
  const [vehicleId, setVehicleId] = useState<string | null>(routeVehicleId ?? null);
  const [version, setVersion] = useState<number | null>(null);
  const [moderationStatus, setModerationStatus] = useState<'draft' | 'rejected'>('draft');
  const [usableImageCount, setUsableImageCount] = useState(0);
  const [rejectedImageCount, setRejectedImageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [areaModalVisible, setAreaModalVisible] = useState(false);

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
  const [photos, setPhotos] = useState<ValidatedVehiclePhoto[]>([]);

  const rateKobo = (Number.parseInt(dailyRateNaira || '0', 10) || 0) * 100;
  const isCorrection = moderationStatus === 'rejected';

  const hydrate = useCallback((seed: VehicleEditorSeed, resumeStep: OwnerVehicleEditorStep = 1) => {
    setVehicleId(seed.vehicleId);
    setVersion(seed.version);
    setModerationStatus(seed.moderationStatus === 'rejected' ? 'rejected' : 'draft');
    setUsableImageCount(seed.usableImageCount);
    setRejectedImageCount(seed.rejectedImageCount);
    setMake(seed.make);
    setModel(seed.model);
    setYear(seed.year ? String(seed.year) : '');
    setCategory(seed.category);
    setColour(seed.colour);
    setSeats(seed.seats ? String(seed.seats) : '');
    setTransmission(seed.transmission);
    setFuelType(seed.fuelType);
    setAreaLabel(seed.areaLabel || 'Ikoyi');
    setStreetAddress(seed.streetAddress);
    setPlate(seed.plate);
    setDailyRateNaira(seed.ownerDailyRateKobo ? String(Math.round(seed.ownerDailyRateKobo / 100)) : '');
    setDescription(seed.description);
    setFeatures(seed.features);
    setStep(resumeStep);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const ownerId = user?.uid;
      if (!ownerId) {
        if (active) setLoading(false);
        return;
      }
      try {
        let targetId = routeVehicleId;
        let targetStep: OwnerVehicleEditorStep = 1;
        if (!targetId) {
          const session = await getOwnerVehicleEditorSession(ownerId);
          targetId = session?.vehicleId;
          targetStep = session?.step ?? 1;
        }
        if (targetId) {
          const seed = await editorGateway.getSeed(targetId);
          if (seed && (seed.moderationStatus === 'draft' || seed.moderationStatus === 'rejected')) {
            if (active) hydrate(seed, routeVehicleId ? 1 : targetStep);
          } else if (!routeVehicleId) {
            await clearOwnerVehicleEditorSession(ownerId);
          }
        }
      } catch (caught) {
        if (active) setError(friendlyVehicleError(caught));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [editorGateway, hydrate, routeVehicleId, user?.uid]);

  const persistStep = useCallback(async (nextStep: OwnerVehicleEditorStep, id = vehicleId) => {
    if (!user?.uid || !id) return;
    await saveOwnerVehicleEditorSession(user.uid, {
      vehicleId: id,
      step: nextStep,
      updatedAt: new Date().toISOString(),
    });
  }, [user, vehicleId]);

  const runUpdate = useCallback(async (
    data: Omit<Parameters<typeof editorGateway.updateDraft>[0], 'vehicleId' | 'expectedVersion'>,
  ) => {
    if (!vehicleId || !version) throw new Error('Vehicle draft is not ready.');
    const result = await editorGateway.updateDraft({
      vehicleId,
      expectedVersion: version,
      ...data,
    });
    setVersion(result.version);
    setModerationStatus(result.moderationStatus);
    setUsableImageCount(result.imageCount);
    return result;
  }, [editorGateway, vehicleId, version]);

  const validateStep = (current: OwnerVehicleEditorStep): string | null => {
    if (current === 1) {
      const parsedYear = Number.parseInt(year, 10);
      const parsedSeats = Number.parseInt(seats, 10);
      if (!make.trim()) return 'Enter the vehicle make.';
      if (!model.trim()) return 'Enter the vehicle model.';
      if (!Number.isInteger(parsedYear) || parsedYear < MIN_VEHICLE_YEAR || parsedYear > MAX_YEAR) {
        return `Year must be between ${MIN_VEHICLE_YEAR} and ${MAX_YEAR}.`;
      }
      if (!colour.trim()) return 'Enter the vehicle exterior colour.';
      if (!Number.isInteger(parsedSeats) || parsedSeats < 2 || parsedSeats > 8) return 'Passenger seats must be between 2 and 8.';
    }
    if (current === 2) {
      if (streetAddress.trim().length < 5) return 'Enter the Lagos garage street address.';
      if (!/^[A-Z]{3}-?\d{3}[A-Z]{2}$/i.test(plate.trim())) return 'Enter a valid Nigerian registration plate, for example ABC-123XY.';
    }
    if (current === 3) {
      if (rateKobo < MIN_OWNER_DAILY_RATE_KOBO) return `Daily rate must be at least ${formatNairaFromKobo(MIN_OWNER_DAILY_RATE_KOBO)}.`;
      if (rateKobo > MAX_OWNER_DAILY_RATE_KOBO) return `Daily rate cannot exceed ${formatNairaFromKobo(MAX_OWNER_DAILY_RATE_KOBO)}.`;
    }
    if (current === 4) {
      if (description.trim().length < 40) return 'Description must be at least 40 characters.';
      if (description.trim().length > 2000) return 'Description cannot exceed 2,000 characters.';
    }
    if (current === 5 && usableImageCount + rejectedImageCount + photos.length < 1) {
      return 'Add at least one vehicle photo before review.';
    }
    return null;
  };

  const saveCurrentStep = async () => {
    const validation = validateStep(step);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (step === 1) {
        const specs = {
          make: make.trim(),
          model: model.trim(),
          year: Number.parseInt(year, 10),
          colour: colour.trim(),
          category,
          seats: Number.parseInt(seats, 10),
          transmission,
          fuelType,
        };
        if (!vehicleId) {
          setProgress('Saving vehicle draft…');
          const created = await fleetGateway.createDraft({ specs });
          setVehicleId(created.result.vehicleId);
          setVersion(created.result.version);
          setModerationStatus('draft');
          await persistStep(2, created.result.vehicleId);
        } else {
          setProgress('Saving specifications…');
          await runUpdate({ specs });
          await persistStep(2);
        }
        setStep(2);
      } else if (step === 2) {
        setProgress('Saving garage details…');
        await runUpdate({
          areaLabel,
          baseAddress: { line1: streetAddress.trim(), areaLabel, city: 'Lagos', country: 'NG' },
          plate: normalizedPlate(plate),
        });
        await persistStep(3);
        setStep(3);
      } else if (step === 3) {
        setProgress('Saving rate…');
        await runUpdate({ ownerDailyRateKobo: rateKobo });
        await persistStep(4);
        setStep(4);
      } else if (step === 4) {
        setProgress('Saving listing details…');
        await runUpdate({ specs: { description: description.trim(), features } });
        await persistStep(5);
        setStep(5);
      } else if (step === 5) {
        let completed = 0;
        try {
          for (let index = 0; index < photos.length; index += 1) {
            const photo = photos[index]!;
            setProgress(`Uploading photo ${index + 1} of ${photos.length}…`);
            if (!vehicleId) throw new Error('Vehicle draft is missing.');
            const upload = await fleetGateway.createUploadSession({
              vehicleId,
              purpose: 'listing_image',
              contentType: photo.mimeType,
              byteSize: photo.fileSize,
              originalFileName: photo.fileName,
            });
            await fleetGateway.uploadVehiclePhoto(upload.result.storagePath, photo.uri, photo.mimeType);
            setProgress(`Processing photo ${index + 1} of ${photos.length}…`);
            await fleetGateway.finalizeImage({
              vehicleId,
              uploadId: upload.result.uploadId,
              order: usableImageCount + completed,
            });
            completed += 1;
          }
        } finally {
          if (completed > 0) {
            setUsableImageCount((count) => count + completed);
            setPhotos((selected) => selected.slice(completed));
          }
        }

        if (completed === 0 && usableImageCount === 0 && rejectedImageCount > 0) {
          setProgress('Preparing existing photos for another review…');
          const result = await runUpdate({ reuseRejectedImages: true });
          setUsableImageCount(result.imageCount);
          setRejectedImageCount(0);
        }

        const refreshed = vehicleId ? await fleetGateway.getOwnerVehicle(vehicleId) : null;
        if (refreshed) setVersion(refreshed.version);
        await persistStep(6);
        setStep(6);
      }
    } catch (caught) {
      setError(friendlyVehicleError(caught));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const submitForReview = async () => {
    if (!vehicleId || busy) return;
    setBusy(true);
    setError(null);
    setProgress('Submitting listing for MMG review…');
    try {
      const current = await fleetGateway.getOwnerVehicle(vehicleId);
      if (!current) throw new Error('Vehicle listing could not be refreshed.');
      await fleetGateway.submitForReview({ vehicleId, expectedVersion: current.version });
      if (user?.uid) await clearOwnerVehicleEditorSession(user.uid);
      router.replace('/(owner)/fleet' as Href);
    } catch (caught) {
      setError(friendlyVehicleError(caught));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const pickPhotos = async () => {
    if (busy) return;
    setError(null);
    const remaining = Math.max(0, 20 - usableImageCount - photos.length);
    if (remaining === 0) {
      setError('This listing already has the maximum of 20 active photos.');
      return;
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Allow photo-library access to add vehicle listing photos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
      });
      if (result.canceled) return;
      const accepted: ValidatedVehiclePhoto[] = [];
      const messages = new Set<string>();
      result.assets.forEach((asset, index) => {
        try {
          accepted.push(validateVehiclePhotoCandidate({
            uri: asset.uri,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            fileSize: asset.fileSize,
            width: asset.width,
            height: asset.height,
          }, `vehicle-photo-${Date.now()}-${index}`));
        } catch (caught) {
          messages.add(caught instanceof VehiclePhotoValidationError ? caught.message : 'A selected photo could not be used.');
        }
      });
      setPhotos((current) => [...current, ...accepted].slice(0, remaining + current.length));
      if (messages.size) setError([...messages].join(' '));
    } catch {
      setError('Could not open the photo library. Check device permissions and try again.');
    }
  };

  const goBack = () => {
    if (busy) return;
    setError(null);
    if (step > 1) {
      const previous = (step - 1) as OwnerVehicleEditorStep;
      setStep(previous);
      void persistStep(previous);
    } else {
      router.back();
    }
  };

  const editStep = (nextStep: OwnerVehicleEditorStep) => {
    if (busy) return;
    setStep(nextStep);
    void persistStep(nextStep);
  };

  const toggleFeature = (feature: VehicleFeatureKey) => {
    if (busy) return;
    setFeatures((current) => current.includes(feature)
      ? current.filter((item) => item !== feature)
      : [...current, feature]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.goldStrong} />
          <Text style={styles.muted}>Loading vehicle draft…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.header}>
          <ScreenHeader
            backAccessibilityLabel={step === 1 ? 'Return to fleet' : 'Previous step'}
            onBack={goBack}
            showBrand={false}
            title={isCorrection ? 'Correct listing' : vehicleId ? 'Vehicle draft' : 'List a vehicle'}
          />
          <Text style={styles.stepText}>Step {step} of 6</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {isCorrection ? (
            <View style={styles.notice}>
              <Ionicons color={colors.goldStrong} name="information-circle-outline" size={18} />
              <Text style={styles.noticeText}>Update the requested details, review the listing, then send the same vehicle back to MMG.</Text>
            </View>
          ) : null}

          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}

          {step === 1 ? (
            <View style={styles.section}>
              <Text style={styles.title}>Vehicle details</Text>
              <Text style={styles.subtitle}>Start with the facts renters and MMG need to identify the car.</Text>
              <ChoiceRow
                options={[['executive_suv', 'Executive SUV'], ['executive_sedan', 'Executive sedan']]}
                selected={category}
                onSelect={(value) => setCategory(value as VehicleCategory)}
              />
              <Field label="Make" value={make} onChangeText={setMake} placeholder="Toyota, Lexus, Mercedes-Benz" />
              <Field label="Model" value={model} onChangeText={setModel} placeholder="Land Cruiser Prado" />
              <View style={styles.twoColumns}>
                <View style={styles.flex}><Field keyboardType="number-pad" label="Year" value={year} onChangeText={setYear} placeholder="2024" /></View>
                <View style={styles.flex}><Field keyboardType="number-pad" label="Passenger seats" value={seats} onChangeText={setSeats} placeholder="7" /></View>
              </View>
              <Field label="Exterior colour" value={colour} onChangeText={setColour} placeholder="Pearl white" />
              <Text style={styles.label}>Transmission</Text>
              <ChoiceRow options={[['automatic', 'Automatic'], ['manual', 'Manual']]} selected={transmission} onSelect={(value) => setTransmission(value as VehicleTransmission)} />
              <Text style={styles.label}>Fuel type</Text>
              <ChoiceRow options={[['petrol', 'Petrol'], ['diesel', 'Diesel'], ['hybrid', 'Hybrid']]} selected={fuelType} onSelect={(value) => setFuelType(value as VehicleFuelType)} />
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.section}>
              <Text style={styles.title}>Garage and registration</Text>
              <Text style={styles.subtitle}>The exact garage address and plate stay private from renters.</Text>
              <Text style={styles.label}>Lagos operating area</Text>
              <PressableScale disabled={busy} onPress={() => setAreaModalVisible(true)}>
                <View style={styles.selector}>
                  <Text style={styles.selectorText}>{areaLabel}</Text>
                  <Ionicons color={colors.muted} name="chevron-down" size={18} />
                </View>
              </PressableScale>
              <Field label="Garage street address" value={streetAddress} onChangeText={setStreetAddress} placeholder="15 Alexander Avenue, Ikoyi" />
              <Field autoCapitalize="characters" label="Nigerian registration plate" value={plate} onChangeText={setPlate} placeholder="ABC-123XY" />
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.section}>
              <Text style={styles.title}>Daily rate</Text>
              <Text style={styles.subtitle}>Set the owner rate in Nigerian Naira. Final renter totals remain server-authoritative.</Text>
              <View style={styles.moneyInput}>
                <Text style={styles.moneyPrefix}>₦</Text>
                <TextInput
                  editable={!busy}
                  keyboardType="number-pad"
                  onChangeText={(value) => setDailyRateNaira(value.replace(/\D/g, ''))}
                  placeholder="350000"
                  placeholderTextColor={colors.muted}
                  style={styles.moneyField}
                  value={dailyRateNaira ? Number.parseInt(dailyRateNaira, 10).toLocaleString('en-NG') : ''}
                />
              </View>
              <Text style={styles.helper}>Allowed range: {formatNairaFromKobo(MIN_OWNER_DAILY_RATE_KOBO)} to {formatNairaFromKobo(MAX_OWNER_DAILY_RATE_KOBO)} per day.</Text>
            </View>
          ) : null}

          {step === 4 ? (
            <View style={styles.section}>
              <Text style={styles.title}>Features and description</Text>
              <Text style={styles.subtitle}>Use factual details that help a renter choose confidently.</Text>
              <View style={styles.featureWrap}>
                {(Object.keys(FEATURE_LABELS) as VehicleFeatureKey[]).map((feature) => {
                  const selected = features.includes(feature);
                  return (
                    <PressableScale disabled={busy} key={feature} onPress={() => toggleFeature(feature)} style={[styles.feature, selected && styles.featureSelected]}>
                      <Text style={[styles.featureText, selected && styles.featureTextSelected]}>{FEATURE_LABELS[feature]}</Text>
                    </PressableScale>
                  );
                })}
              </View>
              <Text style={styles.label}>Description</Text>
              <TextInput
                editable={!busy}
                maxLength={2000}
                multiline
                onChangeText={setDescription}
                placeholder="Describe the vehicle condition, interior and service details."
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.textArea]}
                value={description}
              />
              <Text style={styles.helper}>{description.trim().length}/2,000 characters · minimum 40</Text>
            </View>
          ) : null}

          {step === 5 ? (
            <View style={styles.section}>
              <Text style={styles.title}>Photos</Text>
              <Text style={styles.subtitle}>
                {isCorrection && rejectedImageCount > 0
                  ? 'Keep the existing photos if they were not the issue, or add replacements. New photos become the active review set.'
                  : 'Add clear exterior and interior photos. The first active photo becomes the cover.'}
              </Text>
              <View style={styles.photoFacts}>
                <Text style={styles.muted}>Usable photos: {usableImageCount}</Text>
                {rejectedImageCount > 0 ? <Text style={styles.muted}>Previous review photos: {rejectedImageCount}</Text> : null}
              </View>
              <PressableScale disabled={busy} onPress={() => void pickPhotos()} style={styles.photoPicker}>
                <Ionicons color={colors.goldStrong} name="images-outline" size={22} />
                <Text style={styles.photoPickerText}>{photos.length ? 'Add more photos' : 'Choose photos'}</Text>
                <Text style={styles.helper}>JPEG, PNG or WebP · up to 10 MB each</Text>
              </PressableScale>
              {photos.length ? (
                <View style={styles.photoGrid}>
                  {photos.map((photo, index) => (
                    <View key={`${photo.uri}-${index}`} style={styles.photoTile}>
                      <Image contentFit="cover" source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} />
                      <PressableScale accessibilityLabel={`Remove photo ${index + 1}`} disabled={busy} onPress={() => setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={styles.removePhoto}>
                        <Ionicons color={colors.ivory} name="close" size={14} />
                      </PressableScale>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {step === 6 ? (
            <View style={styles.section}>
              <Text style={styles.title}>Review listing</Text>
              <Text style={styles.subtitle}>Check the details before sending this vehicle to MMG moderation.</Text>
              <SummaryRow label="Vehicle" value={`${year} ${make} ${model}`} onEdit={() => editStep(1)} disabled={busy} />
              <SummaryRow label="Garage area" value={areaLabel} onEdit={() => editStep(2)} disabled={busy} />
              <SummaryRow label="Registration" value={normalizedPlate(plate)} onEdit={() => editStep(2)} disabled={busy} />
              <SummaryRow label="Daily rate" value={`${formatNairaFromKobo(rateKobo)} / day`} onEdit={() => editStep(3)} disabled={busy} />
              <SummaryRow label="Description" value={description} onEdit={() => editStep(4)} disabled={busy} />
              <SummaryRow label="Photos" value={`${usableImageCount} ready for review`} onEdit={() => editStep(5)} disabled={busy} />
              {isCorrection ? <Text style={styles.helper}>Submitting updates this same vehicle record. It does not create a duplicate listing.</Text> : null}
            </View>
          ) : null}

          {progress ? (
            <View style={styles.progressRow}>
              <ActivityIndicator color={colors.goldStrong} size="small" />
              <Text style={styles.muted}>{progress}</Text>
            </View>
          ) : null}

          <PressableScale
            disabled={busy}
            onPress={() => step === 6 ? void submitForReview() : void saveCurrentStep()}
            style={[styles.primaryAction, busy && styles.disabled]}
          >
            <View style={styles.primaryButton}>
              {busy ? <ActivityIndicator color={colors.black} /> : <Text style={styles.primaryText}>{step === 6 ? 'Submit for review' : 'Save and continue'}</Text>}
            </View>
          </PressableScale>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal animationType="slide" onRequestClose={() => { if (!busy) setAreaModalVisible(false); }} transparent visible={areaModalVisible}>
        <Pressable disabled={busy} onPress={() => setAreaModalVisible(false)} style={styles.modalBackdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Choose operating area</Text>
            {LAGOS_AREA_LABELS.map((area) => (
              <Pressable
                disabled={busy}
                key={area}
                onPress={() => {
                  setAreaLabel(area);
                  setAreaModalVisible(false);
                }}
                style={[styles.modalOption, area === areaLabel && styles.modalOptionSelected]}
              >
                <Text style={[styles.modalOptionText, area === areaLabel && styles.modalOptionTextSelected]}>{area}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
};

function Field({ label, ...props }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...props} placeholderTextColor={colors.muted} style={styles.input} />
    </View>
  );
}

function ChoiceRow({ options, selected, onSelect }: { options: readonly (readonly [string, string])[]; selected: string; onSelect(value: string): void }) {
  return (
    <View style={styles.choiceRow}>
      {options.map(([value, label]) => {
        const active = selected === value;
        return (
          <PressableScale key={value} onPress={() => onSelect(value)} style={[styles.choice, active && styles.choiceSelected]}>
            <Text style={[styles.choiceText, active && styles.choiceTextSelected]}>{label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

function SummaryRow({ label, value, onEdit, disabled = false }: { label: string; value: string; onEdit(): void; disabled?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.flex}><Text style={styles.label}>{label}</Text><Text numberOfLines={2} style={styles.summaryValue}>{value}</Text></View>
      <PressableScale disabled={disabled} onPress={onEdit}><Text style={styles.editText}>Edit</Text></PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', flex: 1, gap: spacing.sm, justifyContent: 'center' },
  choice: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, flex: 1, minHeight: 42, justifyContent: 'center', paddingHorizontal: spacing.sm },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  choiceSelected: { backgroundColor: colors.ivory, borderColor: colors.ivory },
  choiceText: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 12 },
  choiceTextSelected: { color: colors.black },
  content: { gap: spacing.lg, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  disabled: { opacity: 0.55 },
  editText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 12 },
  error: { color: colors.danger, fontFamily: typography.body, fontSize: 13, lineHeight: 19 },
  feature: { borderColor: colors.line, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  featureSelected: { backgroundColor: colors.ivory, borderColor: colors.ivory },
  featureText: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 12 },
  featureTextSelected: { color: colors.black },
  featureWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  field: { gap: 6 },
  flex: { flex: 1 },
  header: { gap: spacing.xs, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  helper: { color: colors.muted, fontFamily: typography.body, fontSize: 11, lineHeight: 17 },
  input: { backgroundColor: colors.graphite, borderColor: colors.line, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 14, minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  label: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 12 },
  modalBackdrop: { backgroundColor: 'rgba(0,0,0,0.62)', flex: 1, justifyContent: 'flex-end' },
  modalHandle: { alignSelf: 'center', backgroundColor: colors.lineStrong, borderRadius: 2, height: 3, marginBottom: spacing.md, width: 36 },
  modalOption: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm },
  modalOptionSelected: { backgroundColor: 'rgba(255,255,255,0.04)' },
  modalOptionText: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 14 },
  modalOptionTextSelected: { color: colors.ivory, fontFamily: typography.bodySemiBold },
  modalSheet: { backgroundColor: colors.graphite, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  modalTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 18, marginBottom: spacing.sm },
  moneyField: { color: colors.ivory, flex: 1, fontFamily: typography.bodySemiBold, fontSize: 22, paddingVertical: spacing.sm },
  moneyInput: { alignItems: 'center', backgroundColor: colors.graphite, borderColor: colors.line, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md },
  moneyPrefix: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 22 },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  notice: { alignItems: 'flex-start', backgroundColor: 'rgba(227,195,101,0.08)', flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  noticeText: { color: colors.silver, flex: 1, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  photoFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoPicker: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.lg, borderStyle: 'dashed', borderWidth: 1, gap: spacing.xs, justifyContent: 'center', minHeight: 128, padding: spacing.lg },
  photoPickerText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14 },
  photoTile: { backgroundColor: colors.graphite, borderRadius: radii.md, height: 100, overflow: 'hidden', width: '30%' },
  primaryAction: { marginTop: spacing.sm },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.button, justifyContent: 'center', minHeight: 52 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  progressRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  removePhoto: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.68)', borderRadius: radii.pill, height: 26, justifyContent: 'center', position: 'absolute', right: 6, top: 6, width: 26 },
  screen: { backgroundColor: colors.black, flex: 1 },
  section: { gap: spacing.md },
  selector: { alignItems: 'center', backgroundColor: colors.graphite, borderColor: colors.line, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: spacing.md },
  selectorText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 14 },
  stepText: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  subtitle: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  summaryRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 64, paddingVertical: spacing.sm },
  summaryValue: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 13, lineHeight: 18 },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  title: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 22 },
  twoColumns: { flexDirection: 'row', gap: spacing.sm },
});
