import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radii, spacing, typography } from '@mmg/brand';
import { type Href, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { LuxuryShimmer } from '@/components/ui/luxury-shimmer';
import { useAuth } from '@/core/auth/auth-context';
import { useBookings } from '@/features/booking/booking-context';
import {
  firstNameFromDisplayName,
  selectHomeJourney,
} from '@/features/booking/domain/home-journey';

import {
  ExecutiveBookingDesk,
  type JourneyPlan,
} from '../components/executive-booking-desk';
import { FeaturedVehicleCard } from '../components/featured-vehicle-card';
import { LiveJourneyCard } from '../components/live-journey-card';
import { PickupDistrictSheet } from '../components/pickup-district-sheet';
import {
  addDaysToDateOnly,
  pickupDestinations,
  todayLagosDateOnly,
} from '../data/lagos-destinations';
import { useFeaturedVehicles } from '../hooks/use-featured-vehicles';

const carouselGap = spacing.md;

function initialJourneyPlan(): JourneyPlan {
  const startDate = todayLagosDateOnly();
  return {
    area: pickupDestinations[0].area,
    startDate,
    endDate: addDaysToDateOnly(startDate, 3),
    durationDays: 3,
    journeyLabel: 'Today',
  };
}

export default function DiscoveryHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { trips } = useBookings();
  const { error, isLoading, vehicles } = useFeaturedVehicles();
  const [area, setArea] = useState(pickupDestinations[0].area);
  const [journeyPlan, setJourneyPlan] = useState<JourneyPlan>(initialJourneyPlan);
  const [destinationsOpen, setDestinationsOpen] = useState(false);
  const liveTrip = useMemo(() => selectHomeJourney(trips), [trips]);
  const firstName = firstNameFromDisplayName(user?.displayName);
  const featuredVehicles = vehicles;
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(352, Math.max(280, windowWidth - 48));

  function openFleet(nextArea = area) {
    router.push({
      pathname: '/(renter)/browse',
      params: {
        area: nextArea,
        startDate: journeyPlan.startDate,
        endDate: journeyPlan.endDate,
        journey: journeyPlan.journeyLabel,
      },
    });
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inset}>
          <ScreenHeader
            right={(
              <View style={styles.topActions}>
                <View style={styles.cityPill}>
                  <Ionicons color={colors.muted} name="location-outline" size={14} />
                  <Text style={styles.cityText}>Lagos</Text>
                </View>
                <PressableScale
                  accessibilityLabel="Open account"
                  accessibilityRole="button"
                  onPress={() => router.push('/(renter)/account')}
                  style={styles.avatarPress}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
                  </View>
                </PressableScale>
              </View>
            )}
          />
        </View>

        {liveTrip ? (
          <View style={styles.inset}>
            <LiveJourneyCard
              onPress={() => router.push(`/trip/${liveTrip.id}` as Href)}
              trip={liveTrip}
            />
          </View>
        ) : null}

        <ExecutiveBookingDesk
          areaLabel={area}
          onExploreFleet={(plan) => {
            setJourneyPlan(plan);
            router.push({
              pathname: '/(renter)/browse',
              params: {
                area: plan.area,
                startDate: plan.startDate,
                endDate: plan.endDate,
                journey: plan.journeyLabel,
              },
            });
          }}
          onPlanChange={setJourneyPlan}
          onPressArea={() => setDestinationsOpen(true)}
        />

        <PickupDistrictSheet
          onClose={() => setDestinationsOpen(false)}
          onSelectArea={(selectedArea) => setArea(selectedArea)}
          selectedArea={area}
          visible={destinationsOpen}
        />

        <View style={[styles.inventoryHeading, styles.inset]}>
          <View>
            <Text accessibilityRole="header" style={styles.inventoryTitle}>Cars in Lagos</Text>
            <Text style={styles.inventorySubtitle}>Chauffeur and delivery included.</Text>
          </View>
          <PressableScale accessibilityRole="button" onPress={() => openFleet()}>
            <Text style={styles.viewAll}>View all</Text>
          </PressableScale>
        </View>

        {error ? (
          <View style={[styles.errorBox, styles.inset]}>
            <Ionicons color={colors.danger} name="alert-circle" size={18} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : isLoading ? (
          <ScrollView
            contentContainerStyle={styles.carousel}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.horizontalClip}
          >
            <LuxuryShimmer height={290} width={cardWidth} />
            <LuxuryShimmer height={290} width={cardWidth} />
          </ScrollView>
        ) : featuredVehicles.length === 0 ? (
          <View style={[styles.emptyFeaturedBox, styles.inset]}>
            <Ionicons color={colors.muted} name="car-outline" size={26} />
            <Text style={styles.emptyFeaturedTitle}>No cars available right now</Text>
            <Text style={styles.emptyFeaturedSubtitle}>Try another date or check again soon.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.carousel}
            decelerationRate="fast"
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToAlignment="start"
            snapToInterval={cardWidth + carouselGap}
            style={styles.horizontalClip}
          >
            {featuredVehicles.map((vehicle) => (
              <FeaturedVehicleCard
                key={vehicle.id}
                onPress={() => router.push({
                  pathname: '/vehicle/[vehicleId]',
                  params: {
                    startDate: journeyPlan.startDate,
                    endDate: journeyPlan.endDate,
                    vehicleId: vehicle.id,
                  },
                })}
                vehicle={vehicle}
                width={cardWidth}
              />
            ))}
          </ScrollView>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.ivory,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avatarPress: { flexShrink: 0, height: 40, width: 40 },
  avatarText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: fontSizes.base },
  carousel: { gap: carouselGap, paddingHorizontal: spacing.md },
  cityPill: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
    minHeight: 40,
    paddingHorizontal: 4,
  },
  cityText: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: fontSizes.xs },
  content: { gap: spacing.md, paddingBottom: 116 },
  emptyFeaturedBox: {
    borderColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  emptyFeaturedSubtitle: { color: colors.muted, fontFamily: typography.body, fontSize: fontSizes.xs },
  emptyFeaturedTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.sm, marginTop: spacing.xs },
  errorBox: {
    alignItems: 'center',
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  errorText: { color: colors.danger, flex: 1, fontFamily: typography.bodyMedium, fontSize: fontSizes.sm },
  horizontalClip: { alignSelf: 'stretch', overflow: 'visible', width: '100%' },
  inset: { marginHorizontal: spacing.md },
  inventoryHeading: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  inventorySubtitle: { color: colors.muted, fontFamily: typography.body, fontSize: fontSizes.xs, marginTop: 3 },
  inventoryTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.lg },
  screen: { backgroundColor: colors.black, flex: 1, maxWidth: '100%', overflow: 'hidden', width: '100%' },
  topActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  viewAll: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: fontSizes.sm, paddingVertical: spacing.xs },
});
