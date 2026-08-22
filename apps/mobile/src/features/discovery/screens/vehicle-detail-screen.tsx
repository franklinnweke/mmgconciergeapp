import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, layout, radii, spacing, typography } from '@mmg/brand';
import { type VehicleSummary } from '@mmg/contracts';
import { calculateBookingQuote, calculateChargedDays, formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { safeProviderError } from '@/core/errors/safe-provider-error';

import {
  addDaysToDateOnly,
  formatLagosDateOnly,
  parseDateOnly,
  todayLagosDateOnly,
} from '../data/lagos-destinations';
import { createDiscoveryGateway } from '../data/firestore-discovery-gateway';
import {
  resolveVehicleImageSource,
  resolveVehicleImageUrlSource,
  vehicleImages,
} from '../data/vehicle-images';
import {
  createVehicleCalendarGateway,
  type VehicleCalendarGateway,
} from '../data/vehicle-calendar-gateway';
import { vehicleCalendarErrorMessage } from '../data/vehicle-calendar-gateway-core';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const durationOptions = [
  { days: 1, label: '1 Day' },
  { days: 2, label: '2 Days' },
  { days: 3, label: '3 Days' },
  { days: 7, label: '1 Week' },
] as const;

export type VehicleDetailScreenProps = {
  calendarGateway?: VehicleCalendarGateway;
  endDate?: string;
  startDate?: string;
  vehicleId: string;
};

function initialJourney(startDate?: string, endDate?: string) {
  const start = parseDateOnly(startDate) ?? todayLagosDateOnly();
  try {
    const parsedEnd = parseDateOnly(endDate);
    const durationDays = parsedEnd ? calculateChargedDays(start, parsedEnd) : 1;
    return {
      durationDays: durationOptions.some((option) => option.days === durationDays)
        ? durationDays
        : 1,
      startDate: start,
    };
  } catch {
    return { durationDays: 1, startDate: start };
  }
}

export default function VehicleDetailScreen({
  calendarGateway: injectedCalendarGateway,
  endDate: propEndDate,
  startDate: propStartDate,
  vehicleId,
}: VehicleDetailScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [vehicle, setVehicle] = useState<VehicleSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(vehicleId));
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retryFetch = useCallback(() => {
    setFetchError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const gateway = useMemo(() => createDiscoveryGateway(), []);
  const calendarGateway = useMemo(
    () => injectedCalendarGateway ?? createVehicleCalendarGateway(),
    [injectedCalendarGateway],
  );

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

  const [{ durationDays, startDate: pickupDate }, setJourney] = useState(() =>
    initialJourney(propStartDate, propEndDate),
  );

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [availabilityReloadKey, setAvailabilityReloadKey] = useState(0);
  const [availability, setAvailability] = useState<{
    error: string | null;
    status: 'loading' | 'available' | 'unavailable' | 'error';
  }>({ error: null, status: 'loading' });

  const returnDate = useMemo(() => addDaysToDateOnly(pickupDate, durationDays), [pickupDate, durationDays]);

  useEffect(() => {
    if (!vehicleId) return;
    let isMounted = true;
    calendarGateway.getCalendar({
      vehicleId,
      windowStartDate: pickupDate,
      windowEndDate: returnDate,
    }).then((result) => {
      if (!isMounted) return;
      const fullyAvailable = result.days.length === durationDays && result.days.every((day) => day.available);
      setAvailability({ error: null, status: fullyAvailable ? 'available' : 'unavailable' });
    }).catch((caught: unknown) => {
      if (!isMounted) return;
      setAvailability({
        error: vehicleCalendarErrorMessage(caught),
        status: 'error',
      });
    });
    return () => {
      isMounted = false;
    };
  }, [availabilityReloadKey, calendarGateway, durationDays, pickupDate, returnDate, vehicleId]);

  const quote = useMemo(() => {
    if (!vehicle) return null;
    return calculateBookingQuote(vehicle.dailyRateKobo, durationDays);
  }, [durationDays, vehicle]);

  // Build multi-image gallery array (using remote imageUrls or local bundled photography)
  const galleryImages = useMemo(() => {
    if (!vehicle) return [];
    if (vehicle.imageUrls && vehicle.imageUrls.length > 0) {
      return vehicle.imageUrls.map((url: string) =>
        resolveVehicleImageUrlSource(url, vehicle),
      );
    }
    if (vehicle.imageUrl) {
      return [resolveVehicleImageUrlSource(vehicle.imageUrl, vehicle)];
    }
    const primary = resolveVehicleImageSource(vehicle);
    const images = [primary];
    if (vehicle.imageKey === 'hero-suv') {
      images.push(vehicleImages['pearl-suv'], vehicleImages['prado-graphite']);
    } else if (vehicle.imageKey === 'pearl-suv') {
      images.push(vehicleImages['hero-suv'], vehicleImages['prado-graphite']);
    } else if (vehicle.imageKey === 'prado-graphite') {
      images.push(vehicleImages['hero-suv'], vehicleImages['pearl-suv']);
    } else if (vehicle.imageKey === 'graphite-sedan') {
      images.push(vehicleImages['graphite-sedan']);
    }
    return images;
  }, [vehicle]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const slide = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (slide !== activeImageIndex && slide >= 0 && slide < galleryImages.length) {
      setActiveImageIndex(slide);
    }
  };

  if (loading) {
    return (
      <View style={[styles.missingScreen, { paddingTop: insets.top + spacing.lg }]}>
        <PressableScale accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.back()}>
          <View style={styles.roundButton}>
            <Ionicons color={colors.ivory} name="arrow-back" size={20} />
          </View>
        </PressableScale>
        <View style={styles.missingCopy}>
          <ActivityIndicator color={colors.goldStrong} size="large" />
          <Text style={styles.loadingText}>Retrieving vehicle specifications…</Text>
        </View>
      </View>
    );
  }

  if (fetchError) {
    return (
      <View style={[styles.missingScreen, { paddingTop: insets.top + spacing.lg }]}>
        <PressableScale accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.back()}>
          <View style={styles.roundButton}>
            <Ionicons color={colors.ivory} name="arrow-back" size={20} />
          </View>
        </PressableScale>
        <View style={styles.missingCopy}>
          <Ionicons color={colors.danger} name="cloud-offline-outline" size={36} />
          <Text style={styles.missingTitle}>Connection Error</Text>
          <Text style={styles.missingBody}>
            Unable to connect to the fleet registry. Please check your network and try again.
          </Text>
          <PressableScale accessibilityLabel="Retry loading vehicle" accessibilityRole="button" onPress={retryFetch}>
            <View style={styles.retryButton}>
              <Ionicons color={colors.black} name="refresh" size={16} />
              <Text style={styles.retryButtonText}>Retry</Text>
            </View>
          </PressableScale>
        </View>
      </View>
    );
  }

  if (!vehicle || !quote) {
    return (
      <View style={[styles.missingScreen, { paddingTop: insets.top + spacing.lg }]}>
        <PressableScale accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.back()}>
          <View style={styles.roundButton}>
            <Ionicons color={colors.ivory} name="arrow-back" size={20} />
          </View>
        </PressableScale>
        <View style={styles.missingCopy}>
          <Ionicons color={colors.goldStrong} name="car-sport-outline" size={36} />
          <Text style={styles.missingTitle}>Vehicle unavailable.</Text>
          <Text style={styles.missingBody}>Return to the fleet to choose another chauffeur-ready option.</Text>
          <PressableScale accessibilityLabel="Return to fleet" accessibilityRole="button" onPress={() => router.back()}>
            <View style={styles.returnButton}>
              <Text style={styles.returnButtonText}>Return to Fleet</Text>
            </View>
          </PressableScale>
        </View>
      </View>
    );
  }

  const pickupFormatted = formatLagosDateOnly(pickupDate);
  const returnFormatted = formatLagosDateOnly(returnDate);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Swipeable Photo Gallery Hero */}
        <View style={styles.hero}>
          <FlatList
            data={galleryImages}
            horizontal
            keyExtractor={(_, index) => `img-${index}`}
            onScroll={handleScroll}
            pagingEnabled
            renderItem={({ item }) => (
              <View style={styles.gallerySlide}>
                <Image
                  contentFit="cover"
                  source={item}
                  style={StyleSheet.absoluteFill}
                  transition={200}
                />
              </View>
            )}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(4,4,4,0.45)', 'transparent', colors.black]}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Top Bar Nav */}
          <View style={[styles.heroTop, { paddingTop: insets.top + spacing.sm }]}>
            <PressableScale
              accessibilityLabel="Go back to fleet"
              accessibilityRole="button"
              onPress={() => router.back()}
            >
              <View style={styles.roundButton}>
                <Ionicons color={colors.ivory} name="arrow-back" size={20} />
              </View>
            </PressableScale>

            <View style={styles.topPillsRow}>
              {galleryImages.length > 1 ? (
                <View style={styles.counterPill}>
                  <Text style={styles.counterText}>
                    {activeImageIndex + 1} / {galleryImages.length}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Hero Header Copy */}
          <View style={styles.heroCopy}>
            <Text style={styles.title}>{vehicle.displayName}</Text>
            <View style={styles.heroMeta}>
              <Ionicons color={colors.goldStrong} name="location-outline" size={16} />
              <Text style={styles.heroMetaText}>{vehicle.areaLabel}</Text>
              <View style={styles.metaDot} />
              <Text style={styles.heroMetaText}>{vehicle.distanceKm.toFixed(1)} km</Text>
              <View style={styles.metaDot} />
              <Text style={styles.heroMetaText}>{vehicle.seats} Seats</Text>
            </View>
          </View>
        </View>

        {/* Body Specifications & Details */}
        <View style={styles.body}>
          {/* Daily Rate Header */}
          <View style={styles.rateRow}>
            <View>
              <Text style={styles.label}>DAILY RATE</Text>
              <Text style={styles.rate}>{formatNairaFromKobo(vehicle.dailyRateKobo)}</Text>
            </View>
          </View>

          {/* Service Promises Rail */}

          {/* Key Specifications Grid */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Details</Text>
            <View style={styles.detailsList}>
              <DetailRow label="Capacity" value={`${vehicle.seats} passengers`} />
              <DetailRow label="Transmission" value="Automatic" />
              <DetailRow label="Luggage" value="3 large bags" />
              <DetailRow label="Climate" value="Dual A/C system" />
            </View>
          </View>

          {/* Journey Duration Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Dates</Text>
            <View style={styles.durationRail}>
              {durationOptions.map((option) => {
                const selected = option.days === durationDays;
                return (
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={option.label}
                    onPress={() => {
                      setAvailability({ error: null, status: 'loading' });
                      setJourney({ durationDays: option.days, startDate: pickupDate });
                    }}
                    style={styles.durationFlex}
                  >
                    <View style={[styles.durationButton, selected && styles.durationButtonSelected]}>
                      <Text style={[styles.durationText, selected && styles.durationTextSelected]}>
                        {option.label}
                      </Text>
                    </View>
                  </PressableScale>
                );
              })}
            </View>

            {/* Date Summary Card */}
            <View style={styles.dateSummary}>
              <View style={styles.dateCol}>
                <Text style={styles.dateColLabel}>PICKUP</Text>
                <Text style={styles.dateColValue}>{pickupFormatted}</Text>
              </View>
              <Ionicons color={colors.gold} name="arrow-forward" size={16} />
              <View style={styles.dateCol}>
                <Text style={styles.dateColLabel}>RETURN</Text>
                <Text style={styles.dateColValue}>{returnFormatted}</Text>
              </View>
            </View>

            <View
              accessibilityLiveRegion="polite"
              style={[
                styles.availabilityNotice,
                availability.status === 'unavailable' && styles.availabilityNoticeUnavailable,
                availability.status === 'error' && styles.availabilityNoticeError,
              ]}
            >
              {availability.status === 'loading' ? (
                <ActivityIndicator color={colors.goldStrong} size="small" />
              ) : (
                <Ionicons
                  color={availability.status === 'available' ? colors.success : colors.danger}
                  name={availability.status === 'available' ? 'checkmark-circle' : 'alert-circle'}
                  size={18}
                />
              )}
              <View style={styles.availabilityNoticeCopy}>
                <Text style={styles.availabilityNoticeTitle}>
                  {availability.status === 'loading'
                    ? 'Checking trusted calendar…'
                    : availability.status === 'available'
                      ? 'Dates currently available'
                      : availability.status === 'unavailable'
                        ? 'Choose different dates'
                        : 'Availability check unavailable'}
                </Text>
                <Text style={styles.availabilityNoticeBody}>
                  {availability.status === 'available'
                    ? 'Final availability is secured only when MMG creates your 15-minute hold.'
                    : availability.status === 'unavailable'
                      ? 'The selected period is unavailable. Private calendar details are not shown.'
                      : availability.status === 'error'
                        ? vehicleCalendarErrorMessage(availability.error)
                        : 'This does not reserve the vehicle.'}
                </Text>
              </View>
              {availability.status === 'error' ? (
                <PressableScale
                  accessibilityLabel="Retry availability check"
                  accessibilityRole="button"
                  onPress={() => {
                    setAvailability({ error: null, status: 'loading' });
                    setAvailabilityReloadKey((key) => key + 1);
                  }}
                  style={styles.availabilityRetry}
                >
                  <Ionicons color={colors.goldStrong} name="refresh" size={18} />
                </PressableScale>
              ) : null}
            </View>
          </View>

          {/* Server-Aligned Quote Breakdown Card */}
          <View style={styles.quoteSection}>
            <Text style={styles.sectionTitle}>Quote</Text>

            <QuoteRow
              label={`${formatNairaFromKobo(vehicle.dailyRateKobo)} × ${durationDays} ${durationDays === 1 ? 'day' : 'days'}`}
              value={formatNairaFromKobo(quote.rentalKobo)}
            />
            <QuoteRow
              label="Service and protection fee"
              value={formatNairaFromKobo(quote.serviceFeeKobo)}
            />
            <QuoteRow
              label="Chauffeur and Lagos delivery"
              value="Included"
            />

            <View style={styles.totalRule} />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Estimated Total</Text>
              <Text style={styles.totalValue}>{formatNairaFromKobo(quote.totalKobo)}</Text>
            </View>

            <Text style={styles.quoteNote}>
              This is a configuration-aligned estimate. The next step creates a short server hold only; it does not take payment or confirm the journey.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Sticky Bottom Purchase / Review Action Bar */}
      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.stickyQuoteBlock}>
          <Text style={styles.stickyQuoteLabel}>TOTAL ESTIMATE</Text>
          <Text style={styles.stickyQuoteValue}>{formatNairaFromKobo(quote.totalKobo)}</Text>
        </View>

        <PressableScale
          accessibilityRole="button"
          disabled={availability.status !== 'available'}
          onPress={() =>
            router.push({
              pathname: '/booking/review',
              params: { endDate: returnDate, startDate: pickupDate, vehicleId: vehicle.id },
            })
          }
          style={[styles.stickyActionFlex, availability.status !== 'available' && styles.stickyActionDisabled]}
        >
          <View style={styles.primaryButton}>
            <Text style={styles.primaryText}>
              {availability.status === 'loading'
                ? 'Checking Dates'
                : availability.status === 'available'
                  ? 'Review Quote'
                  : 'Dates Unavailable'}
            </Text>
            <Ionicons color={colors.black} name="arrow-forward" size={18} />
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
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
  availabilityNotice: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    minHeight: 68,
    paddingVertical: spacing.sm,
  },
  availabilityNoticeBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
    lineHeight: 17,
    marginTop: 2,
  },
  availabilityNoticeCopy: { flex: 1 },
  availabilityNoticeError: { borderBottomColor: colors.danger, borderTopColor: colors.danger },
  availabilityNoticeTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  availabilityNoticeUnavailable: { borderBottomColor: colors.danger, borderTopColor: colors.danger },
  availabilityRetry: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  availableDot: {
    backgroundColor: colors.success,
    borderRadius: radii.pill,
    height: 6,
    width: 6,
  },
  availablePill: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,4,4,0.72)',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  availableText: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.8,
  },
  body: {
    gap: layout.componentGap,
    paddingHorizontal: layout.screenGutter,
  },
  category: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 1.5,
  },
  content: {
    backgroundColor: colors.black,
  },
  counterPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,4,4,0.72)',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  counterText: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
  },
  dateCol: {
    alignItems: 'center',
    gap: 4,
  },
  dateColLabel: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 1,
  },
  dateColValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  dateSummary: {
    alignItems: 'center',
    borderColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.md,
    paddingVertical: spacing.md,
  },
  durationButton: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 46,
  },
  durationButtonSelected: {
    backgroundColor: colors.ivory,
    borderColor: colors.ivory,
  },
  durationFlex: {
    flex: 1,
  },
  durationRail: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  durationText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  durationTextSelected: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
  },
  gallerySlide: {
    height: 480,
    width: SCREEN_WIDTH,
  },
  hero: {
    height: 480,
    justifyContent: 'space-between',
  },
  heroCopy: {
    paddingBottom: spacing.xl,
    paddingHorizontal: layout.screenGutter,
  },
  heroMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.sm,
  },
  heroMetaText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenGutter,
  },
  inclusionBadge: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inclusionBadgeText: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
  },
  label: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 1.2,
  },
  metaDot: {
    backgroundColor: colors.lineStrong,
    borderRadius: radii.pill,
    height: 4,
    width: 4,
  },
  loadingText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.sm,
    marginTop: spacing.md,
  },
  missingBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.base,
    lineHeight: 22,
    textAlign: 'center',
  },
  missingCopy: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  missingScreen: {
    backgroundColor: colors.black,
    flex: 1,
    paddingHorizontal: layout.screenGutter,
  },
  missingTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.display,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.xl,
  },
  retryButtonText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  returnButton: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.xl,
  },
  returnButtonText: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: layout.primaryButtonHeight,
  },
  primaryText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
  },
  promiseDivider: {
    backgroundColor: colors.line,
    height: 24,
    width: StyleSheet.hairlineWidth,
  },
  promiseItem: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  promiseRail: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingVertical: spacing.md,
  },
  promiseText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
  },
  quoteHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  quoteLabel: {
    color: colors.silver,
    fontFamily: typography.body,
    fontSize: fontSizes.sm,
  },
  quoteNote: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  quoteRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  quoteSection: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
    paddingTop: spacing.md,
  },
  quoteTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.xl,
    marginTop: 4,
  },
  quoteValue: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  rate: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.display,
    marginTop: 2,
  },
  rateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  roundButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,4,4,0.74)',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  section: {
    gap: spacing.xs,
  },
  sectionEyebrow: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 1.2,
  },
  sectionTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.xl,
    letterSpacing: -0.4,
  },
  detailsList: {
    marginTop: spacing.sm,
  },
  detailRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  detailLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.sm,
  },
  detailValue: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  specBadge: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    width: '48%',
  },
  specCopy: {
    gap: 2,
  },
  specLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
  },
  specsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  specValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  stickyActionFlex: {
    flex: 1,
  },
  stickyActionDisabled: {
    opacity: 0.48,
  },
  stickyBar: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderTopColor: colors.lineStrong,
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.lg,
    left: 0,
    paddingHorizontal: layout.screenGutter,
    paddingTop: spacing.md,
    position: 'absolute',
    right: 0,
  },
  stickyQuoteBlock: {
    gap: 2,
  },
  stickyQuoteLabel: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 1,
  },
  stickyQuoteValue: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.xl,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.displayLarge,
    letterSpacing: -1,
    lineHeight: 44,
    marginTop: spacing.xs,
  },
  topPillsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  totalLabel: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
  },
  totalRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  totalRule: {
    backgroundColor: colors.lineStrong,
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
  },
  totalValue: {
    color: colors.goldStrong,
    fontFamily: typography.display,
    fontSize: fontSizes.xl,
  },
});
