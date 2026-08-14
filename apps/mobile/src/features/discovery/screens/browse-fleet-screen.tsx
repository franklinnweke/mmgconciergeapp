import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radii, spacing, typography } from '@mmg/brand';
import { VehicleCategory } from '@mmg/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { useReducedMotion } from '@/components/use-reduced-motion';

import { BrowseVehicleCard } from '../components/browse-vehicle-card';
import {
  areaFilters,
  cycleJourneyOption,
  firstRouteParam,
  fleetCategories,
  formatLagosDateOnly,
  journeyDates,
  journeyOptions,
  parseFleetCategory,
  parseJourneyLabel,
  pickupDestinations,
  vehicleAreaForPickup,
  type JourneyOption,
} from '../data/lagos-destinations';
import { useVehicleSearch } from '../hooks/use-vehicle-search';

const pickupChoices = [
  ...areaFilters,
  ...pickupDestinations
    .map((destination) => destination.area)
    .filter((area) => !areaFilters.includes(area as (typeof areaFilters)[number])),
];

export default function BrowseFleetScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ area?: string | string[]; category?: string | string[]; journey?: string | string[] }>();
  const routeArea = firstRouteParam(params.area);
  const resolvedRouteArea = routeArea && pickupChoices.includes(routeArea) ? routeArea : 'All Lagos';
  const [areaSelection, setAreaSelection] = useState<{
    routeValue?: string;
    value: string;
  } | null>(null);
  const area =
    areaSelection && areaSelection.routeValue === routeArea
      ? areaSelection.value
      : resolvedRouteArea;
  const routeCategory = parseFleetCategory(firstRouteParam(params.category));
  const routeJourney = firstRouteParam(params.journey);
  const [categorySelection, setCategorySelection] = useState<{
    routeValue?: string;
    value: VehicleCategory | undefined;
  } | null>(null);
  const category =
    categorySelection && categorySelection.routeValue === routeCategory
      ? categorySelection.value
      : routeCategory;
  const [journeySelection, setJourneySelection] = useState<{
    routeValue?: string;
    value: JourneyOption;
  } | null>(null);
  const journey =
    journeySelection && journeySelection.routeValue === routeJourney
      ? journeySelection.value
      : parseJourneyLabel(routeJourney);
  const [query, setQuery] = useState('');
  const reduceMotion = useReducedMotion();
  const [entrance] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const { isLoading, vehicles } = useVehicleSearch({
    areaLabel: vehicleAreaForPickup(area),
    category,
    query,
  });

  useEffect(() => {
    if (reduceMotion) {
      entrance.setValue(1);
      return;
    }
    Animated.timing(entrance, {
      duration: 420,
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [entrance, reduceMotion]);

  const selectedJourneyDates = journeyDates(journey);
  const pickupLabel = formatLagosDateOnly(selectedJourneyDates.startDate);
  const returnLabel = formatLagosDateOnly(selectedJourneyDates.endDate);
  const hasFilters = area !== 'All Lagos' || category !== undefined || query.trim().length > 0;

  const clearFilters = () => {
    setAreaSelection({ routeValue: routeArea, value: 'All Lagos' });
    setCategorySelection({ routeValue: routeCategory, value: undefined });
    setQuery('');
  };

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={{
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
          ],
        }}
      >
        <View style={styles.topBar}>
          <View>
            <Text style={styles.eyebrow}>Lagos fleet</Text>
            <Text accessibilityRole="header" style={styles.title}>Find a car</Text>
          </View>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{pickupLabel}</Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Ionicons color={colors.goldStrong} name="search-outline" size={19} />
          <TextInput
            accessibilityLabel="Search vehicles or Lagos areas"
            autoCapitalize="words"
            onChangeText={setQuery}
            placeholder="Vehicle or Lagos area"
            placeholderTextColor="rgba(180,174,164,0.68)"
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
          />
          {query ? (
            <PressableScale
              accessibilityLabel="Clear search"
              accessibilityRole="button"
              onPress={() => setQuery('')}
            >
              <View style={styles.clearSearch}>
                <Ionicons color={colors.muted} name="close" size={16} />
              </View>
            </PressableScale>
          ) : null}
        </View>

        <View style={styles.journeyCard}>
          <View style={styles.dateRow}>
            <View style={styles.dateBlock}>
              <Text style={styles.dateLabel}>PICKUP</Text>
              <Text style={styles.dateValue}>{pickupLabel}</Text>
            </View>
            <View style={styles.dateConnector}>
              <View style={styles.connectorLine} />
              <Ionicons color={colors.gold} name="arrow-forward" size={14} />
              <View style={styles.connectorLine} />
            </View>
            <View style={styles.dateBlock}>
              <Text style={styles.dateLabel}>RETURN</Text>
              <Text style={styles.dateValue}>{returnLabel}</Text>
            </View>
            <PressableScale
              accessibilityHint="Cycles Today, Tomorrow, and Weekend"
              accessibilityLabel="Change journey dates"
              accessibilityRole="button"
              onPress={() => setJourneySelection({ routeValue: routeJourney, value: cycleJourneyOption(journey) })}
            >
              <View style={styles.calendarButton}>
                <Ionicons color={colors.black} name="calendar-clear-outline" size={17} />
              </View>
            </PressableScale>
          </View>
          <View style={styles.journeyOptions}>
            {journeyOptions.map((option) => {
              const isActive = option.label === journey.label;
              return (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  key={option.label}
                  onPress={() => setJourneySelection({ routeValue: routeJourney, value: option })}
                  style={styles.flexChip}
                >
                  <View style={[styles.journeyChip, isActive && styles.journeyChipActive]}>
                    <Text style={[styles.journeyText, isActive && styles.journeyTextActive]}>
                      {option.label}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
          </View>
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>PICKUP AREA</Text>
          <ScrollView
            contentContainerStyle={styles.chipRail}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.horizontalClip}
          >
            {pickupChoices.map((option) => {
              const isActive = area === option;
              return (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  key={option}
                  onPress={() => setAreaSelection({ routeValue: routeArea, value: option })}
                >
                  <View style={[styles.filterChip, isActive && styles.filterChipActive]}>
                    {isActive ? <View style={styles.selectedDot} /> : null}
                    <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                      {option}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>VEHICLE CLASS</Text>
          <ScrollView
            contentContainerStyle={styles.chipRail}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.horizontalClip}
          >
            {fleetCategories.map((option) => {
              const isActive = category === option.value;
              return (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  key={option.label}
                  onPress={() => setCategorySelection({ routeValue: routeCategory, value: option.value })}
                >
                  <View style={[styles.filterChip, isActive && styles.filterChipActive]}>
                    <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                      {option.label}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.resultsHeader}>
          <View>
            <Text style={styles.resultsEyebrow}>Chauffeur-ready</Text>
            <Text style={styles.resultsTitle}>
              {isLoading ? 'Finding the fleet…' : `${vehicles.length} ${vehicles.length === 1 ? 'vehicle' : 'vehicles'}`}
            </Text>
          </View>
          {hasFilters ? (
            <PressableScale accessibilityRole="button" onPress={clearFilters}>
              <Text style={styles.resetText}>Reset</Text>
            </PressableScale>
          ) : (
            <View style={styles.sortPill}>
              <Ionicons color={colors.gold} name="swap-vertical" size={13} />
              <Text style={styles.sortText}>Nearest</Text>
            </View>
          )}
        </View>

        <View style={styles.resultsList}>
          {isLoading ? (
            <>
              <View style={styles.loadingCard} />
              <View style={styles.loadingCard} />
            </>
          ) : vehicles.length ? (
            vehicles.map((vehicle) => (
              <BrowseVehicleCard
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
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons color={colors.goldStrong} name="car-sport-outline" size={24} />
              </View>
              <Text style={styles.emptyTitle}>No exact match.</Text>
              <Text style={styles.emptyBody}>
                Widen the area or vehicle class and we’ll show the closest chauffeur-ready options.
              </Text>
              <PressableScale accessibilityRole="button" onPress={clearFilters}>
                <View style={styles.emptyAction}>
                  <Text style={styles.emptyActionText}>SHOW ALL VEHICLES</Text>
                </View>
              </PressableScale>
            </View>
          )}
        </View>

        <View style={styles.assurance}>
          <Ionicons color={colors.goldStrong} name="shield-checkmark-outline" size={20} />
          <View style={styles.assuranceCopy}>
            <Text style={styles.assuranceTitle}>A confirmed journey, not just a car.</Text>
            <Text style={styles.assuranceBody}>
              Vehicle, chauffeur, and Lagos delivery are reviewed before your booking is confirmed.
            </Text>
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  assurance: {
    alignItems: 'flex-start',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  assuranceBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  assuranceCopy: { flex: 1 },
  assuranceTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
  },
  calendarButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    marginLeft: spacing.sm,
    width: 36,
  },
  chipRail: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  clearSearch: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderRadius: radii.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  connectorLine: {
    backgroundColor: colors.lineStrong,
    height: StyleSheet.hairlineWidth,
    width: 10,
  },
  content: {
    paddingBottom: 124,
    paddingHorizontal: spacing.lg,
  },
  dateBlock: { flex: 1 },
  dateConnector: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 5,
  },
  dateLabel: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.6,
  },
  dateRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  dateValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
    marginTop: 5,
  },
  emptyAction: {
    borderColor: colors.gold,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  emptyActionText: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.8,
  },
  emptyBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 19,
    maxWidth: 280,
    textAlign: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderRadius: radii.pill,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  emptyState: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.xl,
  },
  eyebrow: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 1.1,
  },
  filterChip: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 7,
    minHeight: 38,
    paddingHorizontal: spacing.md,
  },
  filterChipActive: {
    backgroundColor: colors.ivory,
    borderColor: colors.ivory,
  },
  filterLabel: {
    color: colors.muted,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  filterSection: { marginTop: spacing.lg },
  horizontalClip: { alignSelf: 'stretch', overflow: 'hidden', width: '100%' },
  filterText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  filterTextActive: { color: colors.black },
  flexChip: { flex: 1 },
  intro: { marginTop: spacing.md },
  journeyCard: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  journeyChip: {
    alignItems: 'center',
    borderRadius: radii.pill,
    paddingVertical: 9,
  },
  journeyChipActive: { backgroundColor: colors.graphiteRaised },
  journeyOptions: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  journeyText: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  journeyTextActive: { color: colors.goldStrong },
  liveDot: {
    backgroundColor: colors.success,
    borderRadius: radii.pill,
    height: 5,
    width: 5,
  },
  livePill: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  liveText: {
    color: colors.silver,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.4,
  },
  loadingCard: {
    backgroundColor: colors.graphite,
    borderRadius: radii.lg,
    height: 326,
  },
  resetText: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: 10,
    textDecorationLine: 'underline',
  },
  resultsEyebrow: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.8,
  },
  resultsHeader: {
    alignItems: 'flex-end',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    paddingTop: spacing.xl,
  },
  resultsList: { gap: spacing.md, marginTop: spacing.md },
  resultsTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.xl,
    letterSpacing: -0.4,
    marginTop: 3,
  },
  screen: { backgroundColor: colors.black, flex: 1 },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    color: colors.ivory,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.base,
    minHeight: 48,
  },
  selectedDot: {
    backgroundColor: colors.gold,
    borderRadius: radii.pill,
    height: 5,
    width: 5,
  },
  sortPill: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sortText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.sm,
    lineHeight: 20,
    marginTop: spacing.sm,
    maxWidth: 340,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.display,
    letterSpacing: -0.6,
    lineHeight: 36,
    marginTop: 4,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
