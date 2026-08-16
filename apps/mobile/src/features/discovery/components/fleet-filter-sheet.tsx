import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, layout, radii, spacing, typography } from '@mmg/brand';
import { VehicleCategory } from '@mmg/contracts';
import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';

import {
  areaFilters,
  fleetCategories,
  journeyOptions,
  pickupDestinations,
  type JourneyOption,
} from '../data/lagos-destinations';

const pickupChoices = [
  ...areaFilters,
  ...pickupDestinations
    .map((destination) => destination.area)
    .filter((area) => !areaFilters.includes(area as (typeof areaFilters)[number])),
];

export type FleetFilterState = {
  area: string;
  category: VehicleCategory | undefined;
  journey: JourneyOption;
};

type FleetFilterSheetProps = {
  visible: boolean;
  onClose(): void;
  onApply(filters: FleetFilterState): void;
  currentFilters: FleetFilterState;
  totalResultsCount?: number;
};

export function FleetFilterSheet({
  currentFilters,
  onApply,
  onClose,
  totalResultsCount,
  visible,
}: FleetFilterSheetProps) {
  const insets = useSafeAreaInsets();
  const [selectedArea, setSelectedArea] = useState(currentFilters.area);
  const [selectedCategory, setSelectedCategory] = useState<VehicleCategory | undefined>(
    currentFilters.category,
  );
  const [selectedJourney, setSelectedJourney] = useState<JourneyOption>(currentFilters.journey);

  const activeFiltersCount =
    (selectedArea !== 'All Lagos' ? 1 : 0) +
    (selectedCategory !== undefined ? 1 : 0) +
    (selectedJourney.label !== journeyOptions[0].label ? 1 : 0);

  const handleReset = () => {
    setSelectedArea('All Lagos');
    setSelectedCategory(undefined);
    setSelectedJourney(journeyOptions[0]);
  };

  const handleApply = () => {
    onApply({
      area: selectedArea,
      category: selectedCategory,
      journey: selectedJourney,
    });
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          {/* Sheet Handle */}
          <View style={styles.handleBar}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.title}>Filters</Text>
              {activeFiltersCount > 0 ? (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{activeFiltersCount}</Text>
                </View>
              ) : null}
            </View>
            <PressableScale accessibilityLabel="Close filters" accessibilityRole="button" onPress={onClose}>
              <View style={styles.closeButton}>
                <Ionicons color={colors.ivory} name="close" size={20} />
              </View>
            </PressableScale>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Section 1: Vehicle Class */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>VEHICLE CLASS</Text>
              <View style={styles.optionsGrid}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedCategory === undefined }}
                  onPress={() => setSelectedCategory(undefined)}
                  style={styles.optionFull}
                >
                  <View
                    style={[
                      styles.choicePill,
                      selectedCategory === undefined && styles.choicePillActive,
                    ]}
                  >
                    <Ionicons
                      color={selectedCategory === undefined ? colors.black : colors.goldStrong}
                      name="car-sport-outline"
                      size={17}
                    />
                    <Text
                      style={[
                        styles.choiceText,
                        selectedCategory === undefined && styles.choiceTextActive,
                      ]}
                    >
                      All Classes (Prado & Sedans)
                    </Text>
                  </View>
                </PressableScale>
                {fleetCategories.map((cat) => {
                  const isSelected = selectedCategory === cat.value;
                  return (
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      key={cat.label}
                      onPress={() => setSelectedCategory(cat.value)}
                      style={styles.optionFull}
                    >
                      <View style={[styles.choicePill, isSelected && styles.choicePillActive]}>
                        <Ionicons
                          color={isSelected ? colors.black : colors.silver}
                          name={cat.value === 'executive_suv' ? 'shield-outline' : 'business-outline'}
                          size={17}
                        />
                        <Text style={[styles.choiceText, isSelected && styles.choiceTextActive]}>
                          {cat.label}
                        </Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            </View>

            {/* Section 2: Lagos Pickup Area */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>LAGOS PICKUP AREA</Text>
              <View style={styles.chipWrap}>
                {pickupChoices.map((loc) => {
                  const isSelected = selectedArea === loc;
                  return (
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      key={loc}
                      onPress={() => setSelectedArea(loc)}
                    >
                      <View style={[styles.chip, isSelected && styles.chipActive]}>
                        {isSelected ? <View style={styles.chipDot} /> : null}
                        <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                          {loc}
                        </Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            </View>

            {/* Section 3: Journey Timing */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>JOURNEY TIMING</Text>
              <View style={styles.journeyRow}>
                {journeyOptions.map((opt) => {
                  const isSelected = selectedJourney.label === opt.label;
                  return (
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      key={opt.label}
                      onPress={() => setSelectedJourney(opt)}
                      style={styles.journeyFlex}
                    >
                      <View style={[styles.journeyButton, isSelected && styles.journeyButtonActive]}>
                        <Text
                          style={[
                            styles.journeyButtonText,
                            isSelected && styles.journeyButtonTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <PressableScale
              accessibilityLabel="Reset all filters"
              accessibilityRole="button"
              onPress={handleReset}
            >
              <View style={styles.resetButton}>
                <Text style={styles.resetText}>Reset</Text>
              </View>
            </PressableScale>

            <PressableScale
              accessibilityLabel="Apply filters"
              accessibilityRole="button"
              onPress={handleApply}
              style={styles.applyFlex}
            >
              <View style={styles.applyButton}>
                <Text style={styles.applyText}>
                  {totalResultsCount !== undefined
                    ? `Show ${totalResultsCount} ${totalResultsCount === 1 ? 'vehicle' : 'vehicles'}`
                    : 'Apply filters'}
                </Text>
                <Ionicons color={colors.black} name="arrow-forward" size={17} />
              </View>
            </PressableScale>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  applyButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: layout.primaryButtonHeight,
  },
  applyFlex: {
    flex: 1,
  },
  applyText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  chip: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  chipActive: {
    backgroundColor: colors.ivory,
    borderColor: colors.ivory,
  },
  chipDot: {
    backgroundColor: colors.black,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  chipText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  chipTextActive: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  choicePill: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  choicePillActive: {
    backgroundColor: colors.ivory,
    borderColor: colors.ivory,
  },
  choiceText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  choiceTextActive: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderRadius: radii.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    height: 22,
    justifyContent: 'center',
    minWidth: 22,
    paddingHorizontal: 6,
  },
  countBadgeText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
  },
  footer: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: layout.screenGutter,
    paddingTop: spacing.md,
  },
  handle: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 2,
    height: 4,
    width: 36,
  },
  handleBar: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenGutter,
    paddingVertical: spacing.sm,
  },
  headerTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  journeyButton: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  journeyButtonActive: {
    backgroundColor: colors.ivory,
    borderColor: colors.ivory,
  },
  journeyButtonText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  journeyButtonTextActive: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
  },
  journeyFlex: {
    flex: 1,
  },
  journeyRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  optionsGrid: {
    gap: spacing.xs,
  },
  optionFull: {
    width: '100%',
  },
  resetButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.primaryButtonHeight,
    paddingHorizontal: spacing.md,
  },
  resetText: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.base,
  },
  scrollContent: {
    gap: spacing.lg,
    paddingHorizontal: layout.screenGutter,
    paddingVertical: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 1.2,
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '85%',
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.xl,
  },
});
