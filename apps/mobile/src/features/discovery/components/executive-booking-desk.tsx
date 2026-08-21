import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, layout, radii, spacing, typography } from '@mmg/brand';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import {
  addDaysToDateOnly,
  formatLagosDateOnly,
  todayLagosDateOnly,
} from '../data/lagos-destinations';

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

type DateOption = {
  date: string;
  offset: number;
  primary: string;
  secondary: string;
};

function dateOptionCopy(dateOnly: string, offset: number): Omit<DateOption, 'date' | 'offset'> {
  const date = new Date(`${dateOnly}T12:00:00+01:00`);
  const primary =
    offset === 0
      ? 'Today'
      : offset === 1
        ? 'Tomorrow'
        : new Intl.DateTimeFormat('en-NG', {
            timeZone: 'Africa/Lagos',
            weekday: 'short',
          }).format(date);
  const secondary = new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lagos',
  }).format(date);

  return { primary, secondary };
}

export function ExecutiveBookingDesk({
  areaLabel,
  onPressArea,
  onExploreFleet,
}: ExecutiveBookingDeskProps) {
  const [startOffset, setStartOffset] = useState(0);
  const [durationDays, setDurationDays] = useState(3);

  const today = todayLagosDateOnly();
  const dateOptions = useMemo<DateOption[]>(
    () =>
      Array.from({ length: 14 }, (_, offset) => {
        const date = addDaysToDateOnly(today, offset);
        return {
          date,
          offset,
          ...dateOptionCopy(date, offset),
        };
      }),
    [today],
  );

  const startDate = useMemo(
    () => addDaysToDateOnly(today, startOffset),
    [startOffset, today],
  );
  const endDate = useMemo(
    () => addDaysToDateOnly(startDate, durationDays),
    [durationDays, startDate],
  );

  const formattedStart = useMemo(
    () => formatLagosDateOnly(startDate),
    [startDate],
  );
  const formattedEnd = useMemo(
    () => formatLagosDateOnly(endDate),
    [endDate],
  );

  const handleDecreaseDays = () => {
    if (durationDays > 1) {
      setDurationDays((previous) => previous - 1);
    }
  };

  const handleIncreaseDays = () => {
    if (durationDays < 30) {
      setDurationDays((previous) => previous + 1);
    }
  };

  const handleExplore = () => {
    const journeyLabel =
      startOffset === 0 ? 'Today' : startOffset === 1 ? 'Tomorrow' : formattedStart;

    onExploreFleet({
      area: areaLabel,
      startDate,
      endDate,
      durationDays,
      journeyLabel,
    });
  };

  return (
    <View style={styles.container}>
      <PressableScale
        accessibilityLabel={`Pickup location, ${areaLabel}, Lagos. Change pickup location`}
        accessibilityRole="button"
        onPress={onPressArea}
      >
        <View style={styles.areaRow}>
          <View style={styles.areaIcon}>
            <Ionicons color={colors.goldStrong} name="location-outline" size={20} />
          </View>
          <View style={styles.areaCopy}>
            <Text style={styles.areaPrompt}>Where should we pick you up?</Text>
            <Text numberOfLines={1} style={styles.areaValue}>
              {areaLabel}, Lagos
            </Text>
          </View>
          <Ionicons color={colors.muted} name="chevron-down" size={18} />
        </View>
      </PressableScale>

      <ScrollView
        contentContainerStyle={styles.dateRail}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.dateRailViewport}
      >
        {dateOptions.map((option) => {
          const selected = option.offset === startOffset;

          return (
            <PressableScale
              accessibilityLabel={`Start date ${option.primary}, ${option.secondary}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option.date}
              onPress={() => setStartOffset(option.offset)}
            >
              <View style={[styles.dateChip, selected && styles.dateChipSelected]}>
                <Text style={[styles.datePrimary, selected && styles.datePrimarySelected]}>
                  {option.primary}
                </Text>
                <Text style={[styles.dateSecondary, selected && styles.dateSecondarySelected]}>
                  {option.secondary}
                </Text>
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>

      <View style={styles.stepperBox}>
        <PressableScale
          accessibilityLabel="Decrease rental duration"
          accessibilityRole="button"
          disabled={durationDays <= 1}
          onPress={handleDecreaseDays}
        >
          <View
            style={[
              styles.stepperButton,
              durationDays <= 1 && styles.stepperButtonDisabled,
            ]}
          >
            <Ionicons
              color={durationDays <= 1 ? colors.muted : colors.ivory}
              name="remove"
              size={20}
            />
          </View>
        </PressableScale>

        <Text accessibilityLiveRegion="polite" style={styles.durationText}>
          {durationDays} rental {durationDays === 1 ? 'day' : 'days'}
        </Text>

        <PressableScale
          accessibilityLabel="Increase rental duration"
          accessibilityRole="button"
          disabled={durationDays >= 30}
          onPress={handleIncreaseDays}
        >
          <View
            style={[
              styles.stepperButton,
              durationDays >= 30 && styles.stepperButtonDisabled,
            ]}
          >
            <Ionicons
              color={durationDays >= 30 ? colors.muted : colors.ivory}
              name="add"
              size={20}
            />
          </View>
        </PressableScale>
      </View>

      <View style={styles.scheduleSummary}>
        <View style={[styles.scheduleCol, styles.scheduleColStart]}>
          <Text style={styles.scheduleLabel}>Pickup</Text>
          <Text numberOfLines={1} style={styles.scheduleValue}>
            {formattedStart}
          </Text>
        </View>

        <View style={styles.scheduleArrow}>
          <Ionicons color={colors.goldStrong} name="arrow-forward" size={16} />
        </View>

        <View style={[styles.scheduleCol, styles.scheduleColEnd]}>
          <Text style={styles.scheduleLabel}>Return</Text>
          <Text numberOfLines={1} style={styles.scheduleValue}>
            {formattedEnd}
          </Text>
        </View>
      </View>

      <PressableScale
        accessibilityLabel="Find cars"
        accessibilityRole="button"
        onPress={handleExplore}
      >
        <View style={styles.exploreButton}>
          <Text style={styles.exploreText}>Find cars</Text>
          <Ionicons color={colors.black} name="arrow-forward" size={18} />
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  areaCopy: {
    flex: 1,
    gap: 2,
  },
  areaIcon: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 32,
  },
  areaPrompt: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
  },
  areaRow: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.md,
  },
  areaValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
  },
  container: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  dateChip: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 58,
    minWidth: 88,
    paddingHorizontal: spacing.sm,
  },
  dateChipSelected: {
    backgroundColor: colors.ivory,
    borderColor: colors.ivory,
  },
  datePrimary: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  datePrimarySelected: {
    color: colors.black,
  },
  dateRail: {
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  dateRailViewport: {
    marginRight: -spacing.md,
  },
  dateSecondary: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
    marginTop: 3,
  },
  dateSecondarySelected: {
    color: colors.graphiteRaised,
  },
  durationText: {
    color: colors.ivory,
    flex: 1,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
    textAlign: 'center',
  },
  exploreButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: layout.primaryButtonHeight,
    paddingHorizontal: spacing.lg,
  },
  exploreText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
  },
  scheduleArrow: {
    alignItems: 'center',
    flexBasis: 32,
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: 'center',
  },
  scheduleCol: {
    flex: 1,
    minWidth: 0,
  },
  scheduleColEnd: {
    alignItems: 'flex-end',
  },
  scheduleColStart: {
    alignItems: 'flex-start',
  },
  scheduleLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
  },
  scheduleSummary: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 64,
    paddingVertical: spacing.sm,
  },
  scheduleValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
    marginTop: 3,
  },
  stepperBox: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    padding: spacing.xs,
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderRadius: radii.sm,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  stepperButtonDisabled: {
    opacity: 0.35,
  },
});
