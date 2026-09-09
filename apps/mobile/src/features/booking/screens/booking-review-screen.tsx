import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { type CreateBookingIntentResult, type VehicleSummary } from '@mmg/contracts';
import { calculateBookingQuote, formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { safeProviderError } from '@/core/errors/safe-provider-error';
import { createDiscoveryGateway } from '@/features/discovery/data/firestore-discovery-gateway';
import {
  formatLagosDateOnly,
} from '@/features/discovery/data/lagos-destinations';
import { resolveRentalJourney } from '@/features/discovery/data/rental-journey';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';

import { RenterCheckoutReadiness } from '../components/renter-checkout-readiness';
import {
  BookingIntentSubmissionKey,
  createBookingIntentGateway,
  type BookingIntentGateway,
} from '../data/booking-intent-gateway';
import { bookingCommandErrorMessage } from '../domain/booking-errors';

type BookingReviewScreenProps = {
  bookingIntentGateway?: BookingIntentGateway;
  endDate?: string;
  startDate?: string;
  vehicleId: string;
};

export default function BookingReviewScreen({
  bookingIntentGateway,
  endDate,
  startDate,
  vehicleId,
}: BookingReviewScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const gateway = useMemo(() => createDiscoveryGateway(), []);
  const intentGateway = useMemo(
    () => bookingIntentGateway ?? createBookingIntentGateway(),
    [bookingIntentGateway],
  );
  const submissionKey = useRef(new BookingIntentSubmissionKey());
  const journey = useMemo(() => resolveRentalJourney(startDate, endDate), [endDate, startDate]);

  const [vehicle, setVehicle] = useState<VehicleSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(vehicleId));
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [intentResult, setIntentResult] = useState<CreateBookingIntentResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const handleReleaseHold = async () => {
    if (!intentResult || releasing) return;
    setReleasing(true);
    setErrorMessage(null);
    try {
      await intentGateway.releaseHold(intentResult.result.intentId);
      setIntentResult(null);
      setConfirmingRelease(false);
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(
        safeProviderError(
          error,
          'The hold could not be released. Your dates are still held. Try releasing again.',
        ),
      );
      setConfirmingRelease(false);
    } finally {
      setReleasing(false);
    }
  };

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

  const quote = useMemo(
    () => vehicle ? calculateBookingQuote(vehicle.dailyRateKobo, journey.durationDays) : null,
    [journey.durationDays, vehicle],
  );
  const authoritativePrice = intentResult?.result.priceSnapshot ?? null;

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerInset}>
          <ScreenHeader onBack={() => router.back()} title="Review booking" />
        </View>
        <View style={styles.stateCenter}>
          <ActivityIndicator color={colors.goldStrong} size="large" />
          <Text style={styles.stateText}>Loading booking details…</Text>
        </View>
      </View>
    );
  }

  if (fetchError || !vehicle || !quote) {
    return (
      <View style={[styles.stateScreen, { paddingTop: insets.top + spacing.sm }]}>
        <ScreenHeader onBack={() => router.back()} title="Review booking" />
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
        <ScreenHeader onBack={() => router.back()} title="Review booking" />

        <Text style={styles.introText}>Check the car, dates and total before MMG creates a 15-minute hold. No payment is taken at this step.</Text>

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
          <Text style={styles.sectionTitle}>{authoritativePrice ? 'Held quote' : 'Estimated total'}</Text>
          <QuoteRow
            label={`${formatNairaFromKobo(authoritativePrice?.ownerDailyRateKobo ?? vehicle.dailyRateKobo)} × ${authoritativePrice?.chargedDays ?? journey.durationDays} ${((authoritativePrice?.chargedDays ?? journey.durationDays) === 1) ? 'day' : 'days'}`}
            value={formatNairaFromKobo(authoritativePrice?.baseRentalKobo ?? quote.rentalKobo)}
          />
          <QuoteRow
            label="Service and protection"
            value={formatNairaFromKobo(authoritativePrice?.serviceFeeKobo ?? quote.serviceFeeKobo)}
          />
          <QuoteRow label="Chauffeur and Lagos delivery" value="Included" />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{authoritativePrice ? 'Held total' : 'Total'}</Text>
            <Text style={styles.totalValue}>{formatNairaFromKobo(authoritativePrice?.renterTotalKobo ?? quote.totalKobo)}</Text>
          </View>
          <Text style={styles.noteText}>
            {authoritativePrice
              ? 'This server-authoritative amount is held with your dates until the hold expires.'
              : 'MMG recalculates this amount on the server before creating the hold.'}
          </Text>
        </View>

        {errorMessage ? (
          <View accessibilityLiveRegion="polite" style={styles.errorRow}>
            <Ionicons color={colors.danger} name="alert-circle" size={17} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {intentResult ? (
          <>
            <View accessibilityLiveRegion="polite" style={styles.holdSummary}>
              <Ionicons color={colors.success} name="checkmark-circle" size={20} />
              <View style={styles.holdCopy}>
                <Text style={styles.holdTitle}>Dates held for 15 minutes</Text>
                <Text style={styles.holdText}>
                  Hold expires at {new Date(intentResult.result.expiresAt).toLocaleTimeString('en-NG', {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: 'Africa/Lagos',
                  })} Lagos time. Payment still needs to be completed and verified.
                </Text>
              </View>
            </View>

            {confirmingRelease ? (
              <View style={styles.confirmCard}>
                <Text style={styles.confirmTitle}>Release these dates?</Text>
                <Text style={styles.confirmBody}>
                  No payment has been taken. The vehicle will become available for these dates again.
                </Text>
                <View style={styles.confirmActions}>
                  <PressableScale
                    accessibilityLabel="Keep dates"
                    accessibilityRole="button"
                    disabled={releasing}
                    onPress={() => setConfirmingRelease(false)}
                    style={styles.confirmActionButton}
                  >
                    <View style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Keep dates</Text>
                    </View>
                  </PressableScale>
                  <PressableScale
                    accessibilityLabel="Release dates"
                    accessibilityRole="button"
                    disabled={releasing}
                    onPress={handleReleaseHold}
                    style={styles.confirmActionButton}
                  >
                    <View style={[styles.releaseButton, releasing && styles.disabled]}>
                      {releasing ? <ActivityIndicator color={colors.black} size="small" /> : null}
                      <Text style={styles.releaseButtonText}>{releasing ? 'Releasing…' : 'Release dates'}</Text>
                    </View>
                  </PressableScale>
                </View>
              </View>
            ) : (
              <PressableScale
                accessibilityLabel="Release dates"
                accessibilityRole="button"
                onPress={() => setConfirmingRelease(true)}
              >
                <View style={styles.releaseTriggerButton}>
                  <Ionicons color={colors.goldStrong} name="calendar-outline" size={16} />
                  <Text style={styles.releaseTriggerText}>Release dates</Text>
                </View>
              </PressableScale>
            )}

            <RenterCheckoutReadiness
              holdExpiresAt={intentResult.result.expiresAt}
              intentId={intentResult.result.intentId}
              onRestartHold={() => {
                setIntentResult(null);
                setErrorMessage(null);
                setConfirmingRelease(false);
              }}
              onViewTrips={() => router.replace('/trips')}
            />
          </>
        ) : (
          <PressableScale
            disabled={submitting}
            haptic
            onPress={async () => {
              setSubmitting(true);
              setErrorMessage(null);
              try {
                const intentData = {
                  endDate: journey.endDate,
                  startDate: journey.startDate,
                  vehicleId: vehicle.id,
                };
                const result = await intentGateway.createIntent(
                  intentData,
                  submissionKey.current.forData(intentData),
                );
                submissionKey.current.markSucceeded();
                setIntentResult(result);
              } catch (error: unknown) {
                const reason = bookingCommandErrorMessage(error);
                setErrorMessage(`${reason} No hold was created and no charge was attempted.`);
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <View style={[styles.ctaButton, submitting && styles.disabled]}>
              {submitting ? <ActivityIndicator color={colors.black} size="small" /> : null}
              <Text style={styles.ctaText}>{submitting ? 'Creating hold…' : 'Create 15-minute hold'}</Text>
            </View>
          </PressableScale>
        )}
      </ScrollView>
    </View>
  );
}

function JourneyPoint({ alignEnd = false, label, value }: { alignEnd?: boolean; label: string; value: string }) {
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
  confirmActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  confirmActionButton: { flex: 1 },
  confirmBody: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  confirmCard: { backgroundColor: colors.graphiteRaised, borderColor: 'rgba(209,133,120,.36)', borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg },
  confirmTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 16 },
  content: { gap: spacing.lg, paddingHorizontal: spacing.lg },
  ctaButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 54, paddingHorizontal: spacing.lg },
  ctaText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  disabled: { opacity: 0.6 },
  errorRow: { alignItems: 'center', borderColor: colors.danger, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  errorText: { color: colors.danger, flex: 1, fontFamily: typography.bodyMedium, fontSize: 13 },
  headerInset: { paddingHorizontal: spacing.lg },
  holdCopy: { flex: 1 },
  holdSummary: { alignItems: 'flex-start', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md },
  holdText: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: 3 },
  holdTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14 },
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
  releaseButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 46, paddingHorizontal: spacing.md },
  releaseButtonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 13 },
  releaseTriggerButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md },
  releaseTriggerText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 12 },
  screen: { backgroundColor: colors.black, flex: 1 },
  secondaryButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: spacing.md },
  secondaryButtonText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13 },
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
});