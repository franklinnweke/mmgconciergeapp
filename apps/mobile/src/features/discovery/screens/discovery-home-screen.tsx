import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radii, spacing, typography } from '@mmg/brand';
import { type VehicleCategory } from '@mmg/contracts';
import { type Href, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { BookingControl } from '@/components/ui/booking-control';
import { LuxuryCard } from '@/components/ui/luxury-card';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuth } from '@/core/auth/auth-context';
import { useBookings } from '@/features/booking/booking-context';
import {
  firstNameFromDisplayName,
  formatLagosClock,
  greetingForLagos,
  selectHomeJourney,
} from '@/features/booking/domain/home-journey';

import { FeaturedVehicleCard } from '../components/featured-vehicle-card';
import { LiveJourneyCard } from '../components/live-journey-card';
import {
  fleetCategories,
  formatLagosDateOnly,
  journeyDates,
  journeyOptions,
  pickupDestinations,
  type JourneyOption,
} from '../data/lagos-destinations';
import { useFeaturedVehicles } from '../hooks/use-featured-vehicles';

const carouselGap = spacing.md;

export default function DiscoveryHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { trips } = useBookings();
  const { isLoading, vehicles } = useFeaturedVehicles();
  const [area, setArea] = useState(pickupDestinations[0].area);
  const [journey, setJourney] = useState<JourneyOption>(journeyOptions[1]);
  const [category, setCategory] = useState<VehicleCategory | undefined>();
  const [destinationsOpen, setDestinationsOpen] = useState(false);
  const liveTrip = useMemo(() => selectHomeJourney(trips), [trips]);
  const firstName = firstNameFromDisplayName(user?.displayName);
  const featuredVehicles = useMemo(
    () => (category ? vehicles.filter((vehicle) => vehicle.category === category) : vehicles),
    [category, vehicles],
  );
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(328, Math.max(260, windowWidth - 56));
  const selectedJourneyDates = journeyDates(journey);

  function openFleet(nextArea = area, nextCategory = category) {
    router.push({
      pathname: '/(renter)/browse',
      params: {
        area: nextArea,
        journey: journey.label,
        ...(nextCategory ? { category: nextCategory } : {}),
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
            <BrandWordmark compact withLogo />
            <View style={styles.topActions}>
              <View style={styles.cityPill}>
                <View style={styles.liveDot} />
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
          <View style={styles.greetingBlock}>
            <Text style={styles.kicker}>{formatLagosClock()}</Text>
            <Text accessibilityRole="header" style={styles.greeting}>
              {greetingForLagos()}, {firstName}
            </Text>
          </View>
        </View>

        {liveTrip ? (
          <LiveJourneyCard
            onPress={() => router.push(`/trip/${liveTrip.id}` as Href)}
            trip={liveTrip}
          />
        ) : null}

        <BookingControl
          areaLabel={area}
          journeyOptions={journeyOptions}
          onFind={() => openFleet()}
          onPressArea={() => setDestinationsOpen((open) => !open)}
          onSelectJourney={(label) => setJourney(journeyOptions.find((option) => option.label === label) ?? journey)}
          pickupLabel={formatLagosDateOnly(selectedJourneyDates.startDate)}
          returnLabel={formatLagosDateOnly(selectedJourneyDates.endDate)}
          selectedJourney={journey.label}
        />

        {destinationsOpen ? (
          <ScrollView
            contentContainerStyle={styles.destinationRail}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.horizontalClip}
          >
            {pickupDestinations.map((destination) => {
              const selected = destination.area === area;
              return (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={destination.area}
                  onPress={() => {
                    setArea(destination.area);
                    setDestinationsOpen(false);
                  }}
                >
                  <View style={[styles.destinationChip, selected && styles.destinationChipSelected]}>
                    <Ionicons
                      color={selected ? colors.black : colors.goldStrong}
                      name={destination.icon}
                      size={16}
                    />
                    <Text style={[styles.destinationText, selected && styles.destinationTextSelected]}>
                      {destination.label}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
          </ScrollView>
        ) : null}

        <ScrollView
          contentContainerStyle={styles.categoryRail}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.horizontalClip}
        >
          {fleetCategories.map((option) => {
            const selected = category === option.value;
            return (
              <PressableScale
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={option.label}
                onPress={() => setCategory(option.value)}
              >
                <View style={[styles.categoryChip, selected && styles.categoryChipSelected]}>
                  <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>
                    {option.label}
                  </Text>
                </View>
              </PressableScale>
            );
          })}
        </ScrollView>

        <SectionHeader
          actionLabel="See all"
          eyebrow="The Prado collection"
          onAction={() => openFleet()}
          title="Prado first. Luxury beyond."
        />

        {isLoading ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
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

        <SectionHeader eyebrow="Lagos pickup" title="Districts & airport" />
        <ScrollView
          contentContainerStyle={styles.districtRail}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.horizontalClip}
        >
          {pickupDestinations.map((destination) => (
            <PressableScale
              accessibilityLabel={`Find cars for ${destination.label}`}
              accessibilityRole="button"
              key={destination.area}
              onPress={() => {
                setArea(destination.area);
                openFleet(destination.area);
              }}
            >
              <View style={styles.districtCard}>
                <View style={styles.districtIcon}>
                  <Ionicons color={colors.goldStrong} name={destination.icon} size={18} />
                </View>
                <Text style={styles.districtLabel}>{destination.label}</Text>
                <Text style={styles.districtHint}>Pickup here</Text>
              </View>
            </PressableScale>
          ))}
        </ScrollView>

        <LuxuryCard style={styles.assurance}>
          <View style={styles.assuranceIcon}>
            <Ionicons color={colors.goldStrong} name="shield-checkmark-outline" size={20} />
          </View>
          <View style={styles.assuranceCopy}>
            <Text style={styles.assuranceEyebrow}>The MMG standard</Text>
            <Text style={styles.assuranceTitle}>Prado-led, chauffeur-ready, reviewed by MMG.</Text>
            <Text style={styles.assuranceBody}>
              Every Prado—and every executive vehicle beside it—includes Lagos delivery and a reviewed chauffeur.
            </Text>
          </View>
        </LuxuryCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  assurance: { flexDirection: 'row', gap: spacing.md },
  assuranceBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.sm,
    lineHeight: 20,
    marginTop: 6,
  },
  assuranceCopy: { flex: 1 },
  assuranceEyebrow: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.8,
  },
  assuranceIcon: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  assuranceTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
    marginTop: 4,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avatarPress: {
    flexShrink: 0,
    height: 40,
    width: 40,
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
  categoryChip: {
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  categoryChipSelected: {
    backgroundColor: colors.ivory,
    borderColor: colors.ivory,
  },
  categoryRail: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  categoryText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  categoryTextSelected: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
  },
  cityPill: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 12,
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
  destinationChip: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  destinationChipSelected: {
    backgroundColor: colors.ivory,
    borderColor: colors.ivory,
  },
  destinationRail: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  destinationText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  destinationTextSelected: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
  },
  districtCard: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    padding: spacing.md,
    width: 148,
  },
  districtHint: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
  },
  districtIcon: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  districtLabel: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  districtRail: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  horizontalClip: {
    alignSelf: 'stretch',
    overflow: 'hidden',
    width: '100%',
  },
  greeting: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.display,
    letterSpacing: -0.6,
    marginTop: spacing.xs,
  },
  greetingBlock: {
    marginTop: spacing.xs,
  },
  kicker: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.6,
  },
  liveDot: {
    backgroundColor: colors.success,
    borderRadius: radii.pill,
    height: 6,
    width: 6,
  },
  loader: { marginVertical: spacing.xl },
  screen: { backgroundColor: colors.black, flex: 1, maxWidth: '100%', overflow: 'hidden', width: '100%' },
  topActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  topBar: { gap: spacing.xs },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
