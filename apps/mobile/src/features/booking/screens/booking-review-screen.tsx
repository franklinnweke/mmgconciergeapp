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
} from '@/features/discovery/domain/pickup-location';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';
import type { CreateRentalRequestData } from '@mmg/contracts/rental-request';

import {
  createRentalRequestGateway,
  RentalRequestSubmissionKey,
  type RentalRequestGateway,
} from '../data/rental-request-gateway';
import { bookingCommandErrorMessage } from '../domain/booking-errors';
import { resolveServiceAreaLabel } from '../domain/renter-rental-request';

type BookingReviewScreenProps = {
  endDate?: string;
  pickup?: string;
  rentalRequestGateway?: RentalRequestGateway;
  startDate?: string;
  vehicleId: string;
};

export default function BookingReviewScreen({
  endDate,
  pickup,
  rentalRequestGateway,
  startDate,
  vehicleId,
}: BookingReviewScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const { profile, saveProfile } = useRenterProfile();
  const gateway = useMemo(() => createDiscoveryGateway(), []);
  const requestGateway = useMemo(
    () => rentalRequestGateway ?? createRentalRequestGateway(),
    [rentalRequestGateway],
  );
  const submissionKey = useRef(new RentalRequestSubmissionKey());
  const journey = useMemo(() => resolveRentalJourney(startDate, endDate), [endDate, startDate]);
  const pickupLocation = useMemo(() => parsePickupLocation(pickup), [pickup]);
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
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const serviceArea: LagosAreaLabel = useMemo(() => {
    if (pickupLocation) {
      return pickupLocation.serviceAreaLabel;
    }
    const fromVehicle = resolveServiceAreaLabel(vehicle?.areaLabel);
    return fromVehicle ?? 'Victoria Island';
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

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerInset}>
          <ScreenHeader onBack={() => router.back()} title="Request this car" />
        </View>
        <View style={styles.stateCenter}>
          <ActivityIndicator color={colors.goldStrong} size="large" />
          <Text style={styles.stateText}>Loading request details…</Text>
        </View>
      </View>
    );
  }

  if (fetchError || !vehicle || !quote) {
    return (
      <View style={[styles.stateScreen, { paddingTop: insets.top + spacing.sm }]}>
        <ScreenHeader onBack={() => router.back()} title="Request this car" />
        <View style={styles.stateCenter}>
          <Ionicons color={fetchError ? colors.danger : colors.muted} name={fetchError ? 'cloud-offline-outline' : 'car-outline'} size={34} />
          <Text style={styles.stateTitle}>{fetchError ? 'Could not load quote' : 'Vehicle unavailable'}</Text>
          <Text style={styles.stateText}>{fetchError ?? 'Return to the fleet and choose another vehicle.'}</Text>
          <PressableScale accessibilityRole="button" haptic onPress={fetchError ? retryFetch : () => router.back()}>
            <View style={styles.stateButton}>
              <Text style={styles.stateButtonText}>{fetchError ? 'Try again' : 'Back to cars'}</Text>
            </View>
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader onBack={() => router.back()} title="Request this car" />

        <Text style={styles.introText}>
          Send a request to MMG. This does not lock dates or take payment. MMG will confirm the car, then contact you before opening a 30-minute payment window.
        </Text>

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
            <Text style={styles.vehicleMeta}>Chauffeur and Lagos delivery included</Text>
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
          <Text style={styles.sectionTitle}>Estimated total</Text>
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
          <Text style={styles.noteText}>
            This is a client-preview estimate. MMG recalculates the authoritative amount only when the payment window is opened.
          </Text>
        </View>

        {submittedRequestId ? (
          <View accessibilityLiveRegion="polite" style={styles.holdSummary}>
            <Ionicons color={colors.success} name="checkmark-circle" size={20} />
            <View style={styles.holdCopy}>
              <Text style={styles.holdTitle}>Request received — MMG is confirming</Text>
              <Text style={styles.holdText}>
                No payment was taken and the dates are not locked. Track this request in Trips.
              </Text>
            </View>
          </View>
        ) : (
          <>
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
              <Text style={styles.noteText}>Used by MMG to call you before payment. This is not an SMS login step.</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Delivery location</Text>
              <View style={styles.deliveryCard}>
                <View style={styles.deliveryIcon}>
                  <Ionicons color={colors.goldStrong} name="location-outline" size={20} />
                </View>
                <View style={styles.deliveryCopy}>
                  <Text style={styles.deliveryTitle}>{pickupLocation?.displayName ?? 'Lagos Pickup Location'}</Text>
                  <Text style={styles.deliveryAddress}>{pickupLocation?.formattedAddress ?? 'Lagos, Nigeria'}</Text>
                  <Text style={styles.deliveryZone}>MMG Service Zone: {serviceArea}</Text>
                </View>
              </View>
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

            {needsProfile ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Renter details</Text>
                <TextInput
                  accessibilityLabel="Full name"
                  onChangeText={setNameDraft}
                  placeholder="Full name"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={fullName}
                />
              </View>
            ) : null}
          </>
        )}

        {errorMessage ? (
          <View accessibilityLiveRegion="polite" style={styles.errorRow}>
            <Ionicons color={colors.danger} name="alert-circle" size={17} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {submittedRequestId ? (
          <PressableScale accessibilityRole="button" onPress={() => router.replace(`/trip/${submittedRequestId}` as any)}>
            <View style={styles.ctaButton}>
              <Text style={styles.ctaText}>View trip</Text>
            </View>
          </PressableScale>
        ) : (
          <PressableScale
            disabled={submitting || !isServiceable}
            haptic
            onPress={async () => {
              if (!pickupLocation || !isServiceable) {
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
              if (needsProfile && fullName.trim().length < 2 && !auth.user?.displayName) {
                setErrorMessage('Add your name to continue.');
                return;
              }

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
                  vehicleId: vehicle.id,
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
                  },
                };
                const result = await requestGateway.createRequest(
                  data,
                  submissionKey.current.forData(data),
                );
                submissionKey.current.markSucceeded();
                setSubmittedRequestId(result.result.requestId);
                router.replace(`/trip/${result.result.requestId}` as any);
              } catch (error: unknown) {
                setErrorMessage(`${bookingCommandErrorMessage(error)} No dates were locked and no charge was attempted.`);
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <View style={[styles.ctaButton, (submitting || !isServiceable) && styles.disabled]}>
              {submitting ? <ActivityIndicator color={colors.black} size="small" /> : null}
              <Text style={styles.ctaText}>{submitting ? 'Sending request…' : 'Send request'}</Text>
            </View>
          </PressableScale>
        )}
      </ScrollView>
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
  areaChip: { borderColor: colors.line, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  areaChipSelected: { backgroundColor: colors.goldStrong, borderColor: colors.goldStrong },
  areaChipText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 12 },
  areaChipTextSelected: { color: colors.black },
  areaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  content: { gap: spacing.lg, paddingHorizontal: spacing.lg },
  ctaButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 54, paddingHorizontal: spacing.lg },
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
  deliveryTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14 },
  deliveryZone: { color: colors.goldStrong, fontFamily: typography.bodyMedium, fontSize: 11, marginTop: 2 },
  disabled: { opacity: 0.6 },
  errorRow: { alignItems: 'center', borderColor: colors.danger, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  errorText: { color: colors.danger, flex: 1, fontFamily: typography.bodyMedium, fontSize: 13 },
  headerInset: { paddingHorizontal: spacing.lg },
  holdCopy: { flex: 1 },
  holdSummary: { alignItems: 'flex-start', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md },
  holdText: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: 3 },
  holdTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14 },
  input: { borderColor: colors.line, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, color: colors.ivory, fontFamily: typography.body, fontSize: 15, minHeight: 48, paddingHorizontal: spacing.md },
  introText: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  journeyRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  noteText: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  point: { flex: 1, gap: 3 },
  pointEnd: { alignItems: 'flex-end' },
  pointLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 11 },
  pointValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13 },
  quoteLabel: { color: colors.muted, flex: 1, fontFamily: typography.body, fontSize: 13 },
  quoteRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', paddingVertical: 5 },
  quoteValue: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 13, textAlign: 'right' },
  screen: { backgroundColor: colors.black, flex: 1 },
  section: { gap: spacing.xs },
  sectionTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 17, marginBottom: spacing.xs },
  stateButton: { alignItems: 'center', backgroundColor: colors.ivory, borderRadius: radii.pill, justifyContent: 'center', minHeight: 46, paddingHorizontal: spacing.lg },
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
