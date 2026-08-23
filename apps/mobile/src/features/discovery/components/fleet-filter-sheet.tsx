import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { type VehicleCategory } from '@mmg/contracts';
import { type ReactNode, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { PrimaryAction, SectionHeading } from '@/components/ui/mobile-primitives';

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
  const [selectedCategory, setSelectedCategory] = useState<VehicleCategory | undefined>(currentFilters.category);
  const [selectedJourney, setSelectedJourney] = useState<JourneyOption>(currentFilters.journey);

  useEffect(() => {
    if (!visible) return;
    setSelectedArea(currentFilters.area);
    setSelectedCategory(currentFilters.category);
    setSelectedJourney(currentFilters.journey);
  }, [currentFilters, visible]);

  const handleReset = () => {
    setSelectedArea('All Lagos');
    setSelectedCategory(undefined);
    setSelectedJourney(journeyOptions[0]);
  };

  const handleApply = () => {
    onApply({ area: selectedArea, category: selectedCategory, journey: selectedJourney });
    onClose();
  };

  const categoryOptions = [
    { label: 'All vehicles', value: undefined },
    ...fleetCategories.filter((category) => category.value).map((category) => ({
      label: category.label,
      value: category.value,
    })),
  ] as const;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close filters" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.handleWrap}><View style={styles.handle} /></View>
          <View style={styles.header}>
            <Text style={styles.title}>Filters</Text>
            <PressableScale accessibilityLabel="Close filters" accessibilityRole="button" onPress={onClose}>
              <View style={styles.closeTarget}><Ionicons color={colors.ivory} name="close" size={22} /></View>
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <FilterSection title="Vehicle">
              {categoryOptions.map((option) => (
                <ChoiceRow
                  key={option.label}
                  label={option.label}
                  onPress={() => setSelectedCategory(option.value)}
                  selected={selectedCategory === option.value}
                />
              ))}
            </FilterSection>

            <FilterSection title="Pickup area">
              {pickupChoices.map((area) => (
                <ChoiceRow
                  key={area}
                  label={area}
                  onPress={() => setSelectedArea(area)}
                  selected={selectedArea === area}
                />
              ))}
            </FilterSection>

            <FilterSection title="Start date">
              {journeyOptions.map((option) => (
                <ChoiceRow
                  key={option.label}
                  label={option.label}
                  onPress={() => setSelectedJourney(option)}
                  selected={selectedJourney.label === option.label}
                />
              ))}
            </FilterSection>
          </ScrollView>

          <View style={styles.footer}>
            <PressableScale accessibilityRole="button" onPress={handleReset} style={styles.resetTarget}>
              <Text style={styles.resetText}>Reset</Text>
            </PressableScale>
            <View style={styles.applyAction}>
              <PrimaryAction
                label={
                  totalResultsCount === undefined
                    ? 'Apply filters'
                    : `Show ${totalResultsCount} ${totalResultsCount === 1 ? 'vehicle' : 'vehicles'}`
                }
                onPress={handleApply}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FilterSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <SectionHeading>{title}</SectionHeading>
      <View style={styles.choiceList}>{children}</View>
    </View>
  );
}

function ChoiceRow({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
    >
      <View style={styles.choiceRow}>
        <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
        <Ionicons
          color={selected ? colors.goldStrong : colors.lineStrong}
          name={selected ? 'radio-button-on' : 'radio-button-off'}
          size={20}
        />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  applyAction: { flex: 1 },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,.68)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  choiceList: {
    marginTop: spacing.sm,
  },
  choiceRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 50,
  },
  choiceText: {
    color: colors.silver,
    fontFamily: typography.body,
    fontSize: 14,
  },
  choiceTextSelected: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
  },
  closeTarget: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  footer: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  handle: {
    backgroundColor: colors.lineStrong,
    borderRadius: radii.pill,
    height: 4,
    width: 36,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  resetTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.sm,
  },
  resetText: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
  },
  scrollContent: {
    gap: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  section: {},
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '88%',
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 25,
  },
});
