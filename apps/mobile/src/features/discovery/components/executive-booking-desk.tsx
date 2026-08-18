import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, layout, radii, spacing, typography } from '@mmg/brand';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { LuxuryCard } from '@/components/ui/luxury-card';
import { addDaysToDateOnly, formatLagosDateOnly, todayLagosDateOnly } from '../data/lagos-destinations';

export type ExecutiveBookingDeskProps = {
  areaLabel: string;
  onPressArea(): void;
  onExploreFleet(params: {
    area: string;
    startDate: string;
    endDate: string;
    durationDays: number;
    journeyLabel: string;
  }): void;
};

const DURATION_PRESETS = [
  { label: '1 Day', days: 1, caption: 'Daily Escort' },
  { label: '3 Days', days: 3, caption: 'Weekend / Short' },
  { label: '7 Days', days: 7, caption: 'Weekly Retainer' },
  { label: '14 Days', days: 14, caption: 'Fortnight Escort' },
];

export function ExecutiveBookingDesk({
  areaLabel,
  onPressArea,
  onExploreFleet,
}: ExecutiveBookingDeskProps) {
  // Start date offset: 0 for Today, 1 for Tomorrow, 2 for Day After
  const [startOffset, setStartOffset] = useState<0 | 1 | 2>(0);
  const [durationDays, setDurationDays] = useState<number>(3);

  const today = todayLagosDateOnly();
  const startDate = useMemo(() => addDaysToDateOnly(today, startOffset), [today, startOffset]);
  const endDate = useMemo(() => addDaysToDateOnly(startDate, durationDays), [startDate, durationDays]);

  const formattedStart = useMemo(() => formatLagosDateOnly(startDate), [startDate]);
  const formattedEnd = useMemo(() => formatLagosDateOnly(endDate), [endDate]);

  const handleDecreaseDays = () => {
    if (durationDays > 1) {
      setDurationDays((prev) => prev - 1);
    }
  };

  const handleIncreaseDays = () => {
    if (durationDays < 30) {
      setDurationDays((prev) => prev + 1);
    }
  };

  const handleExplore = () => {
    const journeyLabel =
      durationDays === 1
        ? startOffset === 0
          ? 'Today'
          : 'Tomorrow'
        : `${durationDays} Days`;

    onExploreFleet({
      area: areaLabel,
      startDate,
      endDate,
      durationDays,
      journeyLabel,
    });
  };

  return (
    <LuxuryCard style={styles.card}>
      {/* Header Eyebrow & Title */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>CHAUFFEURED MOBILITY · LAGOS</Text>
        <Text style={styles.title}>Reserve Executive Escort</Text>
        <Text style={styles.subtitle}>
          Tailored chauffeured transport with vetted executive security drivers across Lagos.
        </Text>
      </View>

      {/* Lagos Dispatch Area Field */}
      <View style={styles.sectionGroup}>
        <Text style={styles.sectionLabel}>DISPATCH REGION</Text>
        <PressableScale
          accessibilityLabel={`Dispatch zone, ${areaLabel}`}
          accessibilityRole="button"
          onPress={onPressArea}
        >
          <View style={styles.areaRow}>
            <View style={styles.areaIcon}>
              <Ionicons color={colors.goldStrong} name="location-outline" size={18} />
            </View>
            <View style={styles.areaCopy}>
              <Text style={styles.areaSub}>Lagos Pickup Location</Text>
              <Text style={styles.areaValue}>{areaLabel}</Text>
            </View>
            <View style={styles.changeBadge}>
              <Text style={styles.changeBadgeText}>Change</Text>
              <Ionicons color={colors.goldStrong} name="chevron-down" size={14} />
            </View>
          </View>
        </PressableScale>
      </View>

      {/* Start Date Selector */}
      <View style={styles.sectionGroup}>
        <Text style={styles.sectionLabel}>COMMENCEMENT DATE</Text>
        <View style={styles.dateSegmentRow}>
          {[
            { label: 'Today', offset: 0 },
            { label: 'Tomorrow', offset: 1 },
            { label: 'In 2 Days', offset: 2 },
          ].map((item) => {
            const isSelected = startOffset === item.offset;
            return (
              <PressableScale
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                key={item.label}
                onPress={() => setStartOffset(item.offset as 0 | 1 | 2)}
                style={styles.dateSegmentFlex}
              >
                <View style={[styles.dateSegmentChip, isSelected && styles.dateSegmentChipActive]}>
                  <Text style={[styles.dateSegmentText, isSelected && styles.dateSegmentTextActive]}>
                    {item.label}
                  </Text>
                </View>
              </PressableScale>
            );
          })}
        </View>
      </View>

      {/* Duration Stepper & Presets */}
      <View style={styles.sectionGroup}>
        <View style={styles.durationHeader}>
          <Text style={styles.sectionLabel}>SERVICE DURATION</Text>
          <Text style={styles.durationDaysValue}>
            {durationDays} {durationDays === 1 ? 'Day' : 'Days'}
          </Text>
        </View>

        {/* Stepper Controller */}
        <View style={styles.stepperBox}>
          <PressableScale
            accessibilityLabel="Decrease duration"
            accessibilityRole="button"
            disabled={durationDays <= 1}
            onPress={handleDecreaseDays}
          >
            <View style={[styles.stepperButton, durationDays <= 1 && styles.stepperButtonDisabled]}>
              <Ionicons
                color={durationDays <= 1 ? colors.muted : colors.ivory}
                name="remove"
                size={20}
              />
            </View>
          </PressableScale>

          <View style={styles.stepperCenter}>
            <Text style={styles.stepperNumber}>{durationDays}</Text>
            <Text style={styles.stepperLabel}>
              {durationDays === 1 ? 'Chauffeured Day' : 'Chauffeured Days'}
            </Text>
          </View>

          <PressableScale
            accessibilityLabel="Increase duration"
            accessibilityRole="button"
            disabled={durationDays >= 30}
            onPress={handleIncreaseDays}
          >
            <View style={[styles.stepperButton, durationDays >= 30 && styles.stepperButtonDisabled]}>
              <Ionicons
                color={durationDays >= 30 ? colors.muted : colors.ivory}
                name="add"
                size={20}
              />
            </View>
          </PressableScale>
        </View>

        {/* Quick Duration Preset Pills */}
        <View style={styles.presetsRow}>
          {DURATION_PRESETS.map((preset) => {
            const isSelected = durationDays === preset.days;
            return (
              <PressableScale
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                key={preset.label}
                onPress={() => setDurationDays(preset.days)}
                style={styles.presetFlex}
              >
                <View style={[styles.presetChip, isSelected && styles.presetChipActive]}>
                  <Text style={[styles.presetText, isSelected && styles.presetTextActive]}>
                    {preset.label}
                  </Text>
                </View>
              </PressableScale>
            );
          })}
        </View>
      </View>

      {/* Live Schedule Summary & Guarantee */}
      <View style={styles.scheduleSummaryBox}>
        <View style={styles.scheduleRow}>
          <View style={styles.scheduleCol}>
            <Text style={styles.scheduleLabel}>PICKUP DATE</Text>
            <Text style={styles.scheduleValue}>{formattedStart}</Text>
          </View>
          <Ionicons color={colors.goldStrong} name="arrow-forward" size={16} />
          <View style={styles.scheduleCol}>
            <Text style={styles.scheduleLabel}>RETURN DATE</Text>
            <Text style={styles.scheduleValue}>{formattedEnd}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.guaranteeRow}>
          <Ionicons color={colors.goldStrong} name="shield-checkmark" size={14} />
          <Text style={styles.guaranteeText}>
            Dedicated security-vetted chauffeur & intra-Lagos journey support included.
          </Text>
        </View>
      </View>

      {/* Executive Call to Action */}
      <PressableScale
        accessibilityLabel="Explore Available Fleet"
        accessibilityRole="button"
        onPress={handleExplore}
      >
        <View style={styles.exploreButton}>
          <Ionicons color={colors.black} name="car-sport" size={18} />
          <Text style={styles.exploreText}>EXPLORE AVAILABLE FLEET</Text>
        </View>
      </PressableScale>
    </LuxuryCard>
  );
}

const styles = StyleSheet.create({
  areaCopy: { flex: 1 },
  areaIcon: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  areaRow: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 58,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  areaSub: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
  },
  areaValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
    marginTop: 2,
  },
  card: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  changeBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(227,195,101,0.1)',
    borderColor: 'rgba(227,195,101,0.3)',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  changeBadgeText: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
  },
  dateSegmentChip: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 44,
  },
  dateSegmentChipActive: {
    backgroundColor: colors.ivory,
    borderColor: colors.ivory,
  },
  dateSegmentFlex: { flex: 1 },
  dateSegmentRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  dateSegmentText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  dateSegmentTextActive: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
  },
  divider: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth,
  },
  durationDaysValue: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  durationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  exploreButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: layout.primaryButtonHeight,
    paddingHorizontal: spacing.lg,
  },
  exploreText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
    letterSpacing: 0.8,
  },
  eyebrow: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 1.4,
  },
  guaranteeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  guaranteeText: {
    color: colors.silver,
    flex: 1,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17,
  },
  header: {
    gap: 4,
  },
  presetChip: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.xs,
  },
  presetChipActive: {
    backgroundColor: colors.graphiteRaised,
    borderColor: colors.goldStrong,
  },
  presetFlex: { flex: 1 },
  presetsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  presetText: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
  },
  presetTextActive: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
  },
  scheduleCol: {
    flex: 1,
  },
  scheduleLabel: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  scheduleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scheduleSummaryBox: {
    backgroundColor: colors.graphiteRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    padding: spacing.md,
  },
  scheduleValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  sectionGroup: {
    gap: spacing.xs,
  },
  sectionLabel: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.8,
  },
  stepperBox: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.xs,
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  stepperButtonDisabled: {
    opacity: 0.35,
  },
  stepperCenter: {
    alignItems: 'center',
  },
  stepperLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
    marginTop: 1,
  },
  stepperNumber: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.xl,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.sm,
    lineHeight: 20,
    marginTop: 2,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.display,
    letterSpacing: -0.5,
  },
});
