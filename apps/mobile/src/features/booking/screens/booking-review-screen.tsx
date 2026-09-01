import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { type CreateBookingIntentResult, type VehicleSummary } from '@mmg/contracts';
import { calculateBookingQuote, calculateChargedDays, formatNairaFromKobo } from '@mmg/domain';
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
  addDaysToDateOnly,
  formatLagosDateOnly,
  parseDateOnly,
  todayLagosDateOnly,
} from '@/features/discovery/data/lagos-destinations';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';

import { RenterPaymentCheckout } from '../components/renter-payment-checkout';
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

function resolveJourney(startDate?: string, endDate?: string) {
  const start = parseDateOnly(startDate) ?? todayLagosDateOnly();
  try {
    const end = parseDateOnly(endDate) ?? addDaysToDateOnly(start, 1);
    return {
      durationDays: calculateChargedDays(start, end),
      endDate: end,
      startDate: start,
    };
  } catch {
    return {
      durationDays: 1,
      endDate: addDaysToDateOnly(start, 1),
      startDate: start,
    };
  }
}

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
  const [vehicle, setVehicle] = useState<VehicleSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(vehicleId));
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retryFetch = useCallback(() => {
    setFetchError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const journey = useMemo(() => resolveJourney(startDate, endDate), [endDate, startDate]);
  const validDuration = journey.durationDays;
  const [intentResult, setIntentResult] = useState<CreateBookingIntentResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!vehicleId) return;
    let isMounted = true;

    gateway
      .getVehicleById(vehicleId)
      .then((v) => {
        if (isMounted) {
          setVehicle(v);
          setLoading(false);
          setFetchError(null);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setVehicle(null);
          setLoading(false);
          setFetchError(
            safeProviderError(err, 'Unable to connect to fleet services. Please try again.'),
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, [gateway, vehicleId, reloadKey]);

  const quote = useMemo(
    () => (vehicle ? calculateBookingQuote(vehicle.dailyRateKobo, validDuration) : null),
    [validDuration, vehicle],
  );
  const authoritativePrice = intentResult?.result.priceSnapshot ?? null;

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.stateHeader}>
          <ScreenHeader onBack={() => router.back()} />
        </View>
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.goldStrong} size="large" />
          <Text style={styles.loadingText}>Retrieving vehicle details...</Text>
        </View>
      </View>
    );
  }

  if (fetchError) {
    return (
      <View style={[styles.missing, { paddingTop: insets.top + spacing.sm }]}>
        <ScreenHeader onBack={() => router.back()} />
        <Ionicons color={colors.danger} name="cloud-offline-outline" size={36} />
        <Text style={styles.missingTitle}>Connection Error</Text>
        <Text style={styles.subtitle}>
          Unable to retrieve vehicle quotation. Please check your connection and try again.
        </Text>
        <PressableScale accessibilityLabel="Retry loading quote" accessibilityRole="button" onPress={retryFetch}>
          <View style={styles.retryButton}>
            <Ionicons color={colors.black} name="refresh" size={16} />
            <Text style={styles.retryButtonText}>Retry</Text>
          </View>
        </PressableScale>
      </View>
    );
  }

  if (!vehicle || !quote) {
    return (
      <View style={[styles.missing, { paddingTop: insets.top + spacing.sm }]}>
        <ScreenHeader onBack={() => router.back()} />
        <Ionicons color={colors.goldStrong} name="car-sport-outline" size={36} />
        <Text style={styles.missingTitle}>This vehicle listing is no longer available.</Text>
        <Text style={styles.subtitle}>
          Return to the fleet to select another chauffeur-ready option.
        </Text>
        <PressableScale accessibilityLabel="Return to fleet" accessibilityRole="button" onPress={() => router.back()}>
          <View style={styles.returnButton}>
            <Text style={styles.returnButtonText}>Return to Fleet</Text>
          </View>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader onBack={() => router.back()} />

        <View style={styles.intro}>
          <Text style={styles.title}>Review your journey</Text>
          <Text style={styles.subtitle}>
            MMG will recalculate the price on the server and hold these dates for 15 minutes. Creating the hold does not take payment or confirm the ride.
          </Text>
        </View>

        <View style={styles.vehicleCard}>
          <Image
            accessibilityLabel={vehicle.displayName}
            contentFit="cover"
            source={resolveVehicleImageSource(vehicle)}
            style={styles.vehicleImage}
          />
          <View style={styles.vehicleCopy}>
            <Text style={styles.vehicleName}>{vehicle.displayName}</Text>
            <View style={styles.vehicleMeta}>
              <Ionicons color={colors.gold} name="location-outline" size={13} />
              <Text style={styles.vehicleMetaText}>{vehicle.areaLabel} · {vehicle.seats} seats</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dates</Text>
          <View style={styles.journeyRow}>
            <JourneyPoint label="PICKUP" value={formatLagosDateOnly(journey.startDate)} />
            <View style={styles.journeyLine} />
            <Ionicons color={colors.goldStrong} name="arrow-forward" size={16} />
            <View style={styles.journeyLine} />
            <JourneyPoint label="RETURN" value={formatLagosDateOnly(journey.endDate)} />
          </View>
          <View style={styles.deliveryRow}>
            <View style={styles.deliveryIcon}>
              <Ionicons color={colors.goldStrong} name="navigate-outline" size={17} />
            </View>
            <View style={styles.deliveryCopy}>
              <Text style={styles.deliveryLabel}>LAGOS DELIVERY</Text>
              <Text style={styles.deliveryValue}>Exact address added after availability check</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {authoritativePrice ? 'Held quote' : 'Quote'}
          </Text>
          <View style={styles.quoteCard}>
            <QuoteRow
              label={`${formatNairaFromKobo(authoritativePrice?.ownerDailyRateKobo ?? vehicle.dailyRateKobo)} × ${authoritativePrice?.chargedDays ?? validDuration} ${((authoritativePrice?.chargedDays ?? validDuration) === 1) ? 'day' : 'days'}`}
              value={formatNairaFromKobo(authoritativePrice?.baseRentalKobo ?? quote.rentalKobo)}
            />
            <QuoteRow
              label="Service and protection"
              value={formatNairaFromKobo(authoritativePrice?.serviceFeeKobo ?? quote.serviceFeeKobo)}
            />
            <View style={styles.rule} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {authoritativePrice ? 'Held total' : 'Estimated total'}
              </Text>
              <Text style={styles.totalValue}>
                {formatNairaFromKobo(authoritativePrice?.renterTotalKobo ?? quote.totalKobo)}
              </Text>
            </View>
          </View>
        </View>

        {errorMessage ? (
          <View accessibilityLiveRegion="polite" style={styles.errorBox}>
            <Ionicons color={colors.danger} name="alert-circle" size={16} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {intentResult ? (
          <>
            <View accessibilityLiveRegion="polite" style={styles.successCard}>
              <Ionicons color={colors.success} name="checkmark-circle" size={24} />
              <Text style={styles.successTitle}>Booking hold created</Text>
              <Text style={styles.successText}>
                Dates are held until {new Date(intentResult.result.expiresAt).toLocaleTimeString('en-NG', {
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZone: 'Africa/Lagos',
                })} Lagos time. Payment still needs to be completed and verified.
              </Text>
            </View>
            <RenterPaymentCheckout
              holdExpiresAt={intentResult.result.expiresAt}
              intentId={intentResult.result.intentId}
              onRestartHold={() => {
                setIntentResult(null);
                setErrorMessage(null);
              }}
              onViewTrips={() => router.replace('/trips')}
            />
          </>
        ) : (
          <PressableScale
            disabled={submitting}
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
              } catch (err: unknown) {
                const reason = bookingCommandErrorMessage(err);
                setErrorMessage(
                  `${reason} No booking intent or date hold was created, and no charge was attempted.`,
                );
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <View style={[styles.ctaButton, submitting && { opacity: 0.6 }]}>
              <Text style={styles.ctaText}>
                {submitting ? 'CREATING SECURE HOLD...' : 'CREATE 15-MINUTE HOLD'}
              </Text>
            </View>
          </PressableScale>
        )}

        <View style={{ height: insets.bottom + spacing.xl }} />
      </ScrollView>
    </View>
  );
}

function JourneyPoint({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.point}>
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
  content: {
    paddingHorizontal: spacing.lg,
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    justifyContent: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
  },
  ctaText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
    letterSpacing: 1.2,
  },
  deliveryCopy: {
    flex: 1,
    gap: 2,
  },
  deliveryIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(212,175,55,0.1)',
    borderRadius: radii.sm,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  deliveryLabel: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  deliveryRow: {
    alignItems: 'center',
    borderColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
  },
  deliveryValue: {
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 12,
  },
  errorBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(209,133,120,0.12)',
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  intro: {
    gap: spacing.xs,
    marginVertical: spacing.md,
  },
  journeyLine: {
    backgroundColor: colors.line,
    flex: 1,
    height: 1,
  },
  journeyRow: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  loadingCenter: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    marginTop: spacing.md,
  },
  missing: {
    backgroundColor: colors.black,
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  missingTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 22,
  },
  point: {
    gap: 2,
  },
  pointLabel: {
    color: colors.muted,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  pointValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
  },
  quoteCard: {
    borderColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  quoteLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  quoteRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quoteValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
  },
  retryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryButtonText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
  },
  returnButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.graphiteRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  returnButtonText: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  rule: {
    backgroundColor: colors.line,
    height: 1,
    marginVertical: spacing.xs,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  section: {
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  sectionLabel: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  sectionTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 20,
  },
  stateHeader: {
    paddingHorizontal: spacing.lg,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  successCard: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.success,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  successText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  successTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 18,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 22,
  },
  totalLabel: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 15,
  },
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalValue: {
    color: colors.goldStrong,
    fontFamily: typography.display,
    fontSize: 20,
  },
  vehicleCard: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    overflow: 'hidden',
    padding: spacing.sm,
  },
  vehicleCopy: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  vehicleImage: {
    borderRadius: radii.sm,
    height: 70,
    width: 90,
  },
  vehicleMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  vehicleMetaText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
  },
  vehicleName: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
  },
});
