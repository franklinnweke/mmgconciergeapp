import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { type CreateBookingIntentResult, type VehicleSummary } from '@mmg/contracts';
import { calculateBookingQuote, calculateChargedDays, formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  InlineNotice,
  MobileHeader,
  PrimaryAction,
  SectionHeading,
} from '@/components/ui/mobile-primitives';
import { safeProviderError } from '@/core/errors/safe-provider-error';
import { createDiscoveryGateway } from '@/features/discovery/data/firestore-discovery-gateway';
import {
  addDaysToDateOnly,
  formatLagosDateOnly,
  parseDateOnly,
  todayLagosDateOnly,
} from '@/features/discovery/data/lagos-destinations';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';

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
  const [intentResult, setIntentResult] = useState<CreateBookingIntentResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const journey = useMemo(() => resolveJourney(startDate, endDate), [endDate, startDate]);

  const retryFetch = useCallback(() => {
    setFetchError(null);
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!vehicleId) return;
    let isMounted = true;

    gateway
      .getVehicleById(vehicleId)
      .then((nextVehicle) => {
        if (!isMounted) return;
        setVehicle(nextVehicle);
        setFetchError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setVehicle(null);
        setFetchError(safeProviderError(err, 'Unable to connect to fleet services. Please try again.'));
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [gateway, reloadKey, vehicleId]);

  const quote = useMemo(
    () => (vehicle ? calculateBookingQuote(vehicle.dailyRateKobo, journey.durationDays) : null),
    [journey.durationDays, vehicle],
  );
  const authoritativePrice = intentResult?.result.priceSnapshot ?? null;

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + spacing.lg }]}>
        <ActivityIndicator color={colors.goldStrong} size="small" />
        <Text style={styles.centerText}>Loading booking details</Text>
      </View>
    );
  }

  if (fetchError || !vehicle || !quote) {
    return (
      <View style={[styles.fallbackScreen, { paddingTop: insets.top + spacing.sm }]}>
        <MobileHeader onBack={() => router.back()} />
        <View style={styles.fallbackCopy}>
          <Ionicons
            color={fetchError ? colors.danger : colors.goldStrong}
            name={fetchError ? 'cloud-offline-outline' : 'car-outline'}
            size={30}
          />
          <Text style={styles.fallbackTitle}>{fetchError ? 'Could not load this booking' : 'Vehicle unavailable'}</Text>
          <Text style={styles.fallbackBody}>
            {fetchError ?? 'Return to the fleet and choose another available vehicle.'}
          </Text>
          {fetchError ? (
            <View style={styles.fallbackAction}>
              <PrimaryAction icon="refresh" label="Try again" onPress={retryFetch} />
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  const chargedDays = authoritativePrice?.chargedDays ?? journey.durationDays;
  const dailyRate = authoritativePrice?.ownerDailyRateKobo ?? vehicle.dailyRateKobo;
  const rental = authoritativePrice?.baseRentalKobo ?? quote.rentalKobo;
  const serviceFee = authoritativePrice?.serviceFeeKobo ?? quote.serviceFeeKobo;
  const total = authoritativePrice?.renterTotalKobo ?? quote.totalKobo;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <MobileHeader onBack={() => router.back()} title="Review" />

        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>Review your journey</Text>
          <Text style={styles.subtitle}>
            We will verify the price and hold these dates for 15 minutes. No payment is taken yet.
          </Text>
        </View>

        <View style={styles.vehicleSummary}>
          <Image
            accessibilityLabel={vehicle.displayName}
            contentFit="cover"
            source={resolveVehicleImageSource(vehicle)}
            style={styles.vehicleImage}
          />
          <View style={styles.vehicleCopy}>
            <Text numberOfLines={2} style={styles.vehicleName}>{vehicle.displayName}</Text>
            <Text style={styles.vehicleMeta}>{vehicle.areaLabel} · {vehicle.seats} seats</Text>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeading>Dates</SectionHeading>
          <View style={styles.dateRow}>
            <View style={styles.dateColumn}>
              <Text style={styles.dateLabel}>Pickup</Text>
              <Text style={styles.dateValue}>{formatLagosDateOnly(journey.startDate)}</Text>
            </View>
            <Ionicons color={colors.muted} name="arrow-forward" size={17} />
            <View style={[styles.dateColumn, styles.dateColumnEnd]}>
              <Text style={styles.dateLabel}>Return</Text>
              <Text style={styles.dateValue}>{formatLagosDateOnly(journey.endDate)}</Text>
            </View>
          </View>
          <Text style={styles.deliveryNote}>Exact Lagos delivery address is confirmed after availability.</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.quoteHeader}>
            <SectionHeading>{authoritativePrice ? 'Held price' : 'Estimated price'}</SectionHeading>
            {authoritativePrice ? <Text style={styles.verifiedPrice}>Verified</Text> : null}
          </View>
          <QuoteRow
            label={`${formatNairaFromKobo(dailyRate)} × ${chargedDays} ${chargedDays === 1 ? 'day' : 'days'}`}
            value={formatNairaFromKobo(rental)}
          />
          <QuoteRow label="Service and protection" value={formatNairaFromKobo(serviceFee)} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatNairaFromKobo(total)}</Text>
          </View>
        </View>

        {errorMessage ? (
          <InlineNotice icon="alert-circle-outline" tone="danger">{errorMessage}</InlineNotice>
        ) : null}

        {intentResult ? (
          <View style={styles.successBlock}>
            <InlineNotice icon="checkmark-circle-outline" tone="success">
              Dates held until {new Date(intentResult.result.expiresAt).toLocaleTimeString('en-NG', {
                hour: 'numeric',
                minute: '2-digit',
                timeZone: 'Africa/Lagos',
              })} Lagos time. No payment was taken and the journey is not yet confirmed.
            </InlineNotice>
          </View>
        ) : (
          <View style={styles.primaryArea}>
            <PrimaryAction
              icon="arrow-forward"
              label="Hold these dates"
              loading={submitting}
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
                  setErrorMessage(`${reason} No date hold was created and no charge was attempted.`);
                } finally {
                  setSubmitting(false);
                }
              }}
            />
            <Text style={styles.primaryHint}>15-minute hold · no payment</Text>
          </View>
        )}
      </ScrollView>
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
  centerText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  centered: {
    alignItems: 'center',
    backgroundColor: colors.black,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.md,
  },
  dateColumn: { flex: 1 },
  dateColumnEnd: { alignItems: 'flex-end' },
  dateLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  dateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  dateValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
    marginTop: 3,
  },
  deliveryNote: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  fallbackAction: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  fallbackBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  fallbackCopy: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  fallbackScreen: {
    backgroundColor: colors.black,
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  fallbackTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 27,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  intro: {
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  primaryArea: {
    marginTop: spacing.lg,
  },
  primaryHint: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  quoteHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  quoteLabel: {
    color: colors.muted,
    flex: 1,
    fontFamily: typography.body,
    fontSize: 13,
  },
  quoteRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  quoteValue: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  section: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
    maxWidth: 350,
  },
  successBlock: {
    marginTop: spacing.lg,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 31,
    letterSpacing: -0.55,
  },
  totalLabel: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
  },
  totalRow: {
    alignItems: 'baseline',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.md,
  },
  totalValue: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 25,
  },
  vehicleCopy: {
    flex: 1,
    paddingRight: spacing.xs,
  },
  vehicleImage: {
    backgroundColor: colors.graphiteRaised,
    borderRadius: radii.md,
    height: 84,
    width: 108,
  },
  vehicleMeta: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: 4,
  },
  vehicleName: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 21,
    letterSpacing: -0.25,
  },
  vehicleSummary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  verifiedPrice: {
    color: colors.success,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
});
