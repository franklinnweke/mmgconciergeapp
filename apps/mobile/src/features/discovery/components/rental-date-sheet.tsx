import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radii, spacing, typography } from '@mmg/brand';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { adjustRentalDuration, resolveRentalJourney } from '../data/rental-journey';
import {
  addDaysToDateOnly,
  formatLagosDateOnly,
  todayLagosDateOnly,
} from '../data/lagos-destinations';

type RentalDateSheetProps = {
  endDate: string;
  onApply(startDate: string, endDate: string): void;
  onClose(): void;
  startDate: string;
  visible: boolean;
};

type DateOption = {
  date: string;
  primary: string;
  secondary: string;
};

function optionCopy(dateOnly: string, offset: number) {
  const date = new Date(`${dateOnly}T12:00:00+01:00`);
  const primary = offset === 0
    ? 'Today'
    : offset === 1
      ? 'Tomorrow'
      : new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short' }).format(date);
  const secondary = new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lagos',
  }).format(date);
  return { primary, secondary };
}

export function RentalDateSheet({
  endDate,
  onApply,
  onClose,
  startDate,
  visible,
}: RentalDateSheetProps) {
  const insets = useSafeAreaInsets();
  const initialJourney = useMemo(() => resolveRentalJourney(startDate, endDate), [endDate, startDate]);
  const [draftStart, setDraftStart] = useState(initialJourney.startDate);
  const [draftDuration, setDraftDuration] = useState(initialJourney.durationDays);
  const today = todayLagosDateOnly();

  const dateOptions = useMemo<DateOption[]>(() => {
    const options = Array.from({ length: 30 }, (_, offset) => {
      const date = addDaysToDateOnly(today, offset);
      return { date, ...optionCopy(date, offset) };
    });
    if (!options.some((item) => item.date === initialJourney.startDate)) {
      options.push({
        date: initialJourney.startDate,
        primary: 'Current',
        secondary: formatLagosDateOnly(initialJourney.startDate),
      });
    }
    return options;
  }, [initialJourney.startDate, today]);

  const draftEnd = useMemo(
    () => addDaysToDateOnly(draftStart, draftDuration),
    [draftDuration, draftStart],
  );

  const apply = () => {
    onApply(draftStart, draftEnd);
    onClose();
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel="Close date picker" onPress={onClose} style={styles.backdrop} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" style={styles.title}>Choose dates</Text>
            </View>
            <PressableScale accessibilityRole="button" onPress={apply}>
              <Text style={styles.doneText}>Done</Text>
            </PressableScale>
          </View>

          <Text style={styles.label}>Start</Text>
          <ScrollView contentContainerStyle={styles.dateRail} horizontal showsHorizontalScrollIndicator={false}>
            {dateOptions.map((option) => {
              const selected = option.date === draftStart;
              return (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option.date}
                  onPress={() => setDraftStart(option.date)}
                >
                  <View style={[styles.dateChip, selected && styles.dateChipSelected]}>
                    <Text style={[styles.datePrimary, selected && styles.datePrimarySelected]}>{option.primary}</Text>
                    <Text style={[styles.dateSecondary, selected && styles.dateSecondarySelected]}>{option.secondary}</Text>
                  </View>
                </PressableScale>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Duration</Text>
          <View style={styles.durationRow}>
            <PressableScale
              accessibilityLabel="Shorten rental by one day"
              accessibilityRole="button"
              accessibilityState={{ disabled: draftDuration === 1 }}
              disabled={draftDuration === 1}
              onPress={() => setDraftDuration((days) => adjustRentalDuration(days, -1))}
            >
              <View style={styles.durationButton}>
                <Ionicons color={draftDuration === 1 ? colors.muted : colors.ivory} name="remove" size={22} />
              </View>
            </PressableScale>
            <Text accessibilityLiveRegion="polite" style={styles.durationText}>
              {draftDuration} {draftDuration === 1 ? 'day' : 'days'}
            </Text>
            <PressableScale
              accessibilityLabel="Extend rental by one day"
              accessibilityRole="button"
              accessibilityState={{ disabled: draftDuration === 30 }}
              disabled={draftDuration === 30}
              onPress={() => setDraftDuration((days) => adjustRentalDuration(days, 1))}
            >
              <View style={styles.durationButton}>
                <Ionicons color={draftDuration === 30 ? colors.muted : colors.ivory} name="add" size={22} />
              </View>
            </PressableScale>
          </View>

          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Trip</Text>
            <Text style={styles.summaryValue}>
              {formatLagosDateOnly(draftStart)} – {formatLagosDateOnly(draftEnd)}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill },
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
  durationButton: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 46,
  },
  durationRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  durationText: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: fontSizes.sm },
  handle: { alignSelf: 'center', backgroundColor: colors.lineStrong, borderRadius: radii.pill, height: 4, marginBottom: spacing.md, width: 42 },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  headerCopy: { flex: 1, minWidth: 0 },
  label: { color: colors.muted, fontFamily: typography.bodySemiBold, fontSize: fontSizes.xs, marginBottom: spacing.sm, marginTop: spacing.md },
  modalRoot: { backgroundColor: 'rgba(0,0,0,0.58)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.black, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  subtitle: { color: colors.muted, fontFamily: typography.body, fontSize: fontSizes.xs, lineHeight: 18, marginTop: 4 },
  summary: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, gap: 3, marginTop: spacing.lg, paddingTop: spacing.md },
  summaryLabel: { color: colors.muted, fontFamily: typography.body, fontSize: fontSizes.xs },
  summaryValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.base },
  title: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: fontSizes.xl },
});
