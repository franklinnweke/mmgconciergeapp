import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
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

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';

import { BrowseVehicleCard } from '../components/browse-vehicle-card';
import { useVehicleSearch } from '../hooks/use-vehicle-search';

const areas = ['All Lagos', 'Ikoyi', 'Victoria Island', 'Lekki', 'Lagos Island'] as const;
const journeyOptions = [
  { label: 'Today', pickupOffset: 0, returnOffset: 1 },
  { label: 'Tomorrow', pickupOffset: 1, returnOffset: 2 },
  { label: 'Weekend', pickupOffset: 3, returnOffset: 5 },
] as const;

type AreaFilter = (typeof areas)[number];
type JourneyOption = (typeof journeyOptions)[number];

const vehicleClasses: readonly { label: string; value?: VehicleCategory }[] = [
  { label: 'All vehicles' },
  { label: 'Executive SUVs', value: 'executive_suv' },
  { label: 'Executive saloons', value: 'executive_sedan' },
];

function getDateLabel(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  }).format(date);
}

export default function BrowseFleetScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ area?: string }>();
  const routeArea = areas.includes(params.area as AreaFilter)
    ? (params.area as AreaFilter)
    : 'All Lagos';
  const [areaSelection, setAreaSelection] = useState<{
    routeValue?: string;
    value: AreaFilter;
  } | null>(null);
  const area =
    areaSelection && areaSelection.routeValue === params.area
      ? areaSelection.value
      : routeArea;
  const [category, setCategory] = useState<VehicleCategory | undefined>();
  const [journey, setJourney] = useState<JourneyOption>(journeyOptions[1]);
  const [query, setQuery] = useState('');
  const [entrance] = useState(() => new Animated.Value(0));
  const { isLoading, vehicles } = useVehicleSearch({
    areaLabel: area === 'All Lagos' ? undefined : area,
    category,
    query,
  });

  useEffect(() => {
    Animated.timing(entrance, {
      duration: 420,
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [entrance]);

  const pickupLabel = useMemo(() => getDateLabel(journey.pickupOffset), [journey]);
  const returnLabel = useMemo(() => getDateLabel(journey.returnOffset), [journey]);
  const hasFilters = area !== 'All Lagos' || category !== undefined || query.trim().length > 0;

  const clearFilters = () => {
    setAreaSelection({ routeValue: params.area, value: 'All Lagos' });
    setCategory(undefined);
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
          <BrandWordmark />
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LAGOS FLEET</Text>
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>FIND YOUR ARRIVAL</Text>
          <Text style={styles.title}>The right car, already considered.</Text>
          <Text style={styles.subtitle}>
            Every result includes a professional chauffeur and delivery within Lagos.
          </Text>
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
            <View style={styles.calendarButton}>
              <Ionicons color={colors.black} name="calendar-clear-outline" size={17} />
            </View>
          </View>
          <View style={styles.journeyOptions}>
            {journeyOptions.map((option) => {
              const isActive = option.label === journey.label;
              return (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  key={option.label}
                  onPress={() => setJourney(option)}
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
          >
            {areas.map((option) => {
              const isActive = area === option;
              return (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  key={option}
                  onPress={() => setAreaSelection({ routeValue: params.area, value: option })}
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
          >
            {vehicleClasses.map((option) => {
              const isActive = category === option.value;
              return (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  key={option.label}
                  onPress={() => setCategory(option.value)}
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
            <Text style={styles.resultsEyebrow}>CHAUFFEUR-READY</Text>
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
                    params: { vehicleId: vehicle.id },
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
    fontSize: 8,
    letterSpacing: 1.2,
  },
  dateRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  dateValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 12,
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
    fontSize: 9,
    letterSpacing: 1.2,
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
    fontSize: 27,
  },
  eyebrow: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: 9,
    letterSpacing: 2,
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
    fontSize: 8,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  filterSection: { marginTop: spacing.lg },
  filterText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 10,
  },
  filterTextActive: { color: colors.black },
  flexChip: { flex: 1 },
  intro: { marginTop: spacing.xl },
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
    fontSize: 9,
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
    fontSize: 8,
    letterSpacing: 1.1,
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
    fontSize: 8,
    letterSpacing: 1.5,
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
    fontSize: 30,
    letterSpacing: -0.5,
    marginTop: 3,
  },
  screen: { backgroundColor: colors.black, flex: 1 },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    color: colors.ivory,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    minHeight: 52,
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
    fontSize: 9,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.sm,
    maxWidth: 340,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 39,
    letterSpacing: -1,
    lineHeight: 42,
    marginTop: spacing.sm,
    maxWidth: 350,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
