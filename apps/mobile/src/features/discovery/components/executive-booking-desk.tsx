import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, layout, radii, spacing, typography } from '@mmg/brand';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { adjustRentalDuration } from '../data/rental-journey';
import {
  addDaysToDateOnly,
  formatLagosDateOnly,
  todayLagosDateOnly,
} from '../data/lagos-destinations';
import {
  DEFAULT_PICKUP_LOCATION,
  parsePickupLocation,
  type PickupLocation,
} from '../domain/pickup-location';

export type JourneyPlan = {
  area: string;
  pickup: PickupLocation;
  startDate: string;
  endDate: string;
  durationDays: number;
  journeyLabel: string;
};

export type ExecutiveBookingDeskProps = {
  areaLabel?: string;
  pickup?: PickupLocation;
  onPlanChange?(plan: JourneyPlan): void;
  onPressArea(): void;
  onExploreFleet(plan: JourneyPlan): void;
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
  pickup: propPickup,
  onPlanChange,
  onPressArea,
  onExploreFleet,
}: ExecutiveBookingDeskProps) {
  const pickup = propPickup ?? (areaLabel ? parsePickupLocation(areaLabel) : DEFAULT_PICKUP_LOCATION);
  const insets = useSafeAreaInsets();
  const [startOffset, setStartOffset] = useState(0);
  const [durationDays, setDurationDays] = useState(3);
  const [datesOpen, setDatesOpen] = useState(false);

  const today = todayLagosDateOnly();
  const dateOptions = useMemo<DateOption[]>(
    () => Array.from({ length: 14 }, (_, offset) => {
      const date = addDaysToDateOnly(today, offset);
      return { date, offset, ...dateOptionCopy(date, offset) };
    }),
    [today],
  );

  const startDate = useMemo(() => addDaysToDateOnly(today, startOffset), [startOffset, today]);
  const endDate = useMemo(() => addDaysToDateOnly(startDate, durationDays), [durationDays, startDate]);
  const formattedStart = useMemo(() => formatLagosDateOnly(startDate), [startDate]);
  const formattedEnd = useMemo(() => formatLagosDateOnly(endDate), [endDate]);
  const journeyLabel = startOffset === 0 ? 'Today' : startOffset === 1 ? 'Tomorrow' : formattedStart;

  const plan = useMemo<JourneyPlan>(() => ({
    area: pickup.serviceAreaLabel,
    pickup,
    startDate,
    endDate,
    durationDays,
    journeyLabel,
  }), [pickup, durationDays, endDate, journeyLabel, startDate]);

  useEffect(() => {
    onPlanChange?.(plan);
  }, [onPlanChange, plan]);

  return (
    <View style={styles.container}>
      <View style={styles.summaryShell}>
        <PressableScale
          accessibilityLabel={`Pickup location, ${pickup.displayName}, ${pickup.formattedAddress}. Change pickup location`}
          accessibilityRole="button"
          onPress={onPressArea}
        >
          <View style={styles.summaryRow}>
            <View style={styles.summaryIcon}>
              <Ionicons color={colors.goldStrong} name="location-outline" size={20} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryLabel}>Pickup</Text>
              <Text numberOfLines={1} style={styles.summaryValue}>{pickup.displayName}</Text>
              <Text numberOfLines={1} style={styles.summaryMeta}>{pickup.formattedAddress}</Text>
            </View>
            <Text style={styles.editText}>Edit</Text>
          </View>
        </PressableScale>

        <View style={styles.rule} />

        <PressableScale
          accessibilityLabel={`Rental dates, ${formattedStart} to ${formattedEnd}. Change dates`}
          accessibilityRole="button"
          onPress={() => setDatesOpen(true)}
        >
          <View style={styles.summaryRow}>
            <View style={styles.summaryIcon}>
              <Ionicons color={colors.goldStrong} name="calendar-outline" size={20} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryLabel}>Dates</Text>
              <Text numberOfLines={1} style={styles.summaryValue}>
                {formattedStart} – {formattedEnd}
              </Text>
              <Text style={styles.summaryMeta}>{durationDays} {durationDays === 1 ? 'day' : 'days'}</Text>
            </View>
            <Text style={styles.editText}>Edit</Text>
          </View>
        </PressableScale>
      </View>

      <PressableScale accessibilityLabel="Find cars" accessibilityRole="button" haptic onPress={() => onExploreFleet(plan)}>
        <View style={styles.exploreButton}>
          <Text style={styles.exploreText}>Find cars</Text>
        </View>
      </PressableScale>

      <Modal animationType="slide" onRequestClose={() => setDatesOpen(false)} transparent visible={datesOpen}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel="Close date picker" onPress={() => setDatesOpen(false)} style={styles.backdrop} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Choose dates</Text>
                <Text style={styles.sheetSubtitle}>Pickup and return stay together across your search.</Text>
              </View>
              <PressableScale accessibilityRole="button" haptic onPress={() => setDatesOpen(false)}>
                <Text style={styles.doneText}>Done</Text>
              </PressableScale>
            </View>

            <Text style={styles.pickerLabel}>PICKUP</Text>
            <ScrollView contentContainerStyle={styles.dateRail} horizontal showsHorizontalScrollIndicator={false}>
              {dateOptions.map((option) => {
                const selected = option.offset === startOffset;
                return (
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={option.date}
                    onPress={() => setStartOffset(option.offset)}
                  >
                    <View style={[styles.dateChip, selected && styles.dateChipSelected]}>
                      <Text style={[styles.datePrimary, selected && styles.datePrimarySelected]}>{option.primary}</Text>
                      <Text style={[styles.dateSecondary, selected && styles.dateSecondarySelected]}>{option.secondary}</Text>
                    </View>
                  </PressableScale>
                );
              })}
            </ScrollView>

            <Text style={styles.pickerLabel}>DURATION</Text>
            <View style={styles.durationGrid}>
              <PressableScale accessibilityLabel="Shorten rental by one day" accessibilityRole="button" accessibilityState={{ disabled: durationDays === 1 }} disabled={durationDays === 1} onPress={() => setDurationDays((days) => adjustRentalDuration(days, -1))}>
                <View style={styles.durationChip}><Ionicons name="remove" size={22} color={durationDays === 1 ? colors.muted : colors.ivory} /></View>
              </PressableScale>
              <Text accessibilityLiveRegion="polite" style={styles.durationText}>{durationDays} {durationDays === 1 ? 'day' : 'days'}</Text>
              <PressableScale accessibilityLabel="Extend rental by one day" accessibilityRole="button" accessibilityState={{ disabled: durationDays === 30 }} disabled={durationDays === 30} onPress={() => setDurationDays((days) => adjustRentalDuration(days, 1))}>
                <View style={styles.durationChip}><Ionicons name="add" size={22} color={durationDays === 30 ? colors.muted : colors.ivory} /></View>
              </PressableScale>
            </View>

            <View style={styles.rangeSummary}>
              <Text style={styles.rangeLabel}>Your trip</Text>
              <Text style={styles.rangeValue}>{formattedStart} – {formattedEnd}</Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill },
  container: { gap: spacing.sm, paddingHorizontal: spacing.md },
  dateChip: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 62,
    minWidth: 86,
    paddingHorizontal: spacing.sm,
  },
  dateChipSelected: { backgroundColor: colors.ivory, borderColor: colors.ivory },
  datePrimary: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.sm },
  datePrimarySelected: { color: colors.black },
  dateRail: { gap: spacing.xs, paddingBottom: spacing.lg },
  dateSecondary: { color: colors.muted, fontFamily: typography.body, fontSize: fontSizes.xs, marginTop: 3 },
  dateSecondarySelected: { color: colors.graphiteRaised },
  doneText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: fontSizes.base, padding: spacing.sm },
  durationChip: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 46,
  },
  durationGrid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  durationText: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: fontSizes.sm },
  editText: { color: colors.goldStrong, fontFamily: typography.bodyMedium, fontSize: fontSizes.xs },
  exploreButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: layout.primaryButtonHeight,
  },
  exploreText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: fontSizes.base },
  modalRoot: { backgroundColor: 'rgba(0,0,0,0.58)', flex: 1, justifyContent: 'flex-end' },
  pickerLabel: { color: colors.muted, fontFamily: typography.bodySemiBold, fontSize: fontSizes.xs, letterSpacing: 1.2, marginBottom: spacing.sm, marginTop: spacing.md },
  rangeLabel: { color: colors.muted, fontFamily: typography.body, fontSize: fontSizes.xs },
  rangeSummary: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, gap: 3, marginTop: spacing.lg, paddingTop: spacing.md },
  rangeValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.base },
  rule: { backgroundColor: colors.line, height: StyleSheet.hairlineWidth, marginLeft: 52 },
  sheet: {
    backgroundColor: colors.black,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetHandle: { alignSelf: 'center', backgroundColor: colors.lineStrong, borderRadius: radii.pill, height: 4, marginBottom: spacing.md, width: 42 },
  sheetHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  sheetSubtitle: { color: colors.muted, fontFamily: typography.body, fontSize: fontSizes.xs, marginTop: 4, maxWidth: 270 },
  sheetTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.xl },
  summaryCopy: { flex: 1, gap: 2, minWidth: 0 },
  summaryIcon: { alignItems: 'center', height: 42, justifyContent: 'center', width: 34 },
  summaryLabel: { color: colors.muted, fontFamily: typography.body, fontSize: fontSizes.xs },
  summaryMeta: { color: colors.muted, fontFamily: typography.body, fontSize: fontSizes.xs },
  summaryRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 64, paddingHorizontal: spacing.md },
  summaryShell: { borderColor: colors.line, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  summaryValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.base },
});
