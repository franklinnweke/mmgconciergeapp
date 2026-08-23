import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { type VehicleCategory } from '@mmg/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { InlineNotice, PrimaryAction } from '@/components/ui/mobile-primitives';

import { BrowseVehicleCard } from '../components/browse-vehicle-card';
import { FleetFilterSheet, type FleetFilterState } from '../components/fleet-filter-sheet';
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
    startDate?: string | string[];
    endDate?: string | string[];
  }>();

  const routeArea = firstRouteParam(params.area);
  const resolvedRouteArea = routeArea && pickupChoices.includes(routeArea) ? routeArea : 'All Lagos';
  const [areaSelection, setAreaSelection] = useState<{ routeValue?: string; value: string } | null>(null);
  const area = areaSelection && areaSelection.routeValue === routeArea ? areaSelection.value : resolvedRouteArea;

  const routeCategory = parseFleetCategory(firstRouteParam(params.category));
  const [categorySelection, setCategorySelection] = useState<{
    routeValue?: string;
    value: VehicleCategory | undefined;
  } | null>(null);
  const category = categorySelection && categorySelection.routeValue === routeCategory
    ? categorySelection.value
    : routeCategory;

  const routeJourney = firstRouteParam(params.journey);
  const [journeySelection, setJourneySelection] = useState<{
    routeValue?: string;
    value: JourneyOption;
  } | null>(null);
  const journey = journeySelection && journeySelection.routeValue === routeJourney
    ? journeySelection.value
    : parseJourneyLabel(routeJourney);

  const routeStartDate = firstRouteParam(params.startDate);
  const routeEndDate = firstRouteParam(params.endDate);
  const selectedJourneyDates = useMemo(() => {
    if (routeStartDate && routeEndDate) return { startDate: routeStartDate, endDate: routeEndDate };
    return journeyDates(journey);
  }, [journey, routeEndDate, routeStartDate]);

  const [query, setQuery] = useState('');
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const { error, isLoading, vehicles } = useVehicleSearch({
    areaLabel: vehicleAreaForPickup(area),
    category,
    query,
  });

  const activeFiltersCount =
    (area !== 'All Lagos' ? 1 : 0) +
    (category !== undefined ? 1 : 0) +
    (journey.label !== 'Tomorrow' && journey.label !== 'Today' ? 1 : 0);
  const hasAnyFilterOrSearch = activeFiltersCount > 0 || query.trim().length > 0;

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

  const categoryLabel = category === 'executive_suv'
    ? 'Executive SUV'
    : category === 'executive_sedan'
      ? 'Executive sedan'
      : null;
  const filterSummary = [area !== 'All Lagos' ? area : null, categoryLabel, journey.label].filter(Boolean).join(' · ');

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + 110 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <PressableScale accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.back()}>
            <View style={styles.backTarget}><Ionicons color={colors.ivory} name="arrow-back" size={22} /></View>
          </PressableScale>
          <BrandWordmark compact withLogo />
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>Available in Lagos</Text>
          <Text style={styles.subtitle}>{filterSummary}</Text>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons color={colors.muted} name="search-outline" size={19} />
            <TextInput
              accessibilityLabel="Search vehicles or Lagos areas"
              autoCapitalize="words"
              onChangeText={setQuery}
              placeholder="Search vehicle or area"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              style={styles.searchInput}
              value={query}
            />
            {query ? (
              <PressableScale accessibilityLabel="Clear search" accessibilityRole="button" onPress={() => setQuery('')}>
                <View style={styles.clearTarget}><Ionicons color={colors.muted} name="close" size={17} /></View>
              </PressableScale>
            ) : null}
          </View>

          <PressableScale
            accessibilityLabel={`Filters${activeFiltersCount ? `, ${activeFiltersCount} applied` : ''}`}
            accessibilityRole="button"
            onPress={() => setFilterSheetVisible(true)}
          >
            <View style={[styles.filterButton, activeFiltersCount > 0 && styles.filterButtonActive]}>
              <Ionicons color={activeFiltersCount > 0 ? colors.black : colors.ivory} name="options-outline" size={20} />
              {activeFiltersCount > 0 ? <Text style={styles.filterCount}>{activeFiltersCount}</Text> : null}
            </View>
          </PressableScale>
        </View>

        {hasAnyFilterOrSearch ? (
          <View style={styles.filterContextRow}>
            <Text numberOfLines={1} style={styles.filterContext}>
              {query ? `“${query}” · ` : ''}{filterSummary}
            </Text>
            <PressableScale accessibilityRole="button" onPress={clearAllFilters}>
              <Text style={styles.clearAll}>Clear</Text>
            </PressableScale>
          </View>
        ) : null}

        <View style={styles.resultsHeader}>
          <Text style={styles.resultsCount}>
            {isLoading ? 'Searching' : `${vehicles.length} ${vehicles.length === 1 ? 'vehicle' : 'vehicles'}`}
          </Text>
        </View>

        {error ? <InlineNotice icon="alert-circle-outline" tone="danger">{error}</InlineNotice> : null}

        {isLoading ? (
          <View accessibilityLiveRegion="polite" style={styles.loading}>
            <ActivityIndicator color={colors.goldStrong} size="small" />
            <Text style={styles.loadingText}>Finding available vehicles</Text>
          </View>
        ) : vehicles.length ? (
          <View style={styles.resultsList}>
            {vehicles.map((vehicle) => (
              <BrowseVehicleCard
                key={vehicle.id}
                onPress={() =>
                  router.push({
                    pathname: '/vehicle/[vehicleId]',
                    params: { ...selectedJourneyDates, vehicleId: vehicle.id },
                  })
                }
                vehicle={vehicle}
              />
            ))}
          </View>
        ) : !error ? (
          <View style={styles.emptyState}>
            <Ionicons color={colors.goldStrong} name="car-outline" size={26} />
            <Text style={styles.emptyTitle}>No exact match</Text>
            <Text style={styles.emptyBody}>Try a wider area or remove a vehicle filter.</Text>
            <View style={styles.emptyAction}>
              <PrimaryAction label="Show all vehicles" onPress={clearAllFilters} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      <FleetFilterSheet
        currentFilters={{ area, category, journey }}
        onApply={handleApplyFilters}
        onClose={() => setFilterSheetVisible(false)}
        totalResultsCount={vehicles.length}
        visible={filterSheetVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backTarget: {
    alignItems: 'flex-start',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  clearAll: {
    color: colors.goldStrong,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  clearTarget: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 36,
  },
  content: {
    paddingHorizontal: spacing.md,
  },
  emptyAction: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  emptyBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  emptyTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 27,
    marginTop: spacing.md,
  },
  filterButton: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 3,
    height: 50,
    justifyContent: 'center',
    minWidth: 50,
    paddingHorizontal: spacing.sm,
  },
  filterButtonActive: {
    backgroundColor: colors.ivory,
    borderColor: colors.ivory,
  },
  filterContext: {
    color: colors.muted,
    flex: 1,
    fontFamily: typography.body,
    fontSize: 12,
  },
  filterContextRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  filterCount: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
  },
  headerSpacer: { width: 44 },
  intro: {
    marginTop: spacing.xl,
  },
  loading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  loadingText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  resultsCount: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  resultsHeader: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  resultsList: {
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    height: 50,
    paddingLeft: spacing.md,
  },
  searchInput: {
    color: colors.ivory,
    flex: 1,
    fontFamily: typography.body,
    fontSize: 14,
    paddingVertical: 0,
  },
  searchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    marginTop: 5,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 32,
    letterSpacing: -0.6,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
