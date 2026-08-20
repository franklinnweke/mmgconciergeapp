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

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { LuxuryShimmer } from '@/components/ui/luxury-shimmer';
import { RadarPulseDot } from '@/components/ui/radar-pulse-dot';
import { useAuth } from '@/core/auth/auth-context';
import { useBookings } from '@/features/booking/booking-context';
import {
  firstNameFromDisplayName,
  selectHomeJourney,
} from '@/features/booking/domain/home-journey';

import { ExecutiveBookingDesk } from '../components/executive-booking-desk';
import { FeaturedVehicleCard } from '../components/featured-vehicle-card';
import { LiveJourneyCard } from '../components/live-journey-card';
import { PickupDistrictSheet } from '../components/pickup-district-sheet';
import {
  journeyDates,
  journeyOptions,
  pickupDestinations,
} from '../data/lagos-destinations';
import { useFeaturedVehicles } from '../hooks/use-featured-vehicles';

const carouselGap = spacing.md;

export default function DiscoveryHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { trips } = useBookings();
  const { error, isLoading, vehicles } = useFeaturedVehicles();
  const [area, setArea] = useState(pickupDestinations[0].area);
  const journey = journeyOptions[1];
  const [destinationsOpen, setDestinationsOpen] = useState(false);
  const liveTrip = useMemo(() => selectHomeJourney(trips), [trips]);
  const firstName = firstNameFromDisplayName(user?.displayName);
  const featuredVehicles = vehicles;
  const { width: windowWidth } = useWindowDimensions();
  const compactHeader = windowWidth < 360;
  const cardWidth = Math.min(328, Math.max(260, windowWidth - 56));
  const selectedJourneyDates = journeyDates(journey);

  function openFleet(nextArea = area) {
    router.push({
      pathname: '/(renter)/browse',
      params: {
        area: nextArea,
        journey: journey.label,
      },
    });
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={styles.topRow}>
            <BrandWordmark compact withLogo={!compactHeader} />
            <View style={styles.topActions}>
              <View style={styles.cityPill}>
                <RadarPulseDot color={colors.goldStrong} glowColor="rgba(227,195,101,0.35)" size={6} />
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
          </View>
        </View>

        {liveTrip ? (
          <LiveJourneyCard
            onPress={() => router.push(`/trip/${liveTrip.id}` as Href)}
            trip={liveTrip}
          />
        ) : null}

        <ExecutiveBookingDesk
          areaLabel={area}
          onExploreFleet={(plan) => {
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
          onPressArea={() => setDestinationsOpen(true)}
        />

        <PickupDistrictSheet
          onClose={() => setDestinationsOpen(false)}
          onSelectArea={(selectedArea) => setArea(selectedArea)}
          selectedArea={area}
          visible={destinationsOpen}
        />

        <View style={styles.inventoryHeading}>
          <Text accessibilityRole="header" style={styles.inventoryTitle}>Available in Lagos</Text>
          <PressableScale accessibilityRole="button" onPress={() => openFleet()}>
            <Text style={styles.viewAll}>View all</Text>
          </PressableScale>
        </View>

        {error ? (
          <View style={styles.errorBox}>
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
            <LuxuryShimmer height={310} width={cardWidth} />
            <LuxuryShimmer height={310} width={cardWidth} />
          </ScrollView>
        ) : featuredVehicles.length === 0 ? (
          <View style={styles.emptyFeaturedBox}>
            <Ionicons color={colors.goldStrong} name="car-outline" size={28} />
            <Text style={styles.emptyFeaturedTitle}>No available listings in this category</Text>
            <Text style={styles.emptyFeaturedSubtitle}>Check back soon or explore other vehicle categories.</Text>
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
                onPress={() =>
                  router.push({
                    pathname: '/vehicle/[vehicleId]',
                    params: {
                      ...selectedJourneyDates,
                      vehicleId: vehicle.id,
                    },
                  })
                }
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
  inventoryHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  inventoryTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.lg },
  viewAll: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: fontSizes.sm },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  avatarPress: {
    flexShrink: 0,
    height: 44,
    width: 44,
  },
  avatarText: {
    color: colors.black,
    fontFamily: typography.display,
    fontSize: fontSizes.lg,
  },
  carousel: {
    gap: carouselGap,
    paddingRight: spacing.lg,
  },
  cityPill: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  cityText: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: 120,
    paddingHorizontal: spacing.lg,
  },
  horizontalClip: {
    alignSelf: 'stretch',
    overflow: 'hidden',
    width: '100%',
  },
  screen: { backgroundColor: colors.black, flex: 1, maxWidth: '100%', overflow: 'hidden', width: '100%' },
  topActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  topBar: { gap: spacing.xs },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  emptyFeaturedBox: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  emptyFeaturedTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
    marginTop: spacing.xs,
  },
  emptyFeaturedSubtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
  },
  errorBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(209,133,120,0.12)',
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
});
