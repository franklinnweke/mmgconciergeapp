import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, layout, radii, spacing, typography } from '@mmg/brand';
import { VehicleCategory } from '@mmg/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { ScreenHeader } from '@/components/screen-header';
import { LuxuryShimmer } from '@/components/ui/luxury-shimmer';
import { useReducedMotion } from '@/components/use-reduced-motion';

import { BrowseVehicleCard } from '../components/browse-vehicle-card';
import {
  FleetFilterSheet,
  type FleetFilterState,
} from '../components/fleet-filter-sheet';
import {
  areaFilters,
  firstRouteParam,
  journeyDates,
  parseFleetCategory,
  parseJourneyLabel,
  pickupDestinations,
  vehicleAreaForPickup,
  type JourneyOption,
} from '../data/lagos-destinations';
import {
  parsePickupLocation,
  serializePickupLocation,
} from '../domain/pickup-location';
import { useVehicleSearch } from '../hooks/use-vehicle-search';

const pickupChoices = [
  ...areaFilters,
  ...pickupDestinations
    .map((destination) => destination.area)
    .filter((area) => !areaFilters.includes(area as (typeof areaFilters)[number])),
];

export default function BrowseFleetScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    pickup?: string | string[];
    area?: string | string[];
    category?: string | string[];
    journey?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
  }>();

  const pickup = useMemo(
    () => parsePickupLocation(firstRouteParam(params.pickup) ?? firstRouteParam(params.area)),
    [params.pickup, params.area],
  );

  const routeArea = firstRouteParam(params.area) ?? pickup.serviceAreaLabel;
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

  const routeStartDate = firstRouteParam(params.startDate);
  const routeEndDate = firstRouteParam(params.endDate);

  const selectedJourneyDates = useMemo(() => {
    if (routeStartDate && routeEndDate) {
      return {
        startDate: routeStartDate,
        endDate: routeEndDate,
      };
    }
    return journeyDates(journey);
  }, [journey, routeStartDate, routeEndDate]);

  const [query, setQuery] = useState('');
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const reduceMotion = useReducedMotion();
  const [entrance] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

  const { error, isLoading, vehicles } = useVehicleSearch({
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
        <ScreenHeader />

        <Text accessibilityRole="header" style={styles.title}>Available in Lagos</Text>

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

        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>
            {isLoading
              ? 'Finding available fleet…'
              : `${vehicles.length} ${vehicles.length === 1 ? 'vehicle available' : 'vehicles available'}`}
          </Text>
        </View>

        <View style={styles.resultsList}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons color={colors.danger} name="alert-circle" size={18} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : isLoading ? (
            <>
              <LuxuryShimmer borderRadius={radii.lg} height={260} style={{ marginBottom: spacing.md }} />
              <LuxuryShimmer borderRadius={radii.lg} height={260} />
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
                      pickup: serializePickupLocation(pickup),
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
      </Animated.ScrollView>

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
    fontSize: 11,
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
  errorBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(209,133,120,0.12)',
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
});
