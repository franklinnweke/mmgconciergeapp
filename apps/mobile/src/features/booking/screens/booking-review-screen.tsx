import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import {
  LAGOS_AREA_LABELS,
  type LagosAreaLabel,
  type VehicleSummary,
} from '@mmg/contracts';
import type { CreateRentalRequestResult } from '@mmg/contracts/rental-request';
import { calculateBookingQuote, formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { normalizeNigerianPhone } from '@/core/auth/phone-verification-domain';
import { safeProviderError } from '@/core/errors/safe-provider-error';
import { useRenterProfile } from '@/features/account/hooks/use-renter-profile';
import { createDiscoveryGateway } from '@/features/discovery/data/firestore-discovery-gateway';
import { formatLagosDateOnly } from '@/features/discovery/data/lagos-destinations';
import { resolveRentalJourney } from '@/features/discovery/data/rental-journey';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';

import {
  createRentalRequestGateway,
  RentalRequestSubmissionKey,
  type RentalRequestGateway,
} from '../data/rental-request-gateway';

type BookingReviewScreenProps = {
  rentalRequestGateway?: RentalRequestGateway;
  endDate?: string;
  startDate?: string;
  vehicleId: string;
};

export default function BookingReviewScreen({
  rentalRequestGateway,
  endDate,
  startDate,
  vehicleId,
}: BookingReviewScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const discovery = useMemo(() => createDiscoveryGateway(), []);
  const requestGateway = useMemo(
    () => rentalRequestGateway ?? createRentalRequestGateway(),
    [rentalRequestGateway],
  );
  const submissionKey = useRef(new RentalRequestSubmissionKey());
  const { profile } = useRenterProfile();
  const journey = useMemo(() => resolveRentalJourney(startDate, endDate), [endDate, startDate]);

  const [vehicle, setVehicle] = useState<VehicleSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(vehicleId));
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [requestResult, setRequestResult] = useState<CreateRentalRequestResult | null>(null);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [areaLabel, setAreaLabel] = useState<LagosAreaLabel>('Victoria Island');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.phone && !phone) setPhone(profile.phone);
    if (profile?.defaultDeliveryAddress?.areaLabel) setAreaLabel(profile.defaultDeliveryAddress.areaLabel);
  }, [phone, profile]);

  const retryFetch = useCallback(() => {
    setFetchError(null);
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!vehicleId) return;
    let active = true;
    discovery.getVehicleById(vehicleId)
      .then((next) => {
        if (!active) return;
        setVehicle(next);
        setLoading(false);
        setFetchError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setVehicle(null);
        setLoading(false);
        setFetchError(safeProviderError(error, 'Unable to load this vehicle. Please try again.'));
      });
    return () => { active = false; };
  }, [discovery, reloadKey, vehicleId]);

  const quote = useMemo(
    () => vehicle ? calculateBookingQuote(vehicle.dailyRateKobo, journey.durationDays) : null,
    [journey.durationDays, vehicle],
  );
  const storedPhone = normalizeNigerianPhone(profile?.phone ?? '');
  const normalizedPhone = storedPhone ?? normalizeNigerianPhone(phone);

  const sendRequest = async () => {
    if (!vehicle || !normalizedPhone || submitting) return;
    const data = {
      vehicleId: vehicle.id,
      startDate: journey.startDate,
      endDate: journey.endDate,
      contactPhone: normalizedPhone,
      serviceAreaLabel: areaLabel,
    } as const;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await requestGateway.createRequest(data, submissionKey.current.forData(data));
      submissionKey.current.markSucceeded();
      setRequestResult(result);
    } catch (error) {
      setErrorMessage(safeProviderError(error, 'Your request could not be sent. No dates were held and no payment was attempted.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerInset}><ScreenHeader onBack={() => router.back()} title="Request to book" /></View>
        <View style={styles.stateCenter}><ActivityIndicator color={colors.goldStrong} size="large" /><Text style={styles.muted}>Loading vehicle…</Text></View>
      </View>
    );
  }

  if (fetchError || !vehicle || !quote) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg }]}>
        <ScreenHeader onBack={() => router.back()} title="Request to book" />
        <View style={styles.stateCenter}>
          <Ionicons color={colors.muted} name="car-outline" size={34} />
          <Text style={styles.title}>{fetchError ? 'Could not load vehicle' : 'Vehicle unavailable'}</Text>
          <Text style={styles.muted}>{fetchError ?? 'Choose another vehicle from the fleet.'}</Text>
          <PressableScale accessibilityRole="button" onPress={fetchError ? retryFetch : () => router.back()}>
            <View style={styles.primaryButton}><Text style={styles.primaryText}>{fetchError ? 'Try again' : 'Back to cars'}</Text></View>
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
        <ScreenHeader onBack={() => router.back()} title="Request to book" />

        <View style={styles.vehicleRow}>
          <Image accessibilityLabel={vehicle.displayName} contentFit="cover" source={resolveVehicleImageSource(vehicle)} style={styles.vehicleImage} />
          <View style={styles.vehicleCopy}>
            <Text style={styles.vehicleName}>{vehicle.displayName}</Text>
            <Text style={styles.muted}>{vehicle.areaLabel} · {vehicle.seats} passengers</Text>
            <Text style={styles.muted}>Chauffeur included</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dates</Text>
          <View style={styles.dateRow}>
            <DatePoint label="Pickup" value={formatLagosDateOnly(journey.startDate)} />
            <Ionicons color={colors.muted} name="arrow-forward" size={16} />
            <DatePoint alignEnd label="Return" value={formatLagosDateOnly(journey.endDate)} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estimated total</Text>
          <QuoteRow label={`${formatNairaFromKobo(vehicle.dailyRateKobo)} × ${journey.durationDays} ${journey.durationDays === 1 ? 'day' : 'days'}`} value={formatNairaFromKobo(quote.rentalKobo)} />
          <QuoteRow label="Service and protection" value={formatNairaFromKobo(quote.serviceFeeKobo)} />
          <QuoteRow label="Chauffeur and Lagos delivery" value="Included" />
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Estimated total</Text><Text style={styles.totalValue}>{formatNairaFromKobo(quote.totalKobo)}</Text></View>
          <Text style={styles.note}>Final availability and the payment total are confirmed by MMG Concierge before payment.</Text>
        </View>

        {requestResult ? (
          <View accessibilityLiveRegion="polite" style={styles.receivedCard}>
            <Ionicons color={colors.success} name="checkmark-circle" size={28} />
            <Text style={styles.title}>Request received</Text>
            <Text style={styles.centerCopy}>We're confirming your car and will contact you shortly. No payment has been taken and these dates are not locked yet.</Text>
            <PressableScale accessibilityRole="button" onPress={() => router.replace('/(renter)/trips')}>
              <View style={styles.primaryButton}><Text style={styles.primaryText}>View requests</Text></View>
            </PressableScale>
          </View>
        ) : requestFormOpen ? (
          <View style={styles.requestPanel}>
            <Text style={styles.sectionTitle}>Where can we reach you?</Text>
            {storedPhone ? (
              <View style={styles.savedContact}>
                <Ionicons color={colors.goldStrong} name="call-outline" size={18} />
                <View><Text style={styles.smallLabel}>CONTACT PHONE</Text><Text style={styles.contactValue}>{storedPhone}</Text></View>
              </View>
            ) : (
              <TextInput
                accessibilityLabel="Contact phone number"
                keyboardType="phone-pad"
                onChangeText={setPhone}
                placeholder="0801 234 5678"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={phone}
              />
            )}

            <Text style={styles.smallLabel}>WHERE WILL THE VEHICLE BE NEEDED?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.areaScroller}>
              {LAGOS_AREA_LABELS.map((area) => {
                const selected = area === areaLabel;
                return (
                  <PressableScale
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    key={area}
                    onPress={() => setAreaLabel(area)}
                    style={[styles.areaPill, selected && styles.areaPillSelected]}
                  >
                    <Text style={[styles.areaText, selected && styles.areaTextSelected]}>{area}</Text>
                  </PressableScale>
                );
              })}
            </ScrollView>

            <Text style={styles.centerCopy}>MMG Concierge will contact you shortly to confirm availability and your booking details.</Text>
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
            <PressableScale accessibilityRole="button" disabled={!normalizedPhone || submitting} haptic onPress={() => void sendRequest()}>
              <View style={[styles.primaryButton, (!normalizedPhone || submitting) && styles.disabled]}>
                {submitting ? <ActivityIndicator color={colors.black} size="small" /> : null}
                <Text style={styles.primaryText}>{submitting ? 'Sending request…' : 'Send request'}</Text>
              </View>
            </PressableScale>
          </View>
        ) : (
          <>
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
            <PressableScale accessibilityRole="button" haptic onPress={() => setRequestFormOpen(true)}>
              <View style={styles.primaryButton}><Text style={styles.primaryText}>Request to book</Text></View>
            </PressableScale>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function DatePoint({ alignEnd = false, label, value }: { alignEnd?: boolean; label: string; value: string }) {
  return <View style={[styles.point, alignEnd && styles.pointEnd]}><Text style={styles.smallLabel}>{label.toUpperCase()}</Text><Text style={styles.pointValue}>{value}</Text></View>;
}
function QuoteRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.quoteRow}><Text style={styles.quoteLabel}>{label}</Text><Text style={styles.quoteValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  areaPill: { borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, marginRight: spacing.xs, minHeight: 38, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  areaPillSelected: { backgroundColor: colors.ivory, borderColor: colors.ivory },
  areaScroller: { flexGrow: 0 },
  areaText: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 11 },
  areaTextSelected: { color: colors.black },
  centerCopy: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  contactValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14 },
  content: { gap: spacing.lg, paddingHorizontal: spacing.lg },
  dateRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  disabled: { opacity: 0.55 },
  error: { color: colors.danger, fontFamily: typography.bodyMedium, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  headerInset: { paddingHorizontal: spacing.lg },
  input: { backgroundColor: colors.graphiteRaised, borderColor: colors.lineStrong, borderRadius: radii.sm, borderWidth: 1, color: colors.ivory, fontFamily: typography.body, fontSize: 14, minHeight: 48, paddingHorizontal: spacing.md },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  note: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  point: { flex: 1, gap: 4 },
  pointEnd: { alignItems: 'flex-end' },
  pointValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 52, paddingHorizontal: spacing.lg },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  quoteLabel: { color: colors.muted, flex: 1, fontFamily: typography.body, fontSize: 13 },
  quoteRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', paddingVertical: 5 },
  quoteValue: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 13 },
  receivedCard: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  requestPanel: { backgroundColor: colors.graphite, borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  savedContact: { alignItems: 'center', backgroundColor: colors.graphiteRaised, borderRadius: radii.sm, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  screen: { backgroundColor: colors.black, flex: 1 },
  section: { gap: spacing.xs },
  sectionTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 17 },
  smallLabel: { color: colors.muted, fontFamily: typography.bodySemiBold, fontSize: 10, letterSpacing: 0.7 },
  stateCenter: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', paddingHorizontal: spacing.xl },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 20, textAlign: 'center' },
  totalLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15 },
  totalRow: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.md },
  totalValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 20 },
  vehicleCopy: { flex: 1, gap: 4, justifyContent: 'center' },
  vehicleImage: { borderRadius: radii.sm, height: 84, width: 112 },
  vehicleName: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 16 },
  vehicleRow: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingBottom: spacing.lg },
});
