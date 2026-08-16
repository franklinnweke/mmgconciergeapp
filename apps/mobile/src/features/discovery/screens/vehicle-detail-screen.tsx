import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, layout, radii, spacing, typography } from '@mmg/brand';
import { calculateBookingQuote, calculateChargedDays, formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
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

import {
  addDaysToDateOnly,
  formatLagosDateOnly,
  parseDateOnly,
  todayLagosDateOnly,
  vehicleEditorialClass,
} from '../data/lagos-destinations';
import { getPreviewVehicleById } from '../data/preview-discovery-gateway';
import { vehicleImages } from '../data/vehicle-images';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const durationOptions = [
  { days: 1, label: '1 Day' },
  { days: 2, label: '2 Days' },
  { days: 3, label: '3 Days' },
  { days: 7, label: '1 Week' },
] as const;

type VehicleDetailScreenProps = {
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
  endDate,
  startDate,
  vehicleId,
}: VehicleDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const vehicle = getPreviewVehicleById(vehicleId);
  const [{ durationDays, startDate: pickupDate }, setJourney] = useState(() =>
    initialJourney(startDate, endDate),
  );
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const returnDate = addDaysToDateOnly(pickupDate, durationDays);

  const quote = useMemo(() => {
    if (!vehicle) return null;
    return calculateBookingQuote(vehicle.dailyRateKobo, durationDays);
  }, [durationDays, vehicle]);

  // Build multi-image gallery array (using primary and available alternate perspectives)
  const galleryImages = useMemo(() => {
    if (!vehicle) return [];
    const images = [vehicleImages[vehicle.imageKey]];
    // If it's a Prado, include alternate Prado shots for multi-angle demonstration
    if (vehicle.imageKey === 'hero-suv') {
      images.push(vehicleImages['pearl-suv'], vehicleImages['prado-graphite']);
    } else if (vehicle.imageKey === 'pearl-suv') {
      images.push(vehicleImages['hero-suv'], vehicleImages['prado-graphite']);
    } else if (vehicle.imageKey === 'prado-graphite') {
      images.push(vehicleImages['hero-suv'], vehicleImages['pearl-suv']);
    } else {
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
              <View style={styles.availablePill}>
                <View style={styles.availableDot} />
                <Text style={styles.availableText}>IN FLEET</Text>
              </View>
            </View>
          </View>

          {/* Hero Header Copy */}
          <View style={styles.heroCopy}>
            <Text style={styles.category}>
              {vehicleEditorialClass(vehicle.displayName, vehicle.category).toLocaleUpperCase()}
            </Text>
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
            <View style={styles.inclusionBadge}>
              <Ionicons color={colors.gold} name="shield-checkmark" size={15} />
              <Text style={styles.inclusionBadgeText}>Chauffeur Included</Text>
            </View>
          </View>

          {/* Service Promises Rail */}
          <View style={styles.promiseRail}>
            <ServicePromise icon="person-outline" label="Vetted Chauffeur" />
            <View style={styles.promiseDivider} />
            <ServicePromise icon="location-outline" label="Doorstep Delivery" />
            <View style={styles.promiseDivider} />
            <ServicePromise icon="headset-outline" label="Concierge Desk" />
          </View>

          {/* Key Specifications Grid */}
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>VEHICLE SPECIFICATIONS</Text>
            <Text style={styles.sectionTitle}>Executive Amenities</Text>
            <View style={styles.specsGrid}>
              <SpecBadge icon="people-outline" label="Capacity" value={`${vehicle.seats} Passengers`} />
              <SpecBadge icon="speedometer-outline" label="Transmission" value="Automatic" />
              <SpecBadge icon="briefcase-outline" label="Luggage" value="3 Large Bags" />
              <SpecBadge icon="snow-outline" label="Climate" value="Dual A/C System" />
            </View>
          </View>

          {/* Journey Duration Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>YOUR JOURNEY DURATION</Text>
            <Text style={styles.sectionTitle}>Select Rental Period</Text>
            <View style={styles.durationRail}>
              {durationOptions.map((option) => {
                const selected = option.days === durationDays;
                return (
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={option.label}
                    onPress={() => setJourney({ durationDays: option.days, startDate: pickupDate })}
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
          </View>

          {/* Server-Aligned Quote Breakdown Card */}
          <View style={styles.quoteSection}>
            <View style={styles.quoteHeading}>
              <View>
                <Text style={styles.sectionEyebrow}>ESTIMATED QUOTE</Text>
                <Text style={styles.quoteTitle}>{durationDays}-Day Journey</Text>
              </View>
              <Ionicons color={colors.goldStrong} name="receipt-outline" size={24} />
            </View>

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
              This is a server-aligned quote estimate. Payment is completed securely before owner and chauffeur confirmation.
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
          onPress={() =>
            router.push({
              pathname: '/booking/review',
              params: { endDate: returnDate, startDate: pickupDate, vehicleId: vehicle.id },
            })
          }
          style={styles.stickyActionFlex}
        >
          <View style={styles.primaryButton}>
            <Text style={styles.primaryText}>Review Quote</Text>
            <Ionicons color={colors.black} name="arrow-forward" size={18} />
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

function ServicePromise({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.promiseItem}>
      <Ionicons color={colors.gold} name={icon} size={18} />
      <Text style={styles.promiseText}>{label}</Text>
    </View>
  );
}

function SpecBadge({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.specBadge}>
      <Ionicons color={colors.goldStrong} name={icon} size={18} />
      <View style={styles.specCopy}>
        <Text style={styles.specLabel}>{label}</Text>
        <Text style={styles.specValue}>{value}</Text>
      </View>
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
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
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
