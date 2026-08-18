import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { VehicleSummary } from '@mmg/contracts';
import { calculateBookingQuote, calculateChargedDays, formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { useAuth } from '@/core/auth/auth-context';
import { createDiscoveryGateway } from '@/features/discovery/data/firestore-discovery-gateway';
import {
  addDaysToDateOnly,
  formatLagosDateOnly,
  parseDateOnly,
  todayLagosDateOnly,
} from '@/features/discovery/data/lagos-destinations';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';

import { createBookingPaymentGateway } from '../data/booking-payment-gateway';

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
  const { user } = useAuth();
  const gateway = useMemo(() => createDiscoveryGateway(), []);
  const paymentGateway = useMemo(() => createBookingPaymentGateway(), []);

  const [vehicle, setVehicle] = useState<VehicleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const journey = useMemo(() => resolveJourney(startDate, endDate), [endDate, startDate]);
  const validDuration = journey.durationDays;

  // Checkout states
  const [processingState, setProcessingState] = useState<
    'idle' | 'creating_intent' | 'initializing_payment' | 'awaiting_payment' | 'verifying_payment' | 'confirmed'
  >('idle');
  const [confirmedBookingId, setConfirmedBookingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    gateway
      .getVehicleById(vehicleId)
      .then((v) => {
        if (isMounted) {
          setVehicle(v);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setVehicle(null);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [gateway, vehicleId]);

  const quote = useMemo(
    () => (vehicle ? calculateBookingQuote(vehicle.dailyRateKobo, validDuration) : null),
    [validDuration, vehicle],
  );

  /**
   * Flow A: Paystack Test Web Checkout
   */
  async function handlePaystackCheckout() {
    if (!vehicle || !quote || !user?.email) {
      setErrorMessage('User session or vehicle quote is missing.');
      return;
    }

    try {
      setErrorMessage(null);
      setProcessingState('creating_intent');

      // 1. Create Server Booking Intent
      const intent = await paymentGateway.createBookingIntent({
        vehicleId: vehicle.id,
        startDate: journey.startDate,
        endDate: journey.endDate,
      });

      setProcessingState('initializing_payment');

      // 2. Initialize Paystack Transaction with Server Key (server-derived amount & email)
      const initResult = await paymentGateway.initializePayment({
        intentId: intent.intentId,
      });

      if (!initResult.authorizationUrl) {
        throw new Error('Paystack did not return an authorization checkout URL.');
      }

      setProcessingState('awaiting_payment');

      // 3. Open Paystack In-App WebBrowser (auto-dismisses when redirecting to custom app scheme)
      const callbackUrl = Linking.createURL('payment/callback');
      await WebBrowser.openAuthSessionAsync(
        initResult.authorizationUrl,
        callbackUrl,
      );

      // 4. Verify Payment after user completes / dismisses browser
      setProcessingState('verifying_payment');
      const verifyResult = await paymentGateway.verifyPayment({
        intentId: intent.intentId,
        paymentReference: initResult.reference,
      });

      setConfirmedBookingId(verifyResult.bookingId);
      setProcessingState('confirmed');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Payment initialization or verification failed.');
      setProcessingState('idle');
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.loadingCenter, { paddingTop: insets.top + spacing.lg }]}>
        <ActivityIndicator color={colors.goldStrong} size="large" />
        <Text style={styles.loadingText}>Retrieving vehicle details...</Text>
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
        <Text style={styles.missingTitle}>This vehicle listing is no longer available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Navigation */}
        <View style={styles.topBar}>
          <PressableScale accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.back()}>
            <View style={styles.backButton}>
              <Ionicons color={colors.ivory} name="arrow-back" size={19} />
            </View>
          </PressableScale>
          <BrandWordmark compact withLogo />
          <View style={styles.stepPill}>
            <Text style={styles.stepText}>CHECKOUT</Text>
          </View>
        </View>

        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>EXECUTIVE CHAUFFEURED RESERVATION</Text>
          <Text style={styles.title}>Confirm & Authorize Escort</Text>
          <Text style={styles.subtitle}>
            Your luxury chauffeured vehicle is held atomically on the MMG Concierge network.
          </Text>
        </View>

        {/* Test Mode Banner */}
        <View style={styles.testModeBanner}>
          <View style={styles.testModeHeader}>
            <View style={styles.testModeBadge}>
              <View style={styles.testModeDot} />
              <Text style={styles.testModeBadgeText}>PAYSTACK TEST SANDBOX</Text>
            </View>
            <Text style={styles.testModeTag}>TEST CARDS ONLY</Text>
          </View>
          <Text style={styles.testModeDescription}>
            Test mode is active. No real bank cards or funds will be charged. Authenticate with Paystack sandbox test cards below to complete your booking.
          </Text>
        </View>

        {/* Vehicle Card Summary */}
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
              <Text style={styles.vehicleMetaText}>
                {vehicle.areaLabel} · {vehicle.seats} seats
              </Text>
            </View>
          </View>
        </View>

        {/* Journey Dates */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CHAUFFEURED ITINERARY</Text>
          <View style={styles.journeyRow}>
            <JourneyPoint label="PICKUP COMMENCEMENT" value={formatLagosDateOnly(journey.startDate)} />
            <View style={styles.journeyLine} />
            <Ionicons color={colors.goldStrong} name="arrow-forward" size={16} />
            <View style={styles.journeyLine} />
            <JourneyPoint label="SERVICE CONCLUSION" value={formatLagosDateOnly(journey.endDate)} />
          </View>
          <View style={styles.deliveryRow}>
            <View style={styles.deliveryIcon}>
              <Ionicons color={colors.goldStrong} name="navigate-outline" size={17} />
            </View>
            <View style={styles.deliveryCopy}>
              <Text style={styles.deliveryLabel}>CHAUFFEURED DELIVERY INCLUDED</Text>
              <Text style={styles.deliveryValue}>Executive vehicle dispatched directly to your Lagos address.</Text>
            </View>
          </View>
        </View>

        {/* Price Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PRICE BREAKDOWN</Text>
          <View style={styles.quoteCard}>
            <QuoteRow
              label={`Chauffeured Rental (${validDuration} ${validDuration === 1 ? 'day' : 'days'})`}
              value={formatNairaFromKobo(quote.rentalKobo)}
            />
            <QuoteRow label="Executive Chauffeur & Fuel Security" value="INCLUDED (₦0)" />
            <QuoteRow label="Concierge Service & Protection" value={formatNairaFromKobo(quote.serviceFeeKobo)} />
            <View style={styles.rule} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Amount Due</Text>
              <Text style={styles.totalValue}>{formatNairaFromKobo(quote.totalKobo)}</Text>
            </View>
          </View>
        </View>

        {/* Error Notification */}
        {errorMessage ? (
          <View style={styles.errorBox}>
            <Ionicons color={colors.danger} name="alert-circle" size={18} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {/* Confirmed State */}
        {processingState === 'confirmed' ? (
          <View style={styles.successCard}>
            <View style={styles.successIconBox}>
              <Ionicons color={colors.success} name="checkmark-circle" size={36} />
            </View>
            <Text style={styles.successTitle}>Chauffeured Escort Reserved!</Text>
            <Text style={styles.successSubtitle}>
              Payment verified with Paystack Sandbox. Your booking is awaiting owner schedule acknowledgment.
            </Text>
            {confirmedBookingId ? (
              <View style={styles.bookingIdBox}>
                <Text style={styles.bookingIdLabel}>BOOKING REFERENCE</Text>
                <Text style={styles.bookingIdValue}>{confirmedBookingId}</Text>
              </View>
            ) : null}

            <PressableScale
              onPress={() => {
                if (confirmedBookingId) {
                  router.push(`/trip/${confirmedBookingId}` as any);
                } else {
                  router.push('/(renter)/trips' as any);
                }
              }}
              style={styles.viewTripButton}
            >
              <View style={styles.viewTripButtonContent}>
                <Text style={styles.viewTripButtonText}>VIEW JOURNEY IN CONCIERGE DESK</Text>
                <Ionicons color={colors.black} name="arrow-forward" size={16} />
              </View>
            </PressableScale>
          </View>
        ) : (
          /* Payment Actions */
          <View style={styles.actionsContainer}>
            {/* Paystack Test Checkout Button */}
            <PressableScale
              disabled={processingState !== 'idle'}
              onPress={handlePaystackCheckout}
            >
              <View style={[styles.paystackButton, processingState !== 'idle' && styles.buttonDisabled]}>
                {processingState !== 'idle' ? (
                  <ActivityIndicator color={colors.black} size="small" />
                ) : (
                  <Ionicons color={colors.black} name="card-outline" size={18} />
                )}
                <Text style={styles.paystackButtonText}>
                  {processingState === 'creating_intent'
                    ? 'HOLDING DATES...'
                    : processingState === 'initializing_payment'
                      ? 'CONNECTING PAYSTACK...'
                      : processingState === 'awaiting_payment'
                        ? 'AWAITING CHECKOUT...'
                        : processingState === 'verifying_payment'
                          ? 'VERIFYING PAYMENT...'
                          : `PAY ${formatNairaFromKobo(quote.totalKobo)} WITH PAYSTACK`}
                </Text>
              </View>
            </PressableScale>

            {/* Test Card Assistant */}
            <View style={styles.testCardBox}>
              <Text style={styles.testCardTitle}>PAYSTACK TEST CARDS AVAILABLE</Text>
              <View style={styles.testCardRow}>
                <Text style={styles.testCardLabel}>Mastercard / Visa:</Text>
                <Text style={styles.testCardValue}>4084 0840 0840 0840</Text>
              </View>
              <View style={styles.testCardRow}>
                <Text style={styles.testCardLabel}>Expiry / CVV / PIN:</Text>
                <Text style={styles.testCardValue}>12/30 · 408 · PIN 3310</Text>
              </View>
            </View>
          </View>
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
  actionsContainer: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
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
  bookingIdBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(212,175,55,0.08)',
    borderColor: 'rgba(212,175,55,0.2)',
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 4,
    marginVertical: spacing.md,
    padding: spacing.md,
    width: '100%',
  },
  bookingIdLabel: {
    color: colors.gold,
    fontFamily: typography.bodyMedium,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  bookingIdValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
    letterSpacing: 1,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  content: {
    paddingHorizontal: spacing.lg,
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
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.1,
  },
  deliveryRow: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  deliveryValue: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  errorBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  errorText: {
    color: '#EF4444',
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  eyebrow: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  intro: {
    gap: spacing.xs,
    marginTop: spacing.lg,
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
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    marginTop: spacing.md,
  },
  missing: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  missingTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 18,
    marginTop: spacing.lg,
  },
  paystackButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  paystackButtonText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
    letterSpacing: 1.2,
  },
  point: {
    flex: 1,
    gap: 3,
  },
  pointLabel: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 10,
    letterSpacing: 1.2,
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
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quoteLabel: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  quoteValue: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
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
    marginTop: spacing.lg,
  },
  sectionLabel: {
    color: colors.silver,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  simulateButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(212,175,55,0.08)',
    borderColor: 'rgba(212,175,55,0.25)',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
  },
  simulateButtonText: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.1,
  },
  stepPill: {
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderColor: 'rgba(212,175,55,0.3)',
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  stepText: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1.4,
  },
  subtitle: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  successCard: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.xl,
  },
  successIconBox: {
    marginBottom: spacing.sm,
  },
  successSubtitle: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    textAlign: 'center',
  },
  successTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 18,
    textAlign: 'center',
  },
  testCardBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 4,
    marginTop: spacing.xs,
    padding: spacing.md,
  },
  testCardLabel: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
  },
  testCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  testCardTitle: {
    color: colors.silver,
    fontFamily: typography.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  testCardValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
  },
  testModeBanner: {
    backgroundColor: 'rgba(227,195,101,0.08)',
    borderColor: 'rgba(227,195,101,0.25)',
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 6,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  testModeBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(227,195,101,0.18)',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  testModeBadgeText: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  testModeDescription: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  testModeDot: {
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    height: 6,
    width: 6,
  },
  testModeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  testModeTag: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
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
    fontSize: 14,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  totalValue: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: 16,
  },
  vehicleCard: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    overflow: 'hidden',
    padding: spacing.sm,
  },
  vehicleCategory: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  vehicleCopy: {
    flex: 1,
    gap: 3,
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
    marginTop: 2,
  },
  vehicleMetaText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
  },
  vehicleName: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
  },
  viewTripButton: {
    marginTop: spacing.md,
    width: '100%',
  },
  viewTripButtonContent: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  viewTripButtonText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: 12,
    letterSpacing: 1.2,
  },
});
