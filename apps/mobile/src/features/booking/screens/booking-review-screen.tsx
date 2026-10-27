import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { type LagosAreaLabel, type VehicleSummary } from '@mmg/contracts';
import { calculateBookingQuote, formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { normalizeNigerianPhone } from '@/core/auth/phone-verification-domain';
import { useAuth } from '@/core/auth/auth-context';
import { safeProviderError } from '@/core/errors/safe-provider-error';
import { useRenterProfile } from '@/features/account/hooks/use-renter-profile';
import { createDiscoveryGateway } from '@/features/discovery/data/firestore-discovery-gateway';
import { formatLagosDateOnly } from '@/features/discovery/data/lagos-destinations';
import { resolveRentalJourney } from '@/features/discovery/data/rental-journey';
import {
  isPickupLocationServiceable,
  parsePickupLocation,
  type PickupLocation,
} from '@/features/discovery/domain/pickup-location';
import { PickupLocationSheet } from '@/features/discovery/components/pickup-location-sheet';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';
import type { CreateRentalRequestData } from '@mmg/contracts/rental-request';

import { useBookings } from '../booking-context';
import {
  createRentalRequestGateway,
  type RentalRequestGateway,
} from '../data/rental-request-gateway';
import { completeRentalRequestAttempt, prepareRentalRequestAttempt } from '../data/rental-request-attempt';
import { bookingCommandErrorMessage } from '../domain/booking-errors';
import { resolveServiceAreaLabel } from '../domain/renter-rental-request';

type BookingReviewScreenProps = {
  endDate?: string;
  pickup?: string;
  refreshRentalRequests?: () => Promise<void>;
  rentalRequestGateway?: RentalRequestGateway;
  startDate?: string;
  vehicleId: string;
};

export default function BookingReviewScreen({
  endDate,
  pickup,
  refreshRentalRequests: refreshRentalRequestsProp,
  rentalRequestGateway,
  startDate,
  vehicleId,
}: BookingReviewScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const { profile, saveProfile } = useRenterProfile();
  const bookings = useBookings();
  const refreshRentalRequests = refreshRentalRequestsProp ?? bookings.refreshRentalRequests;
  const gateway = useMemo(() => createDiscoveryGateway(), []);
  const requestGateway = useMemo(
    () => rentalRequestGateway ?? createRentalRequestGateway(),
    [rentalRequestGateway],
  );
  const activeUid = useRef<string | null>(null);
  const submissionInFlight = useRef(false);
  useEffect(() => {
    activeUid.current = auth.signingOut ? null : auth.user?.uid ?? null;
    return () => { activeUid.current = null; };
  }, [auth.signingOut, auth.user?.uid]);
  const journey = useMemo(() => resolveRentalJourney(startDate, endDate), [endDate, startDate]);
  const initialPickupLocation = useMemo(() => parsePickupLocation(pickup), [pickup]);
  const [overridePickupLocation, setOverridePickupLocation] = useState<PickupLocation | null | undefined>(undefined);
  const pickupLocation = overridePickupLocation !== undefined ? overridePickupLocation : initialPickupLocation;
  const [sheetVisible, setSheetVisible] = useState(false);
  const isServiceable = useMemo(
    () => (pickupLocation ? isPickupLocationServiceable(pickupLocation) : false),
    [pickupLocation],
  );

  const [vehicle, setVehicle] = useState<VehicleSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(vehicleId));
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const serviceArea: LagosAreaLabel | null = useMemo(() => {
    if (pickupLocation) {
      return pickupLocation.serviceAreaLabel;
    }
    return resolveServiceAreaLabel(vehicle?.areaLabel);
  }, [pickupLocation, vehicle?.areaLabel]);

  const retryFetch = useCallback(() => {
    setFetchError(null);
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!vehicleId) return;
    let active = true;
    gateway.getVehicleById(vehicleId)
      .then((nextVehicle) => {
        if (!active) return;
        setVehicle(nextVehicle);
        setLoading(false);
        setFetchError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setVehicle(null);
        setLoading(false);
        setFetchError(safeProviderError(error, 'Unable to load your quote. Please try again.'));
      });
    return () => { active = false; };
  }, [gateway, reloadKey, vehicleId]);

  const phoneInput = phoneDraft ?? profile?.phone ?? '';
  const fullName = nameDraft ?? profile?.fullName ?? '';
  const streetAddress = profile?.defaultDeliveryAddress?.streetAddress ?? '';

  const quote = useMemo(
    () => vehicle ? calculateBookingQuote(vehicle.dailyRateKobo, journey.durationDays) : null,
    [journey.durationDays, vehicle],
  );
  const needsProfile = !profile || profile.accountStatus !== 'active';

  const handleSubmitRequest = async () => {
    const uid = auth.user?.uid;
    if (!uid || !auth.user?.emailVerified || auth.signingOut || submissionInFlight.current) return;
    if (!pickupLocation || !isServiceable || !serviceArea) {
      setErrorMessage(
        pickupLocation
          ? 'MMG currently serves pickups within Lagos. Choose a Lagos pickup location instead.'
          : 'Choose a Lagos delivery landmark or use your current location to request this car.',
      );
      return;
    }
    const contactPhone = normalizeNigerianPhone(phoneInput);
    if (!contactPhone) {
      setErrorMessage('Enter a valid Nigerian mobile number.');
      return;
    }

    submissionInFlight.current = true;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      if (needsProfile) {
        try {
          await saveProfile({
            fullName: fullName.trim() || auth.user?.displayName || 'MMG renter',
            phone: contactPhone,
            defaultDeliveryAddress: {
              areaLabel: serviceArea,
              streetAddress: streetAddress.trim() || pickupLocation.formattedAddress,
            },
            acceptedRenterTermsVersion: '2026-03-01',
            acceptedPrivacyNoticeVersion: '2026-03-01',
          });
        } catch {
          // Profile enrichment failure does not block soft request submission
        }
      }
      const data: CreateRentalRequestData = {
        vehicleId: vehicle!.id,
        startDate: journey.startDate,
        endDate: journey.endDate,
        contactPhone,
        serviceAreaLabel: serviceArea,
        pickupLocation: {
          displayName: pickupLocation.displayName,
          formattedAddress: pickupLocation.formattedAddress,
          latitude: pickupLocation.latitude,
          longitude: pickupLocation.longitude,
          ...(pickupLocation.placeId ? { placeId: pickupLocation.placeId } : {}),
          serviceAreaLabel: pickupLocation.serviceAreaLabel,
          ...(pickupLocation.note ? { note: pickupLocation.note } : {}),
        },
      };
      let requestId: string;
      try {
        if (activeUid.current !== uid) return;
        const key = await prepareRentalRequestAttempt(uid, data);
        if (activeUid.current !== uid) return;
        const result = await requestGateway.createRequest(
          data,
          key,
        );
        void completeRentalRequestAttempt(uid, key).catch(() => { /* Keep server success authoritative. */ });
        if (activeUid.current !== uid) return;
        requestId = result.result.requestId;
      } catch (error: unknown) {
        if (activeUid.current === uid) setErrorMessage(`${bookingCommandErrorMessage(error)} No dates were locked and no charge was attempted.`);
        return;
      }

      try {
        await refreshRentalRequests();
      } catch {
        // Non-blocking: background cache update failure must not block navigation to the newly created request
      }

      if (activeUid.current === uid) router.replace(`/trip/${requestId}` as any);
    } finally {
      submissionInFlight.current = false;
      if (activeUid.current === uid) setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.stateScreen, { paddingTop: insets.top }]}>
        <ScreenHeader onBack={() => router.back()} title="Review request" />
        <View style={styles.stateCenter}>
          <ActivityIndicator color={colors.goldStrong} size="large" />
          <Text style={styles.stateText}>Preparing your quote…</Text>
        </View>
      </View>
    );
  }

  if (fetchError || !vehicle || !quote) {
    return (
      <View style={[styles.stateScreen, { paddingTop: insets.top }]}>
        <ScreenHeader onBack={() => router.back()} title="Review request" />
        <View style={styles.stateCenter}>
          <Text style={styles.stateTitle}>Quote unavailable</Text>
          <Text style={styles.stateText}>
            {fetchError ?? 'Unable to load vehicle details. Please try again.'}
          </Text>
          <PressableScale accessibilityLabel="Retry loading quote" accessibilityRole="button" onPress={retryFetch} style={styles.stateButton}>
            <Text style={styles.stateButtonText}>Try again</Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.headerInset}>
        <ScreenHeader onBack={() => router.back()} title="Review request" />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.vehicleRow}>
          <Image
            accessibilityLabel={vehicle.displayName}
            contentFit="cover"
            source={resolveVehicleImageSource(vehicle)}
            style={styles.vehicleImage}
          />
          <View style={styles.vehicleCopy}>
            <Text style={styles.vehicleName}>{vehicle.displayName}</Text>
            <Text style={styles.vehicleMeta}>{vehicle.areaLabel} · {vehicle.seats} passengers</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dates</Text>
          <View style={styles.journeyRow}>
            <JourneyPoint label="Pickup" value={formatLagosDateOnly(journey.startDate)} />
            <Ionicons color={colors.muted} name="arrow-forward" size={16} />
            <JourneyPoint alignEnd label="Return" value={formatLagosDateOnly(journey.endDate)} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery location</Text>
          <PressableScale
            accessibilityHint="Change delivery location"
            accessibilityLabel={`Delivery location: ${pickupLocation?.displayName ?? 'None selected'}. Tap to change.`}
            accessibilityRole="button"
            onPress={() => setSheetVisible(true)}
            style={styles.deliveryCard}
          >
            <View style={styles.deliveryIcon}>
              <Ionicons color={colors.goldStrong} name="location-outline" size={20} />
            </View>
            <View style={styles.deliveryCopy}>
              <Text style={styles.deliveryTitle}>
                {pickupLocation ? pickupLocation.displayName : 'Choose delivery location'}
              </Text>
              <Text style={styles.deliveryAddress}>
                {pickupLocation
                  ? pickupLocation.formattedAddress
                  : 'Tap to select where we should bring the car in Lagos'}
              </Text>
              {pickupLocation?.note ? (
                <Text style={styles.deliveryNote}>Note: {pickupLocation.note}</Text>
              ) : null}
            </View>
            <Text style={styles.deliveryChangeText}>{pickupLocation ? 'Change' : 'Select'}</Text>
          </PressableScale>
          {!isServiceable ? (
            <View style={styles.warningRow}>
              <Ionicons color={colors.danger} name="alert-circle" size={16} />
              <Text style={styles.warningText}>
                {pickupLocation
                  ? 'MMG currently serves pickups within Lagos. Choose a Lagos pickup location instead.'
                  : 'Choose a Lagos delivery landmark or use your current location to request this car.'}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact phone</Text>
          <TextInput
            accessibilityLabel="Nigerian mobile number"
            autoComplete="tel"
            keyboardType="phone-pad"
            onChangeText={setPhoneDraft}
            placeholder="0801 234 5678"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={phoneInput}
          />
          <Text style={styles.noteText}>Used by MMG to call you before opening payment.</Text>
        </View>

        {needsProfile ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Renter details</Text>
            <TextInput
              accessibilityLabel="Full name"
              onChangeText={setNameDraft}
              placeholder="Full name (optional)"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={fullName}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price breakdown</Text>
          <QuoteRow
            label={`${formatNairaFromKobo(vehicle.dailyRateKobo)} × ${journey.durationDays} ${journey.durationDays === 1 ? 'day' : 'days'}`}
            value={formatNairaFromKobo(quote.rentalKobo)}
          />
          <QuoteRow label="Service and protection" value={formatNairaFromKobo(quote.serviceFeeKobo)} />
          <QuoteRow label="Chauffeur and Lagos delivery" value="Included" />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Estimated total</Text>
            <Text style={styles.totalValue}>{formatNairaFromKobo(quote.totalKobo)}</Text>
          </View>
        </View>

        <Text style={styles.reassuranceText}>
          No payment now. MMG will contact you once your request is confirmed.
        </Text>

        {errorMessage ? (
          <View accessibilityLiveRegion="polite" style={styles.errorRow}>
            <Ionicons color={colors.danger} name="alert-circle" size={17} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <PressableScale
          disabled={submitting || !isServiceable}
          haptic
          onPress={handleSubmitRequest}
        >
          <View style={[styles.ctaButton, (submitting || !isServiceable) && styles.disabled]}>
            {submitting ? <ActivityIndicator color={colors.black} size="small" /> : null}
            <Text style={styles.ctaText}>{submitting ? 'Sending request…' : 'Send request'}</Text>
          </View>
        </PressableScale>
      </ScrollView>

      <PickupLocationSheet
        onClose={() => setSheetVisible(false)}
        onSelectLocation={setOverridePickupLocation}
        selectedLocation={pickupLocation}
        visible={sheetVisible}
      />
    </View>
  );
}

function JourneyPoint({ alignEnd, label, value }: { alignEnd?: boolean; label: string; value: string }) {
  return (
    <View style={[styles.point, alignEnd && styles.pointEnd]}>
      <Text style={styles.pointLabel}>{label}</Text>
      <Text style={styles.pointValue}>{value}</Text>
    </View>
  );
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.quoteRow}>
      <Text style={styles.quoteLabel}>{label}</Text>
      <Text style={styles.quoteValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: spacing.lg },
  ctaButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.button, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 54, paddingHorizontal: spacing.lg },
  ctaText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  deliveryAddress: { color: colors.muted, fontFamily: typography.body, fontSize: 12 },
  deliveryCard: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  deliveryChangeText: {
    color: colors.goldStrong,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  deliveryCopy: { flex: 1, gap: 2 },
  deliveryIcon: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  deliveryNote: {
    color: colors.silver,
    fontFamily: typography.body,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  deliveryTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14 },
  disabled: { opacity: 0.6 },
  errorRow: { alignItems: 'center', borderColor: colors.danger, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  errorText: { color: colors.danger, flex: 1, fontFamily: typography.bodyMedium, fontSize: 13 },
  headerInset: { paddingHorizontal: spacing.lg },
  input: { borderColor: colors.line, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, color: colors.ivory, fontFamily: typography.body, fontSize: 15, minHeight: 48, paddingHorizontal: spacing.md },
  journeyRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  noteText: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  point: { flex: 1, gap: 3 },
  pointEnd: { alignItems: 'flex-end' },
  pointLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 11 },
  pointValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13 },
  quoteLabel: { color: colors.muted, flex: 1, fontFamily: typography.body, fontSize: 13 },
  quoteRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', paddingVertical: 5 },
  quoteValue: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 13, textAlign: 'right' },
  reassuranceText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  screen: { backgroundColor: colors.black, flex: 1 },
  section: { gap: spacing.xs },
  sectionTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 17, marginBottom: spacing.xs },
  stateButton: { alignItems: 'center', backgroundColor: colors.ivory, borderRadius: radii.button, justifyContent: 'center', minHeight: 46, paddingHorizontal: spacing.lg },
  stateButtonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 13 },
  stateCenter: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', paddingHorizontal: spacing.xl },
  stateScreen: { backgroundColor: colors.black, flex: 1, paddingHorizontal: spacing.lg },
  stateText: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  stateTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 18 },
  totalLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15 },
  totalRow: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.md },
  totalValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 20 },
  vehicleCopy: { flex: 1, gap: 4, justifyContent: 'center' },
  vehicleImage: { borderRadius: radii.sm, height: 76, width: 100 },
  vehicleMeta: { color: colors.muted, fontFamily: typography.body, fontSize: 11 },
  vehicleName: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15 },
  vehicleRow: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingBottom: spacing.lg },
  warningRow: { alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: colors.danger, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, padding: spacing.md },
  warningText: { color: colors.danger, flex: 1, fontFamily: typography.bodyMedium, fontSize: 13 },
});
