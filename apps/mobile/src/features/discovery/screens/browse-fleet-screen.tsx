import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, layout, radii, spacing, typography } from '@mmg/brand';
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

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { useReducedMotion } from '@/components/use-reduced-motion';

import { BrowseVehicleCard } from '../components/browse-vehicle-card';
import {
  FleetFilterSheet,
  type FleetFilterState,
} from '../components/fleet-filter-sheet';
import {
  areaFilters,
  firstRouteParam,
  formatLagosDateOnly,
  journeyDates,
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
  const params = useLocalSearchParams<{
    area?: string | string[];
    category?: string | string[];
    journey?: string | string[];
  }>();

  const routeArea = firstRouteParam(params.area);
  const resolvedRouteArea =
    routeArea && pickupChoices.includes(routeArea) ? routeArea : 'All Lagos';

  const [areaSelection, setAreaSelection] = useState<{
    routeValue?: string;
    value: string;
  } | null>(null);
  const area =
    areaSelection && areaSelection.routeValue === routeArea
      ? areaSelection.value
      : resolvedRouteArea;

  const routeCategory = parseFleetCategory(firstRouteParam(params.category));
  const [categorySelection, setCategorySelection] = useState<{
    routeValue?: string;
    value: VehicleCategory | undefined;
  } | null>(null);
  const category =
    categorySelection && categorySelection.routeValue === routeCategory
      ? categorySelection.value
      : routeCategory;

  const routeJourney = firstRouteParam(params.journey);
  const [journeySelection, setJourneySelection] = useState<{
    routeValue?: string;
    value: JourneyOption;
  } | null>(null);
  const journey =
    journeySelection && journeySelection.routeValue === routeJourney
      ? journeySelection.value
      : parseJourneyLabel(routeJourney);

  const [query, setQuery] = useState('');
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
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
      duration: 380,
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [entrance, reduceMotion]);

  const selectedJourneyDates = journeyDates(journey);
  const pickupLabel = formatLagosDateOnly(selectedJourneyDates.startDate);

  const activeFiltersCount =
    (area !== 'All Lagos' ? 1 : 0) +
    (category !== undefined ? 1 : 0) +
    (journey.label !== 'Tomorrow' && journey.label !== 'Today' ? 1 : 0);

  const hasAnyFilterOrSearch =
    area !== 'All Lagos' || category !== undefined || query.trim().length > 0;

  const clearAllFilters = () => {
    setAreaSelection({ routeValue: routeArea, value: 'All Lagos' });
    setCategorySelection({ routeValue: routeCategory, value: undefined });
    setQuery('');
  };

  const handleApplyFilters = (newFilters: FleetFilterState) => {
    setAreaSelection({ routeValue: routeArea, value: newFilters.area });
    setCategorySelection({ routeValue: routeCategory, value: newFilters.category });
    setJourneySelection({ routeValue: routeJourney, value: newFilters.journey });
  };

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={{
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        }}
      >
        {/* Top Header */}
        <View style={styles.topBar}>
          <View style={styles.headerLeft}>
            <PressableScale
              accessibilityLabel="Go back"
              accessibilityRole="button"
              onPress={() => router.back()}
            >
              <View style={styles.backButton}>
                <Ionicons color={colors.ivory} name="arrow-back" size={19} />
              </View>
            </PressableScale>
            <BrandWordmark compact withLogo />
          </View>
          <View style={styles.datePill}>
            <View style={styles.liveDot} />
            <Text style={styles.datePillText}>{pickupLabel}</Text>
          </View>
        </View>

        {/* Screen Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>PRADO-LED LAGOS FLEET</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Choose your ride
          </Text>
        </View>

        {/* Search & Filter Trigger Row */}
        <View style={styles.searchFilterRow}>
          <View style={styles.searchBox}>
            <Ionicons color={colors.goldStrong} name="search-outline" size={18} />
            <TextInput
              accessibilityLabel="Search vehicles or Lagos areas"
              autoCapitalize="words"
              onChangeText={setQuery}
              placeholder="Search Prado, sedan, or area..."
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

          <PressableScale
            accessibilityHint="Opens filter sheet"
            accessibilityLabel={`Filters${activeFiltersCount > 0 ? `, ${activeFiltersCount} applied` : ''}`}
            accessibilityRole="button"
            onPress={() => setFilterSheetVisible(true)}
          >
            <View style={[styles.filterButton, activeFiltersCount > 0 && styles.filterButtonActive]}>
              <Ionicons
                color={activeFiltersCount > 0 ? colors.black : colors.ivory}
                name="options-outline"
                size={18}
              />
              <Text
                style={[
                  styles.filterButtonText,
                  activeFiltersCount > 0 && styles.filterButtonTextActive,
                ]}
              >
                Filters
              </Text>
              {activeFiltersCount > 0 ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
                </View>
              ) : null}
            </View>
          </PressableScale>
        </View>

        {/* Active Filter Chips Strip (Progressive Removable Tokens) */}
        {hasAnyFilterOrSearch ? (
          <ScrollView
            contentContainerStyle={styles.activeFiltersStrip}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {area !== 'All Lagos' ? (
              <PressableScale
                accessibilityLabel={`Remove area filter ${area}`}
                accessibilityRole="button"
                onPress={() => setAreaSelection({ routeValue: routeArea, value: 'All Lagos' })}
              >
                <View style={styles.activeTag}>
                  <Text style={styles.activeTagText}>{area}</Text>
                  <Ionicons color={colors.goldStrong} name="close" size={14} />
                </View>
              </PressableScale>
            ) : null}

            {category !== undefined ? (
              <PressableScale
                accessibilityLabel="Remove class filter"
                accessibilityRole="button"
                onPress={() => setCategorySelection({ routeValue: routeCategory, value: undefined })}
              >
                <View style={styles.activeTag}>
                  <Text style={styles.activeTagText}>
                    {category === 'executive_suv' ? 'Executive SUV' : 'Executive Sedan'}
                  </Text>
                  <Ionicons color={colors.goldStrong} name="close" size={14} />
                </View>
              </PressableScale>
            ) : null}

            {query ? (
              <PressableScale
                accessibilityLabel="Clear search query"
                accessibilityRole="button"
                onPress={() => setQuery('')}
              >
                <View style={styles.activeTag}>
                  <Text style={styles.activeTagText}>“{query}”</Text>
                  <Ionicons color={colors.goldStrong} name="close" size={14} />
                </View>
              </PressableScale>
            ) : null}

            <PressableScale
              accessibilityLabel="Clear all filters"
              accessibilityRole="button"
              onPress={clearAllFilters}
            >
              <Text style={styles.clearAllText}>Clear all</Text>
            </PressableScale>
          </ScrollView>
        ) : null}

        {/* Results Header */}
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>
            {isLoading
              ? 'Finding available fleet…'
              : `${vehicles.length} ${vehicles.length === 1 ? 'vehicle available' : 'vehicles available'}`}
          </Text>
          <View style={styles.sortIndicator}>
            <Ionicons color={colors.gold} name="swap-vertical" size={13} />
            <Text style={styles.sortText}>Nearest first</Text>
          </View>
        </View>

        {/* Vehicle Results Feed */}
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
                <Ionicons color={colors.goldStrong} name="car-sport-outline" size={26} />
              </View>
              <Text style={styles.emptyTitle}>No exact match</Text>
              <Text style={styles.emptyBody}>
                Widen your area or vehicle class filters to see all available Prado and executive options.
              </Text>
              <PressableScale accessibilityRole="button" onPress={clearAllFilters}>
                <View style={styles.emptyAction}>
                  <Text style={styles.emptyActionText}>SHOW ALL VEHICLES</Text>
                </View>
              </PressableScale>
            </View>
          )}
        </View>

        {/* Service Assurance */}
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

      {/* Filter Bottom Sheet */}
      <FleetFilterSheet
        currentFilters={{
          area,
          category,
          journey,
        }}
        onApply={handleApplyFilters}
        onClose={() => setFilterSheetVisible(false)}
        totalResultsCount={vehicles.length}
        visible={filterSheetVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  activeFiltersStrip: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  activeTag: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  activeTagText: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
  },
  assurance: {
    alignItems: 'flex-start',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: layout.sectionGap,
    padding: spacing.lg,
  },
  assuranceBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.sm,
    lineHeight: 20,
    marginTop: 4,
  },
  assuranceCopy: {
    flex: 1,
  },
  assuranceTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  clearAllText: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    marginLeft: spacing.xs,
    textDecorationLine: 'underline',
  },
  clearSearch: {
    padding: spacing.xs,
  },
  content: {
    backgroundColor: colors.black,
    gap: spacing.md,
    paddingBottom: 120,
    paddingHorizontal: layout.screenGutter,
  },
  datePill: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  datePillText: {
    color: colors.silver,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.4,
  },
  emptyAction: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: layout.primaryButtonHeight,
    paddingHorizontal: spacing.xl,
  },
  emptyActionText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
    letterSpacing: 1.1,
  },
  emptyBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.sm,
    lineHeight: 20,
    maxWidth: 280,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderRadius: radii.pill,
    height: 56,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    width: 56,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
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
    letterSpacing: 1.3,
  },
  filterBadge: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 5,
  },
  filterBadgeText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: 10,
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  filterButtonActive: {
    backgroundColor: colors.ivory,
    borderColor: colors.ivory,
  },
  filterButtonText: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  filterButtonTextActive: {
    color: colors.black,
  },
  headerLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  liveDot: {
    backgroundColor: colors.success,
    borderRadius: radii.pill,
    height: 6,
    width: 6,
  },
  loadingCard: {
    backgroundColor: colors.graphite,
    borderRadius: radii.lg,
    height: 320,
  },
  resultsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.xs,
  },
  resultsList: {
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  resultsTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  searchFilterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  searchInput: {
    color: colors.ivory,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.base,
  },
  sortIndicator: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  sortText: {
    color: colors.gold,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.display,
    letterSpacing: -0.6,
    marginTop: 4,
  },
  titleBlock: {
    marginTop: spacing.xs,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
  },
});
