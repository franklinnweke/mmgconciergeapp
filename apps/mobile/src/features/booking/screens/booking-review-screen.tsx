import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { calculateBookingQuote, calculateChargedDays, formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import {
  addDaysToDateOnly,
  formatLagosDateOnly,
  parseDateOnly,
  todayLagosDateOnly,
} from '@/features/discovery/data/lagos-destinations';
import { getPreviewVehicleById } from '@/features/discovery/data/preview-discovery-gateway';
import { vehicleImages } from '@/features/discovery/data/vehicle-images';

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
  const vehicle = getPreviewVehicleById(vehicleId);
  const journey = useMemo(() => resolveJourney(startDate, endDate), [endDate, startDate]);
  const validDuration = journey.durationDays;
  const [requested, setRequested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const quote = useMemo(
    () => vehicle ? calculateBookingQuote(vehicle.dailyRateKobo, validDuration) : null,
    [validDuration, vehicle],
  );

  if (!vehicle || !quote) {
    return (
      <View style={[styles.missing, { paddingTop: insets.top + spacing.lg }]}>
        <PressableScale accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.back()}>
          <View style={styles.backButton}>
            <Ionicons color={colors.ivory} name="arrow-back" size={19} />
          </View>
        </PressableScale>
        <Text style={styles.missingTitle}>This quote is no longer available.</Text>
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
            source={vehicleImages[vehicle.imageKey]}
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

        {requested ? (
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <Ionicons color={colors.black} name="checkmark" size={20} />
            </View>
            <View style={styles.successCopy}>
              <Text style={styles.successTitle}>Availability requested.</Text>
              <Text style={styles.successBody}>
                Your estimate is saved in Trips. It remains unconfirmed until the trusted payment-first flow is connected.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.assurance}>
            <Ionicons color={colors.goldStrong} name="shield-checkmark-outline" size={20} />
            <Text style={styles.assuranceText}>
              No payment is taken when you request availability.
            </Text>
          </View>
        )}

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <PressableScale
          accessibilityRole="button"
          disabled={submitting}
          onPress={async () => {
            if (requested) {
              router.replace('/(renter)/trips');
              return;
            }

            setSubmitting(true);
            setErrorMessage(null);
            try {
              await requestAvailability({
                dailyRateKobo: vehicle.dailyRateKobo,
                durationDays: validDuration,
                pickupAt: `${journey.startDate}T10:00:00+01:00`,
                returnAt: `${journey.endDate}T10:00:00+01:00`,
                totalKobo: quote.totalKobo,
                vehicleId: vehicle.id,
              });
              setRequested(true);
            } catch {
              setErrorMessage('We could not save this request. Please try again.');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <View style={[styles.primaryButton, requested && styles.primaryButtonRequested]}>
            <Text style={styles.primaryText}>
              {submitting ? 'SAVING REQUEST…' : requested ? 'VIEW IN TRIPS' : 'REQUEST AVAILABILITY'}
            </Text>
            <Ionicons
              color={colors.black}
              name={requested ? 'calendar-clear-outline' : 'arrow-forward'}
              size={18}
            />
          </View>
        </PressableScale>
      </ScrollView>
    </View>
  );
}

function JourneyPoint({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.journeyPoint}>
      <Text style={styles.journeyLabel}>{label}</Text>
      <Text style={styles.journeyValue}>{value}</Text>
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
  assurance: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  assuranceText: { color: colors.muted, fontFamily: typography.body, fontSize: 10 },
  backButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, height: 42, justifyContent: 'center', width: 42 },
  content: { paddingBottom: 56, paddingHorizontal: spacing.lg },
  deliveryCopy: { flex: 1 },
  deliveryIcon: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, height: 40, justifyContent: 'center', width: 40 },
  deliveryLabel: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 7, letterSpacing: 1.4 },
  deliveryRow: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, paddingTop: spacing.lg },
  deliveryValue: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 11, lineHeight: 17, marginTop: 4 },
  eyebrow: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 8, letterSpacing: 1.8 },
  errorText: { color: colors.danger, fontFamily: typography.bodyMedium, fontSize: 10, textAlign: 'center' },
  intro: { marginBottom: spacing.xl, marginTop: spacing.xl },
  journeyLabel: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 7, letterSpacing: 1.3 },
  journeyLine: { backgroundColor: colors.lineStrong, flex: 1, height: StyleSheet.hairlineWidth },
  journeyPoint: { minWidth: 82 },
  journeyRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.lg },
  journeyValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 11, marginTop: 5 },
  missing: { backgroundColor: colors.black, flex: 1, gap: spacing.xl, paddingHorizontal: spacing.lg },
  missingTitle: { color: colors.ivory, fontFamily: typography.display, fontSize: 32 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.lg, minHeight: 58 },
  primaryButtonRequested: { backgroundColor: colors.ivory },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 10, letterSpacing: 1.3 },
  quoteCard: { backgroundColor: colors.graphite, borderColor: colors.line, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, marginTop: spacing.md, padding: spacing.lg },
  quoteLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 11 },
  quoteRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  quoteValue: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 11 },
  rule: { backgroundColor: colors.lineStrong, height: StyleSheet.hairlineWidth, marginVertical: spacing.md },
  screen: { backgroundColor: colors.black, flex: 1 },
  section: { marginBottom: spacing.xl },
  sectionLabel: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 8, letterSpacing: 1.7 },
  stepPill: { borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11, paddingVertical: 8 },
  stepText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 7, letterSpacing: 1.4 },
  subtitle: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, marginTop: spacing.sm, maxWidth: 340 },
  successBody: { color: colors.muted, fontFamily: typography.body, fontSize: 10, lineHeight: 16, marginTop: 4 },
  successCard: { alignItems: 'flex-start', backgroundColor: colors.graphite, borderColor: colors.line, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  successCopy: { flex: 1 },
  successIcon: { alignItems: 'center', backgroundColor: colors.success, borderRadius: radii.pill, height: 34, justifyContent: 'center', width: 34 },
  successTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 12 },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 39, letterSpacing: -0.8, lineHeight: 44, marginTop: spacing.sm },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 12 },
  totalRow: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
  totalValue: { color: colors.goldStrong, fontFamily: typography.display, fontSize: 25 },
  vehicleCard: { backgroundColor: colors.graphite, borderColor: colors.line, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', marginBottom: spacing.xl, overflow: 'hidden' },
  vehicleCategory: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 7, letterSpacing: 1.4 },
  vehicleCopy: { flex: 1, justifyContent: 'center', padding: spacing.md },
  vehicleImage: { height: 136, width: 132 },
  vehicleMeta: { alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: spacing.sm },
  vehicleMetaText: { color: colors.muted, fontFamily: typography.body, fontSize: 9 },
  vehicleName: { color: colors.ivory, fontFamily: typography.display, fontSize: 20, lineHeight: 25, marginTop: 4 },
});
