import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { VehicleSummary } from '@mmg/contracts';
import { calculateBookingQuote, calculateChargedDays, formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { createDiscoveryGateway } from '@/features/discovery/data/firestore-discovery-gateway';
import {
  addDaysToDateOnly,
  formatLagosDateOnly,
  parseDateOnly,
  todayLagosDateOnly,
} from '@/features/discovery/data/lagos-destinations';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';

import { useBookings } from '../booking-context';

type BookingReviewScreenProps = {
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

export default function BookingReviewScreen({ endDate, startDate, vehicleId }: BookingReviewScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { requestAvailability } = useBookings();
  const gateway = useMemo(() => createDiscoveryGateway(), []);
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
  const [requested, setRequested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!vehicleId) {
      setLoading(false);
      setVehicle(null);
      setFetchError(null);
      return;
    }
    let isMounted = true;
    setLoading(true);
    setFetchError(null);

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
            err instanceof Error ? err.message : 'Unable to connect to fleet services. Please try again.',
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

  if (loading) {
    return (
      <View style={[styles.screen, styles.loadingCenter, { paddingTop: insets.top + spacing.lg }]}>
        <ActivityIndicator color={colors.goldStrong} size="large" />
        <Text style={styles.loadingText}>Retrieving vehicle details...</Text>
      </View>
    );
  }

  if (fetchError) {
    return (
      <View style={[styles.missing, { paddingTop: insets.top + spacing.lg }]}>
        <PressableScale accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.back()}>
          <View style={styles.backButton}>
            <Ionicons color={colors.ivory} name="arrow-back" size={19} />
          </View>
        </PressableScale>
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
      <View style={[styles.missing, { paddingTop: insets.top + spacing.lg }]}>
        <PressableScale accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.back()}>
          <View style={styles.backButton}>
            <Ionicons color={colors.ivory} name="arrow-back" size={19} />
          </View>
        </PressableScale>
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
        <View style={styles.topBar}>
          <PressableScale accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.back()}>
            <View style={styles.backButton}>
              <Ionicons color={colors.ivory} name="arrow-back" size={19} />
            </View>
          </PressableScale>
          <BrandWordmark compact withLogo />
          <View style={styles.stepPill}>
            <Text style={styles.stepText}>REVIEW</Text>
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>EARLIER REQUEST FLOW</Text>
          <Text style={styles.title}>Review your availability request.</Text>
          <Text style={styles.subtitle}>
            This development path saves an estimate only. It does not hold dates, take payment, or confirm a booking.
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
            <Text style={styles.vehicleCategory}>
              {vehicle.category === 'executive_suv' ? 'EXECUTIVE SUV' : 'EXECUTIVE SALOON'}
            </Text>
            <Text style={styles.vehicleName}>{vehicle.displayName}</Text>
            <View style={styles.vehicleMeta}>
              <Ionicons color={colors.gold} name="location-outline" size={13} />
              <Text style={styles.vehicleMetaText}>{vehicle.areaLabel} · {vehicle.seats} seats</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>JOURNEY</Text>
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
          <Text style={styles.sectionLabel}>QUOTE SUMMARY</Text>
          <View style={styles.quoteCard}>
            <QuoteRow label={`${formatNairaFromKobo(vehicle.dailyRateKobo)} × ${validDuration} days`} value={formatNairaFromKobo(quote.rentalKobo)} />
            <QuoteRow label="Service and protection" value={formatNairaFromKobo(quote.serviceFeeKobo)} />
            <View style={styles.rule} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Estimated total</Text>
              <Text style={styles.totalValue}>{formatNairaFromKobo(quote.totalKobo)}</Text>
            </View>
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Ionicons color={colors.danger} name="alert-circle" size={16} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {requested ? (
          <View style={styles.successCard}>
            <Ionicons color={colors.success} name="checkmark-circle" size={24} />
            <Text style={styles.successTitle}>Availability Request Sent</Text>
            <Text style={styles.successText}>
              {'Your request has been logged. In the live system, the owner is contacted to confirm their chauffeur\'s schedule.'}
            </Text>
          </View>
        ) : (
          <PressableScale
            disabled={submitting}
            onPress={async () => {
              setSubmitting(true);
              setErrorMessage(null);
              try {
                await requestAvailability({
                  dailyRateKobo: vehicle.dailyRateKobo,
                  durationDays: validDuration,
                  pickupAt: journey.startDate,
                  returnAt: journey.endDate,
                  totalKobo: quote.totalKobo,
                  vehicleId: vehicle.id,
                });
                setRequested(true);
              } catch (err: unknown) {
                setErrorMessage(err instanceof Error ? err.message : 'Could not submit request.');
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <View style={[styles.ctaButton, submitting && { opacity: 0.6 }]}>
              <Text style={styles.ctaText}>
                {submitting ? 'LOGGING REQUEST...' : 'REQUEST AVAILABILITY'}
              </Text>
              <Ionicons color={colors.black} name="arrow-forward" size={16} />
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
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
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
    fontSize: 10,
    letterSpacing: 1,
  },
  deliveryRow: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
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
  eyebrow: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1.2,
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
    fontSize: 9,
    letterSpacing: 1,
  },
  pointValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
  },
  quoteCard: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
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
    fontSize: 10,
    letterSpacing: 1.2,
  },
  stepPill: {
    backgroundColor: 'rgba(212,175,55,0.15)',
    borderColor: colors.gold,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  stepText: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1.2,
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
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
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
  vehicleCategory: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1,
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
