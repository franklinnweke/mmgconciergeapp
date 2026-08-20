import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radii, spacing, typography } from '@mmg/brand';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';

import { LuxuryCard } from './luxury-card';

type JourneyChoice = {
  label: string;
};

type BookingControlProps = {
  areaLabel: string;
  journeyOptions: readonly JourneyChoice[];
  onFind(): void;
  onPressArea(): void;
  onSelectJourney(label: string): void;
  pickupLabel: string;
  returnLabel: string;
  selectedJourney: string;
};

export function BookingControl({
  areaLabel,
  journeyOptions,
  onFind,
  onPressArea,
  onSelectJourney,
  pickupLabel,
  returnLabel,
  selectedJourney,
}: BookingControlProps) {
  return (
    <LuxuryCard style={styles.card}>
      <Text style={styles.prompt}>Where would you like to travel?</Text>
      <PressableScale
        accessibilityLabel={`Pickup area, ${areaLabel}`}
        accessibilityRole="button"
        onPress={onPressArea}
      >
        <View style={styles.areaRow}>
          <View style={styles.areaIcon}>
            <Ionicons color={colors.goldStrong} name="location-outline" size={18} />
          </View>
          <View style={styles.areaCopy}>
            <Text style={styles.fieldLabel}>Pickup in Lagos</Text>
            <Text style={styles.fieldValue}>{areaLabel}</Text>
          </View>
          <Ionicons color={colors.muted} name="chevron-down" size={18} />
        </View>
      </PressableScale>

      <View style={styles.dateRow}>
        <View style={styles.dateBlock}>
          <Text style={styles.fieldLabel}>Pickup</Text>
          <Text style={styles.fieldValue}>{pickupLabel}</Text>
        </View>
        <Ionicons color={colors.gold} name="arrow-forward" size={16} />
        <View style={styles.dateBlock}>
          <Text style={styles.fieldLabel}>Return</Text>
          <Text style={styles.fieldValue}>{returnLabel}</Text>
        </View>
      </View>

      <View style={styles.journeyRow}>
        {journeyOptions.map((option) => {
          const selected = option.label === selectedJourney;
          return (
            <PressableScale
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option.label}
              onPress={() => onSelectJourney(option.label)}
              style={styles.journeyFlex}
            >
              <View style={[styles.journeyChip, selected && styles.journeyChipSelected]}>
                <Text style={[styles.journeyText, selected && styles.journeyTextSelected]}>
                  {option.label}
                </Text>
              </View>
            </PressableScale>
          );
        })}
      </View>

      <PressableScale accessibilityLabel="Find cars" accessibilityRole="button" onPress={onFind}>
        <View style={styles.findButton}>
          <Text style={styles.findText}>Find cars</Text>
          <Ionicons color={colors.black} name="arrow-forward" size={18} />
        </View>
      </PressableScale>
    </LuxuryCard>
  );
}

const styles = StyleSheet.create({
  areaCopy: { flex: 1 },
  areaIcon: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  areaRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    paddingVertical: spacing.sm,
  },
  card: { gap: spacing.md },
  dateBlock: { flex: 1 },
  dateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.6,
  },
  fieldValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
    marginTop: 3,
  },
  findButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
  },
  findText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.md,
  },
  journeyChip: {
    alignItems: 'center',
    borderRadius: radii.pill,
    minHeight: 44,
    justifyContent: 'center',
  },
  journeyChipSelected: { backgroundColor: colors.graphiteRaised },
  journeyFlex: { flex: 1 },
  journeyRow: {
    backgroundColor: colors.black,
    borderRadius: radii.pill,
    flexDirection: 'row',
    padding: 4,
  },
  journeyText: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  journeyTextSelected: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
  },
  prompt: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.lg,
  },
});
