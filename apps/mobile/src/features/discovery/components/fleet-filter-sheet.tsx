import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, layout, radii, spacing, typography } from '@mmg/brand';
import { VehicleCategory } from '@mmg/contracts';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';

import { fleetCategories } from '../data/lagos-destinations';

export type FleetFilterState = {
  category: VehicleCategory | undefined;
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
  const [selectedCategory, setSelectedCategory] = useState<VehicleCategory | undefined>(
    currentFilters.category,
  );

  const handleReset = () => {
    setSelectedCategory(undefined);
  };

  const handleApply = () => {
    onApply({
      category: selectedCategory,
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
            <Text style={styles.title}>Filters</Text>
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
            {/* Section: Vehicle type */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Vehicle type</Text>
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
                      All cars
                    </Text>
                  </View>
                </PressableScale>
                {fleetCategories.map((cat) => {
                  if (cat.value === undefined) return null;
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
                    ? `Show ${totalResultsCount} ${totalResultsCount === 1 ? 'car' : 'cars'}`
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
    borderRadius: radii.button,
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
