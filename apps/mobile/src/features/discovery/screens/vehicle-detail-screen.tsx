import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { type VehicleSummary } from '@mmg/contracts';
import { calculateBookingQuote, calculateChargedDays, formatNairaFromKobo } from '@mmg/domain';
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { InlineNotice, PrimaryAction, SectionHeading } from '@/components/ui/mobile-primitives';
import { safeProviderError } from '@/core/errors/safe-provider-error';

import { createDiscoveryGateway } from '../data/firestore-discovery-gateway';
import {
  addDaysToDateOnly,
  formatLagosDateOnly,
  parseDateOnly,
  todayLagosDateOnly,
} from '../data/lagos-destinations';
import {
  normalizeVehicleImageUrl,
  resolveVehicleImageSource,
  vehicleImages,
} from '../data/vehicle-images';
import {
  createVehicleCalendarGateway,
  type VehicleCalendarGateway,
} from '../data/vehicle-calendar-gateway';
import { vehicleCalendarErrorMessage } from '../data/vehicle-calendar-gateway-core';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const durationOptions = [
  { days: 1, label: '1 day' },
  { days: 2, label: '2 days' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
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
      durationDays: durationOptions.some((option) => option.days === durationDays) ? durationDays : 1,
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
  const gateway = useMemo(() => createDiscoveryGateway(), []);
  const calendarGateway = useMemo(
    () => injectedCalendarGateway ?? createVehicleCalendarGateway(),
    [injectedCalendarGateway],
  );

  const [{ durationDays, startDate: pickupDate }, setJourney] = useState(() =>
    initialJourney(propStartDate, propEndDate),
  );
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [availabilityReloadKey, setAvailabilityReloadKey] = useState(0);
  const [availability, setAvailability] = useState<{
    error: string | null;
    status: 'loading' | 'available' | 'unavailable' | 'error';
  }>({ error: null, status: 'loading' });

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
        setLoading(false);
        setFetchError(null);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setVehicle(null);
        setLoading(false);
        setFetchError(safeProviderError(err, 'Unable to connect to fleet services. Please try again.'));
      });
    return () => {
      isMounted = false;
    };
  }, [gateway, reloadKey, vehicleId]);

  const returnDate = useMemo(
    () => addDaysToDateOnly(pickupDate, durationDays),
    [durationDays, pickupDate],
  );

  useEffect(() => {
    if (!vehicleId) return;
    let isMounted = true;
    calendarGateway
      .getCalendar({
        vehicleId,
        windowStartDate: pickupDate,
        windowEndDate: returnDate,
      })
      .then((result) => {
        if (!isMounted) return;
        const fullyAvailable =
          result.days.length === durationDays && result.days.every((day) => day.available);
        setAvailability({ error: null, status: fullyAvailable ? 'available' : 'unavailable' });
      })
      .catch((caught: unknown) => {
        if (!isMounted) return;
        setAvailability({ error: vehicleCalendarErrorMessage(caught), status: 'error' });
      });
    return () => {
      isMounted = false;
    };
  }, [availabilityReloadKey, calendarGateway, durationDays, pickupDate, returnDate, vehicleId]);

  const quote = useMemo(
    () => (vehicle ? calculateBookingQuote(vehicle.dailyRateKobo, durationDays) : null),
    [durationDays, vehicle],
  );

  const galleryImages = useMemo<ImageSource[]>(() => {
    if (!vehicle) return [];
    if (vehicle.imageUrls?.length) {
      return vehicle.imageUrls.map((url) => ({ uri: normalizeVehicleImageUrl(url) }));
    }
    if (vehicle.imageUrl) return [{ uri: normalizeVehicleImageUrl(vehicle.imageUrl) }];

    const primary = resolveVehicleImageSource(vehicle);
    const images: ImageSource[] = [primary];
    if (vehicle.imageKey === 'hero-suv') {
      images.push(vehicleImages['pearl-suv'], vehicleImages['prado-graphite']);
    } else if (vehicle.imageKey === 'pearl-suv') {
      images.push(vehicleImages['hero-suv'], vehicleImages['prado-graphite']);
    } else if (vehicle.imageKey === 'prado-graphite') {
      images.push(vehicleImages['hero-suv'], vehicleImages['pearl-suv']);
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
      <View style={styles.centered}>
        <ActivityIndicator color={colors.goldStrong} size="small" />
        <Text style={styles.centeredText}>Loading vehicle</Text>
      </View>
    );
  }

  if (fetchError || !vehicle || !quote) {
    return (
      <View style={[styles.fallback, { paddingTop: insets.top + spacing.sm }]}>
        <PressableScale accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.back()}>
          <View style={styles.fallbackBack}><Ionicons color={colors.ivory} name="arrow-back" size={22} /></View>
        </PressableScale>
        <View style={styles.fallbackCopy}>
          <Ionicons color={fetchError ? colors.danger : colors.goldStrong} name={fetchError ? 'cloud-offline-outline' : 'car-outline'} size={30} />
          <Text style={styles.fallbackTitle}>{fetchError ? 'Could not load this vehicle' : 'Vehicle unavailable'}</Text>
          <Text style={styles.fallbackText}>{fetchError ?? 'Return to the fleet to choose another vehicle.'}</Text>
          {fetchError ? <View style={styles.fallbackAction}><PrimaryAction icon="refresh" label="Try again" onPress={retryFetch} /></View> : null}
        </View>
      </View>
    );
  }

  const detailRows = [
    { label: 'Passengers', value: String(vehicle.seats) },
    vehicle.year ? { label: 'Year', value: String(vehicle.year) } : null,
    vehicle.make && vehicle.model ? { label: 'Vehicle', value: `${vehicle.make} ${vehicle.model}` } : null,
    { label: 'Service', value: 'Chauffeur and Lagos delivery included' },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 116 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <FlatList
            data={galleryImages}
            horizontal
            keyExtractor={(_, index) => `vehicle-image-${index}`}
            onScroll={handleScroll}
            pagingEnabled
            renderItem={({ item }) => (
              <View style={styles.gallerySlide}>
                <Image contentFit="cover" source={item} style={StyleSheet.absoluteFill} transition={180} />
              </View>
            )}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(4,4,4,.48)', 'transparent', colors.black]}
            locations={[0, 0.46, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroTop, { paddingTop: insets.top + spacing.sm }]}>
            <PressableScale accessibilityLabel="Back to fleet" accessibilityRole="button" onPress={() => router.back()}>
              <View style={styles.heroButton}><Ionicons color={colors.ivory} name="arrow-back" size={22} /></View>
            </PressableScale>
            {galleryImages.length > 1 ? (
              <Text style={styles.imageCounter}>{activeImageIndex + 1} / {galleryImages.length}</Text>
            ) : <View />}
          </View>
          <View style={styles.heroCopy}>
            <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{vehicle.displayName}</Text>
            <Text style={styles.heroMeta}>
              {vehicle.areaLabel} · {vehicle.distanceKm.toFixed(1)} km · {vehicle.seats} seats
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.priceLead}>
            <Text style={styles.rate}>{formatNairaFromKobo(vehicle.dailyRateKobo)}</Text>
            <Text style={styles.rateContext}>per rental day</Text>
          </View>

          <View style={styles.section}>
            <SectionHeading>Details</SectionHeading>
            <View style={styles.detailList}>
              {detailRows.map((row) => <DetailRow key={row.label} {...row} />)}
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeading>Dates</SectionHeading>
            <ScrollView
              contentContainerStyle={styles.durationRail}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
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
                  >
                    <View style={[styles.durationButton, selected && styles.durationButtonSelected]}>
                      <Text style={[styles.durationText, selected && styles.durationTextSelected]}>{option.label}</Text>
                    </View>
                  </PressableScale>
                );
              })}
            </ScrollView>

            <View style={styles.dateRow}>
              <View style={styles.dateColumn}>
                <Text style={styles.dateLabel}>Pickup</Text>
                <Text style={styles.dateValue}>{formatLagosDateOnly(pickupDate)}</Text>
              </View>
              <Ionicons color={colors.muted} name="arrow-forward" size={17} />
              <View style={[styles.dateColumn, styles.dateColumnEnd]}>
                <Text style={styles.dateLabel}>Return</Text>
                <Text style={styles.dateValue}>{formatLagosDateOnly(returnDate)}</Text>
              </View>
            </View>

            <AvailabilityNotice
              availability={availability}
              onRetry={() => {
                setAvailability({ error: null, status: 'loading' });
                setAvailabilityReloadKey((key) => key + 1);
              }}
            />
          </View>

          <View style={styles.section}>
            <SectionHeading>Estimate</SectionHeading>
            <QuoteRow
              label={`${formatNairaFromKobo(vehicle.dailyRateKobo)} × ${durationDays} ${durationDays === 1 ? 'day' : 'days'}`}
              value={formatNairaFromKobo(quote.rentalKobo)}
            />
            <QuoteRow label="Service and protection" value={formatNairaFromKobo(quote.serviceFeeKobo)} />
            <QuoteRow label="Chauffeur and Lagos delivery" value="Included" />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Estimated total</Text>
              <Text style={styles.totalValue}>{formatNairaFromKobo(quote.totalKobo)}</Text>
            </View>
            <Text style={styles.quoteNote}>The next screen verifies the price and creates a short date hold. No payment is taken yet.</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <View style={styles.stickyPrice}>
          <Text style={styles.stickyTotal}>{formatNairaFromKobo(quote.totalKobo)}</Text>
          <Text style={styles.stickyContext}>estimated total</Text>
        </View>
        <View style={styles.stickyAction}>
          <PrimaryAction
            disabled={availability.status !== 'available'}
            icon="arrow-forward"
            label={availability.status === 'loading' ? 'Checking dates' : availability.status === 'available' ? 'Review' : 'Change dates'}
            onPress={() =>
              router.push({
                pathname: '/booking/review',
                params: { endDate: returnDate, startDate: pickupDate, vehicleId: vehicle.id },
              })
            }
          />
        </View>
      </View>
    </View>
  );
}

function AvailabilityNotice({
  availability,
  onRetry,
}: {
  availability: { error: string | null; status: 'loading' | 'available' | 'unavailable' | 'error' };
  onRetry: () => void;
}) {
  if (availability.status === 'loading') {
    return (
      <View style={styles.availabilityLoading} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.goldStrong} size="small" />
        <Text style={styles.availabilityText}>Checking availability</Text>
      </View>
    );
  }
  if (availability.status === 'available') {
    return <InlineNotice icon="checkmark-circle-outline" tone="success">These dates are currently available. A hold is only created on the next step.</InlineNotice>;
  }
  if (availability.status === 'unavailable') {
    return <InlineNotice icon="calendar-outline" tone="danger">These dates are not available. Choose another duration or return to search.</InlineNotice>;
  }
  return (
    <View>
      <InlineNotice icon="cloud-offline-outline" tone="danger">{vehicleCalendarErrorMessage(availability.error)}</InlineNotice>
      <PressableScale accessibilityRole="button" onPress={onRetry} style={styles.retryAvailability}>
        <Text style={styles.retryAvailabilityText}>Try availability again</Text>
      </PressableScale>
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
  availabilityLoading: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
  },
  availabilityText: {
    color: colors.silver,
    fontFamily: typography.body,
    fontSize: 13,
  },
  body: {
    paddingHorizontal: spacing.md,
  },
  centered: {
    alignItems: 'center',
    backgroundColor: colors.black,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  centeredText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
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
    fontSize: 13,
    marginTop: 3,
  },
  detailLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  detailList: {
    marginTop: spacing.sm,
  },
  detailRow: {
    alignItems: 'baseline',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  detailValue: {
    color: colors.silver,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    textAlign: 'right',
  },
  durationButton: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 78,
    paddingHorizontal: spacing.md,
  },
  durationButtonSelected: {
    backgroundColor: colors.ivory,
    borderColor: colors.ivory,
  },
  durationRail: {
    gap: spacing.xs,
    paddingRight: spacing.md,
    paddingTop: spacing.md,
  },
  durationText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  durationTextSelected: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
  },
  fallback: {
    backgroundColor: colors.black,
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  fallbackAction: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  fallbackBack: {
    alignItems: 'flex-start',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  fallbackCopy: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  fallbackText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  fallbackTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 27,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  gallerySlide: {
    height: '100%',
    width: SCREEN_WIDTH,
  },
  hero: {
    height: 450,
  },
  heroButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,4,4,.42)',
    borderRadius: radii.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  heroCopy: {
    bottom: spacing.xl,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  heroMeta: {
    color: colors.silver,
    fontFamily: typography.body,
    fontSize: 13,
    marginTop: 6,
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
    top: 0,
  },
  imageCounter: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  priceLead: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  quoteLabel: {
    color: colors.muted,
    flex: 1,
    fontFamily: typography.body,
    fontSize: 13,
  },
  quoteNote: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  quoteRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  quoteValue: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  rate: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 27,
  },
  rateContext: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  retryAvailability: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  retryAvailabilityText: {
    color: colors.goldStrong,
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
  stickyAction: {
    flex: 1,
  },
  stickyBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,4,4,.98)',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.md,
    left: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    position: 'absolute',
    right: 0,
  },
  stickyContext: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 10,
    marginTop: 1,
  },
  stickyPrice: {
    minWidth: 112,
  },
  stickyTotal: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 15,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 34,
    letterSpacing: -0.65,
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
});
