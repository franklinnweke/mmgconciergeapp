import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, layout, radii, spacing, typography } from '@mmg/brand';
import { VehicleCategory } from '@mmg/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Platform,
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
  addDaysToDateOnly,
  firstRouteParam,
  parseFleetCategory,
  todayLagosDateOnly,
} from '../data/lagos-destinations';
import {
  parsePickupLocation,
  serializePickupLocation,
} from '../domain/pickup-location';
import { useVehicleSearch } from '../hooks/use-vehicle-search';

export default function BrowseFleetScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    pickup?: string | string[];
    area?: string | string[];
    category?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
  }>();

  const pickup = useMemo(
    () => parsePickupLocation(firstRouteParam(params.pickup) ?? firstRouteParam(params.area)),
    [params.pickup, params.area],
  );

  const routeCategory = parseFleetCategory(firstRouteParam(params.category));
  const [categorySelection, setCategorySelection] = useState<{
    routeValue?: string;
    value: VehicleCategory | undefined;
  } | null>(null);
  const category =
    categorySelection && categorySelection.routeValue === routeCategory
      ? categorySelection.value
      : routeCategory;

  const routeStartDate = firstRouteParam(params.startDate);
  const routeEndDate = firstRouteParam(params.endDate);

  const selectedJourneyDates = useMemo(() => {
    if (routeStartDate && routeEndDate) {
      return {
        startDate: routeStartDate,
        endDate: routeEndDate,
      };
    }
    const today = todayLagosDateOnly();
    return {
      startDate: addDaysToDateOnly(today, 1),
      endDate: addDaysToDateOnly(today, 2),
    };
  }, [routeStartDate, routeEndDate]);

  const [query, setQuery] = useState('');
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const reduceMotion = useReducedMotion();
  const [entrance] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

  const { error, isLoading, vehicles } = useVehicleSearch({
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

  const hasAnyFilterOrSearch = category !== undefined || query.trim().length > 0;

  const quietContext = useMemo(() => {
    const parts: string[] = [];
    if (category) {
      parts.push(category === 'executive_suv' ? 'SUV' : 'Sedan');
    }
    if (pickup) {
      parts.push(`${pickup.displayName} pickup`);
    }
    if (query.trim()) {
      parts.push(`“${query.trim()}”`);
    }
    return parts.join(' · ');
  }, [category, pickup, query]);

  const clearAllFilters = () => {
    setCategorySelection({ routeValue: routeCategory, value: undefined });
    setQuery('');
  };

  const handleApplyFilters = (newFilters: FleetFilterState) => {
    setCategorySelection({ routeValue: routeCategory, value: newFilters.category });
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

        <Text accessibilityRole="header" style={styles.title}>Cars</Text>

        <View style={styles.searchFilterRow}>
          <View style={styles.searchBox}>
            <Ionicons color={colors.goldStrong} name="search-outline" size={18} />
            <TextInput
              accessibilityLabel="Search vehicles"
              autoCapitalize="words"
              onChangeText={setQuery}
              placeholder="Search cars..."
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
            accessibilityLabel="Filters"
            accessibilityRole="button"
            onPress={() => setFilterSheetVisible(true)}
          >
            <View style={[styles.filterButton, category !== undefined && styles.filterButtonActive]}>
              <Ionicons
                color={category !== undefined ? colors.black : colors.ivory}
                name="options-outline"
                size={18}
              />
              <Text
                style={[
                  styles.filterButtonText,
                  category !== undefined && styles.filterButtonTextActive,
                ]}
              >
                Filters
              </Text>
            </View>
          </PressableScale>
        </View>

        {quietContext ? (
          <View style={styles.contextRow}>
            <Text numberOfLines={1} style={styles.contextText}>{quietContext}</Text>
            {hasAnyFilterOrSearch ? (
              <PressableScale
                accessibilityLabel="Clear filters"
                accessibilityRole="button"
                onPress={clearAllFilters}
              >
                <Text style={styles.clearFilterText}>Clear</Text>
              </PressableScale>
            ) : null}
          </View>
        ) : null}

        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>
            {isLoading
              ? 'Finding cars…'
              : `${vehicles.length} ${vehicles.length === 1 ? 'car' : 'cars'}`}
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
                      ...(pickup ? { pickup: serializePickupLocation(pickup) } : {}),
                      vehicleId: vehicle.id,
                    },
                  })
                }
                vehicle={vehicle}
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No exact match</Text>
              <Text style={styles.emptyBody}>
                Clear your search or filters to see all available cars.
              </Text>
              <PressableScale accessibilityRole="button" onPress={clearAllFilters}>
                <View style={styles.emptyAction}>
                  <Text style={styles.emptyActionText}>Clear filters</Text>
                </View>
              </PressableScale>
            </View>
          )}
        </View>
      </Animated.ScrollView>

      <FleetFilterSheet
        currentFilters={{
          category,
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
  clearSearch: {
    padding: spacing.xs,
  },
  content: {
    backgroundColor: colors.black,
    gap: spacing.md,
    paddingBottom: 120,
    paddingHorizontal: layout.screenGutter,
  },
  contextRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  contextText: {
    color: colors.silver,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
  },
  clearFilterText: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    marginLeft: spacing.sm,
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
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.display,
    letterSpacing: -0.6,
    marginTop: 4,
  },
});
