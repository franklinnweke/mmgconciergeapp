import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, layout, radii, spacing, typography } from '@mmg/brand';
import { type VehicleSummary } from '@mmg/contracts';
import { calculateBookingQuote, formatNairaFromKobo } from '@mmg/domain';
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
import { ScreenHeader } from '@/components/screen-header';
import { safeProviderError } from '@/core/errors/safe-provider-error';

import {
  formatLagosDateOnly,
} from '../data/lagos-destinations';
import { currentAvailability, resolveRentalJourney, type Availability } from '../data/rental-journey';
import { createDiscoveryGateway } from '../data/firestore-discovery-gateway';
import { resolveVehicleImageSource, vehicleImages } from '../data/vehicle-images';
import {
  createVehicleCalendarGateway,
  type VehicleCalendarGateway,
} from '../data/vehicle-calendar-gateway';
import { vehicleCalendarErrorMessage } from '../data/vehicle-calendar-gateway-core';
import {
  parsePickupLocation,
  serializePickupLocation,
} from '../domain/pickup-location';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type VehicleDetailScreenProps = {
  calendarGateway?: VehicleCalendarGateway;
  endDate?: string;
  pickup?: string;
  startDate?: string;
  vehicleId: string;
};

export default function VehicleDetailScreen({
  calendarGateway: injectedCalendarGateway,
  endDate: propEndDate,
  pickup,
  startDate: propStartDate,
  vehicleId,
}: VehicleDetailScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const gateway = useMemo(() => createDiscoveryGateway(), []);
  const calendarGateway = useMemo(
    () => injectedCalendarGateway ?? createVehicleCalendarGateway(),
    [injectedCalendarGateway],
  );
  const journey = useMemo(() => resolveRentalJourney(propStartDate, propEndDate), [propEndDate, propStartDate]);
  const pickupLocation = useMemo(() => parsePickupLocation(pickup), [pickup]);

  const [vehicle, setVehicle] = useState<VehicleSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(vehicleId));
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [availabilityReloadKey, setAvailabilityReloadKey] = useState(0);
  const availabilityKey = JSON.stringify([vehicleId, journey.startDate, journey.endDate, availabilityReloadKey]);
  const [availabilityResult, setAvailabilityResult] = useState<{
    key: string; gateway: VehicleCalendarGateway; value: Availability;
  } | null>(null);
  const availability = currentAvailability(
    availabilityResult?.gateway === calendarGateway ? availabilityResult : null,
    availabilityKey,
  );

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
        setFetchError(safeProviderError(error, 'Unable to load this vehicle. Please try again.'));
      });
    return () => { active = false; };
  }, [gateway, reloadKey, vehicleId]);

  useEffect(() => {
    if (!vehicleId) return;
    let active = true;
    calendarGateway.getCalendar({
      vehicleId,
      windowStartDate: journey.startDate,
      windowEndDate: journey.endDate,
    }).then((result) => {
      if (!active) return;
      const fullyAvailable = result.days.length === journey.durationDays
        && result.days.every((day) => day.available);
      setAvailabilityResult({ key: availabilityKey, gateway: calendarGateway, value: { error: null, status: fullyAvailable ? 'available' : 'unavailable' } });
    }).catch((error: unknown) => {
      if (!active) return;
      setAvailabilityResult({ key: availabilityKey, gateway: calendarGateway, value: { error: vehicleCalendarErrorMessage(error), status: 'error' } });
    });
    return () => { active = false; };
  }, [availabilityKey, calendarGateway, journey.durationDays, journey.endDate, journey.startDate, vehicleId]);

  const quote = useMemo(
    () => vehicle ? calculateBookingQuote(vehicle.dailyRateKobo, journey.durationDays) : null,
    [journey.durationDays, vehicle],
  );

  const galleryImages = useMemo(() => {
    if (!vehicle) return [];
    if (vehicle.imageUrls?.length) return vehicle.imageUrls.map((uri: string) => ({ uri }));
    if (vehicle.imageUrl) return [{ uri: vehicle.imageUrl }];
    const primary = resolveVehicleImageSource(vehicle);
    const images = [primary];
    if (vehicle.imageKey === 'hero-suv') images.push(vehicleImages['pearl-suv'], vehicleImages['prado-graphite']);
    if (vehicle.imageKey === 'pearl-suv') images.push(vehicleImages['hero-suv'], vehicleImages['prado-graphite']);
    if (vehicle.imageKey === 'prado-graphite') images.push(vehicleImages['hero-suv'], vehicleImages['pearl-suv']);
    return images;
  }, [vehicle]);

  const handleGalleryScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (nextIndex >= 0 && nextIndex < galleryImages.length) setActiveImageIndex(nextIndex);
  };

  const stateHeader = (
    <ScreenHeader backAccessibilityLabel="Go back" onBack={() => router.back()} title="Vehicle" />
  );

  if (loading) {
    return (
      <View style={[styles.stateScreen, { paddingTop: insets.top + spacing.sm }]}>
        {stateHeader}
        <View style={styles.stateCenter}>
          <ActivityIndicator color={colors.goldStrong} size="large" />
          <Text style={styles.stateText}>Loading vehicle…</Text>
        </View>
      </View>
    );
  }

  if (fetchError || !vehicle || !quote) {
    return (
      <View style={[styles.stateScreen, { paddingTop: insets.top + spacing.sm }]}>
        {stateHeader}
        <View style={styles.stateCenter}>
          <Ionicons color={fetchError ? colors.danger : colors.muted} name={fetchError ? 'cloud-offline-outline' : 'car-outline'} size={34} />
          <Text style={styles.stateTitle}>{fetchError ? 'Could not load vehicle' : 'Vehicle unavailable'}</Text>
          <Text style={styles.stateText}>{fetchError ?? 'Choose another car from the fleet.'}</Text>
          <PressableScale accessibilityRole="button" haptic onPress={fetchError ? retryFetch : () => router.back()}>
            <View style={styles.stateButton}>
              <Text style={styles.stateButtonText}>{fetchError ? 'Try again' : 'Back to cars'}</Text>
            </View>
          </PressableScale>
        </View>
      </View>
    );
  }

  const galleryCounter = galleryImages.length > 1 ? (
    <View style={styles.counterPill}>
      <Text style={styles.counterText}>{activeImageIndex + 1} / {galleryImages.length}</Text>
    </View>
  ) : null;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 112 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <FlatList
            data={galleryImages}
            horizontal
            keyExtractor={(_, index) => `vehicle-image-${index}`}
            onScroll={handleGalleryScroll}
            pagingEnabled
            renderItem={({ item }) => (
              <View style={styles.gallerySlide}>
                <Image contentFit="cover" source={item} style={StyleSheet.absoluteFill} transition={160} />
              </View>
            )}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
          />
          <LinearGradient colors={['rgba(4,4,4,0.36)', 'transparent']} locations={[0, 0.55]} style={StyleSheet.absoluteFill} />
          <ScreenHeader
            backAccessibilityLabel="Go back"
            onBack={() => router.back()}
            right={galleryCounter}
            style={[styles.heroHeader, { paddingTop: insets.top + spacing.sm }]}
          />
        </View>

        <View style={styles.body}>
          <View style={styles.identityBlock}>
            <Text style={styles.vehicleName}>{vehicle.displayName}</Text>
            <Text style={styles.vehicleMeta}>{vehicle.areaLabel} · {vehicle.seats} passengers</Text>
            <View style={styles.rateLine}>
              <Text style={styles.rate}>{formatNairaFromKobo(vehicle.dailyRateKobo)}</Text>
              <Text style={styles.rateUnit}> / day</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your dates</Text>
            <View style={styles.journeyRow}>
              <View style={styles.journeyPoint}>
                <Text style={styles.rowLabel}>Pickup</Text>
                <Text style={styles.rowValue}>{formatLagosDateOnly(journey.startDate)}</Text>
              </View>
              <Ionicons color={colors.muted} name="arrow-forward" size={16} />
              <View style={[styles.journeyPoint, styles.journeyPointEnd]}>
                <Text style={styles.rowLabel}>Return</Text>
                <Text style={styles.rowValue}>{formatLagosDateOnly(journey.endDate)}</Text>
              </View>
            </View>

            <View accessibilityLiveRegion="polite" style={styles.availabilityRow}>
              {availability.status === 'loading' ? (
                <ActivityIndicator color={colors.goldStrong} size="small" />
              ) : (
                <Ionicons
                  color={availability.status === 'available' ? colors.success : colors.danger}
                  name={availability.status === 'available' ? 'checkmark-circle' : 'alert-circle'}
                  size={18}
                />
              )}
              <View style={styles.availabilityCopy}>
                <Text style={styles.availabilityTitle}>
                  {availability.status === 'loading'
                    ? 'Checking availability'
                    : availability.status === 'available'
                      ? 'Available for these dates'
                      : availability.status === 'unavailable'
                        ? 'Not available for these dates'
                        : 'Availability check failed'}
                </Text>
                <Text style={styles.availabilityBody}>
                  {availability.status === 'available'
                    ? 'Sending a request does not lock these dates or take payment.'
                    : availability.status === 'unavailable'
                      ? 'Go back and choose different dates.'
                      : availability.status === 'error'
                        ? vehicleCalendarErrorMessage(availability.error)
                        : 'No dates are reserved yet.'}
                </Text>
              </View>
              {availability.status === 'error' ? (
                <PressableScale accessibilityLabel="Retry availability" accessibilityRole="button" onPress={() => setAvailabilityReloadKey((key) => key + 1)}>
                  <Ionicons color={colors.goldStrong} name="refresh" size={20} />
                </PressableScale>
              ) : null}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Estimated total</Text>
            <QuoteRow label={`${formatNairaFromKobo(vehicle.dailyRateKobo)} × ${journey.durationDays} ${journey.durationDays === 1 ? 'day' : 'days'}`} value={formatNairaFromKobo(quote.rentalKobo)} />
            <QuoteRow label="Service and protection" value={formatNairaFromKobo(quote.serviceFeeKobo)} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatNairaFromKobo(quote.totalKobo)}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View>
          <Text style={styles.stickyLabel}>Estimated total</Text>
          <Text style={styles.stickyValue}>{formatNairaFromKobo(quote.totalKobo)}</Text>
        </View>
        <PressableScale
          accessibilityRole="button"
          disabled={availability.status !== 'available'}
          haptic
          onPress={() => router.push({
            pathname: '/booking/review',
            params: {
              endDate: journey.endDate, startDate: journey.startDate,
              ...(pickupLocation ? { pickup: serializePickupLocation(pickupLocation) } : {}),
              vehicleId: vehicle.id,
            },
          })}
          style={[styles.actionFlex, availability.status !== 'available' && styles.disabled]}
        >
          <View style={styles.primaryButton}>
            <Text style={styles.primaryText}>{availability.status === 'available' ? 'Request this car' : 'Check dates'}</Text>
          </View>
        </PressableScale>
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
  actionFlex: { flex: 1, maxWidth: 190 },
  availabilityBody: { color: colors.muted, fontFamily: typography.body, fontSize: fontSizes.xs, lineHeight: 17, marginTop: 2 },
  availabilityCopy: { flex: 1 },
  availabilityRow: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, minHeight: 62, paddingTop: spacing.sm },
  availabilityTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.sm },
  body: { gap: spacing.xl, paddingHorizontal: layout.screenGutter, paddingTop: spacing.lg },
  content: { backgroundColor: colors.black },
  counterPill: { backgroundColor: 'rgba(4,4,4,0.68)', borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 7 },
  counterText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.xs },
  disabled: { opacity: 0.45 },
  gallerySlide: { height: 310, width: SCREEN_WIDTH },
  hero: { height: 310 },
  heroHeader: { left: layout.screenGutter, position: 'absolute', right: layout.screenGutter, top: 0 },
  identityBlock: { gap: 4 },
  journeyPoint: { flex: 1, gap: 4 },
  journeyPointEnd: { alignItems: 'flex-end' },
  journeyRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', minHeight: layout.primaryButtonHeight, paddingHorizontal: spacing.lg },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: fontSizes.sm },
  quoteLabel: { color: colors.muted, flex: 1, fontFamily: typography.body, fontSize: fontSizes.sm },
  quoteRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', paddingVertical: 5 },
  quoteValue: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: fontSizes.sm, textAlign: 'right' },
  rate: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 24 },
  rateLine: { alignItems: 'baseline', flexDirection: 'row', marginTop: spacing.xs },
  rateUnit: { color: colors.muted, fontFamily: typography.body, fontSize: fontSizes.sm },
  rowLabel: { color: colors.muted, fontFamily: typography.body, fontSize: fontSizes.xs },
  rowValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.sm },
  screen: { backgroundColor: colors.black, flex: 1 },
  section: { gap: spacing.xs },
  sectionTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.lg, marginBottom: spacing.xs },
  stateButton: { alignItems: 'center', backgroundColor: colors.ivory, borderRadius: radii.pill, justifyContent: 'center', minHeight: 46, paddingHorizontal: spacing.lg },
  stateButtonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: fontSizes.sm },
  stateCenter: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', paddingHorizontal: spacing.xl },
  stateScreen: { backgroundColor: colors.black, flex: 1, paddingHorizontal: layout.screenGutter },
  stateText: { color: colors.muted, fontFamily: typography.body, fontSize: fontSizes.sm, lineHeight: 20, textAlign: 'center' },
  stateTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.lg },
  stickyBar: { alignItems: 'center', backgroundColor: 'rgba(10,10,10,0.98)', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', left: 0, paddingHorizontal: layout.screenGutter, paddingTop: spacing.sm, position: 'absolute', right: 0 },
  stickyLabel: { color: colors.muted, fontFamily: typography.body, fontSize: fontSizes.xs },
  stickyValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.base, marginTop: 2 },
  totalLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.base },
  totalRow: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.md },
  totalValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.lg },
  vehicleMeta: { color: colors.muted, fontFamily: typography.body, fontSize: fontSizes.sm },
  vehicleName: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 26, letterSpacing: -0.5 },
});