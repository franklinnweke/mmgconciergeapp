import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type {
  AvailabilityBlockReason,
  GetOwnerVehicleCalendarResult,
  OwnerAvailabilityBlock,
  OwnerVehicleCalendarDay,
} from '@mmg/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import {
  addDaysToDateOnly,
  formatLagosDateOnly,
  todayLagosDateOnly,
} from '@/features/discovery/data/lagos-destinations';

import { createOwnerAvailabilityGateway } from '../data/owner-availability-gateway';
import {
  isDateInSelection,
  selectOwnerAvailabilityDate,
  type AvailabilitySelection,
} from '../domain/owner-availability-calendar';

const EMPTY_SELECTION: AvailabilitySelection = { startDate: null, endDate: null };
const REASONS: { value: AvailabilityBlockReason; label: string; detail: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'maintenance', label: 'Maintenance', detail: 'Workshop, service or inspection', icon: 'build-outline' },
  { value: 'owner_use', label: 'Owner use', detail: 'The vehicle is privately committed', icon: 'key-outline' },
  { value: 'offline', label: 'Temporarily offline', detail: 'Not taking journeys during these dates', icon: 'pause-circle-outline' },
  { value: 'other', label: 'Other', detail: 'Another operational reason', icon: 'ellipsis-horizontal-circle-outline' },
];

function createIdempotencyKey(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function dayNumber(date: string) {
  return String(Number(date.slice(8, 10)));
}

function weekday(date: string) {
  return new Intl.DateTimeFormat('en-NG', { weekday: 'short', timeZone: 'Africa/Lagos' })
    .format(new Date(`${date}T12:00:00+01:00`))
    .slice(0, 2)
    .toUpperCase();
}

function statusLabel(day: OwnerVehicleCalendarDay) {
  if (day.status === 'reserved') return 'Reserved';
  if (day.status === 'owner_block') return 'Blocked by you';
  return 'Available';
}

function safeAvailabilityErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('stale') || message.includes('version') || message.includes('conflict')) {
    return 'The calendar changed while you were working. It has been refreshed; please try again.';
  }
  if (message.includes('permission') || message.includes('forbidden')) {
    return 'You are not authorized to manage this vehicle calendar.';
  }
  return 'Availability is temporarily unavailable. Please try again.';
}

export function OwnerVehicleAvailabilityScreen() {
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gateway = useMemo(() => createOwnerAvailabilityGateway(), []);
  const [calendar, setCalendar] = useState<GetOwnerVehicleCalendarResult | null>(null);
  const [selection, setSelection] = useState<AvailabilitySelection>(EMPTY_SELECTION);
  const [reason, setReason] = useState<AvailabilityBlockReason>('maintenance');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(() => todayLagosDateOnly(), []);
  const windowEndDate = useMemo(() => addDaysToDateOnly(today, 35), [today]);
  const compactCalendar = viewportWidth < 390;
  const horizontalGutter = compactCalendar ? 3 : spacing.lg;
  const calendarGap = compactCalendar ? 1 : 5;
  const calendarDayWidth = Math.max(
    44,
    Math.floor((viewportWidth - horizontalGutter * 2 - calendarGap * 6) / 7),
  );

  const loadCalendar = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setError('Vehicle reference is missing.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await gateway.getCalendar({
        vehicleId: id,
        windowStartDate: today,
        windowEndDate,
      });
      setCalendar(result);
    } catch (caught) {
      setError(safeAvailabilityErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [gateway, id, today, windowEndDate]);

  useEffect(() => {
    const task = setTimeout(() => void loadCalendar(), 0);
    return () => clearTimeout(task);
  }, [loadCalendar]);

  const handleDatePress = (date: string) => {
    if (!calendar || submitting) return;
    const result = selectOwnerAvailabilityDate(selection, date, calendar.days);
    setSelection(result.selection);
    setError(result.error);
  };

  const handleCreateBlock = async () => {
    if (!calendar || !selection.startDate || !selection.endDate || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await gateway.setBlock({
        vehicleId: calendar.vehicleId,
        startDate: selection.startDate,
        endDate: selection.endDate,
        reason,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        expectedAvailabilityVersion: calendar.availabilityVersion,
      }, createIdempotencyKey('owner_availability_set'));
      setSelection(EMPTY_SELECTION);
      setNotes('');
      await loadCalendar();
    } catch (caught) {
      setError(safeAvailabilityErrorMessage(caught));
      await loadCalendar();
    } finally {
      setSubmitting(false);
    }
  };

  const removeBlock = (block: OwnerAvailabilityBlock) => {
    if (!calendar || submitting) return;
    Alert.alert(
      'Make these dates available?',
      `${formatLagosDateOnly(block.startDate)} through ${formatLagosDateOnly(addDaysToDateOnly(block.endDate, -1))} will reopen for booking.`,
      [
        { text: 'Keep blocked', style: 'cancel' },
        {
          text: 'Make available',
          style: 'destructive',
          onPress: () => {
            setSubmitting(true);
            setError(null);
            void gateway.removeBlock({
              vehicleId: calendar.vehicleId,
              blockId: block.blockId,
              expectedBlockVersion: block.version,
              expectedAvailabilityVersion: calendar.availabilityVersion,
            }, createIdempotencyKey('owner_availability_remove'))
              .then(() => loadCalendar())
              .catch((caught: unknown) => {
                setError(safeAvailabilityErrorMessage(caught));
                return loadCalendar();
              })
              .finally(() => setSubmitting(false));
          },
        },
      ],
    );
  };

  const refreshAction = (
    <PressableScale
      accessibilityLabel="Refresh availability"
      accessibilityRole="button"
      disabled={loading}
      onPress={() => void loadCalendar()}
      style={styles.headerAction}
    >
      <Ionicons color={colors.ivory} name="refresh" size={19} />
    </PressableScale>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <ScreenHeader
          onBack={() => router.back()}
          right={refreshAction}
          showBrand={false}
          title="Vehicle availability"
        />
      </View>

      {loading && !calendar ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.goldStrong} size="large" />
          <Text style={styles.stateText}>Loading vehicle calendar…</Text>
        </View>
      ) : !calendar ? (
        <View style={styles.centerState}>
          <Ionicons color={colors.danger} name="cloud-offline-outline" size={34} />
          <Text style={styles.stateTitle}>Calendar unavailable</Text>
          <Text style={styles.stateText}>{error ?? 'Check your connection and try again.'}</Text>
          <PressableScale onPress={() => void loadCalendar()} style={styles.retryButton}>
            <Text style={styles.retryText}>TRY AGAIN</Text>
          </PressableScale>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingHorizontal: horizontalGutter }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>
            Block dates when unavailable.
          </Text>

          {Platform.OS === 'web' && process.env.NODE_ENV !== 'production' ? (
            <Text style={styles.previewNotice}>WEB PREVIEW · SAMPLE AVAILABILITY</Text>
          ) : null}

          {error ? (
            <View accessibilityLiveRegion="polite" style={styles.errorBanner}>
              <Ionicons color={colors.danger} name="alert-circle-outline" size={18} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.sectionHeadingRow}>
            <View>
              <Text style={styles.sectionTitle}>Next five weeks</Text>
              <Text style={styles.sectionMeta}>{formatLagosDateOnly(today)} — {formatLagosDateOnly(addDaysToDateOnly(windowEndDate, -1))}</Text>
            </View>
            {loading ? <ActivityIndicator color={colors.goldStrong} /> : null}
          </View>

          <View style={styles.legendRow}>
            <Legend color={colors.goldStrong} label="Your block" />
            <Legend color={colors.muted} label="Reserved" />
            <Legend color={colors.graphiteRaised} label="Available" />
          </View>

          <View style={[styles.calendarGrid, { gap: calendarGap }]}>
            {calendar.days.map((day) => {
              const selected = isDateInSelection(day.date, selection);
              const disabled = day.status !== 'available' || submitting;
              return (
                <PressableScale
                  accessibilityLabel={`${formatLagosDateOnly(day.date)}, ${statusLabel(day)}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled, selected }}
                  disabled={disabled}
                  key={day.date}
                  onPress={() => handleDatePress(day.date)}
                  style={[
                    styles.dayButton,
                    { width: calendarDayWidth },
                    day.status === 'owner_block' && styles.ownerBlockedDay,
                    day.status === 'reserved' && styles.reservedDay,
                    selected && styles.selectedDay,
                  ]}
                >
                  <Text style={[styles.weekday, selected && styles.selectedDayText]}>{weekday(day.date)}</Text>
                  <Text style={[styles.dayNumber, selected && styles.selectedDayText]}>{dayNumber(day.date)}</Text>
                  {day.status !== 'available' ? (
                    <Ionicons
                      color={day.status === 'owner_block' ? colors.goldStrong : colors.muted}
                      name={day.status === 'owner_block' ? 'remove-circle' : 'lock-closed'}
                      size={11}
                    />
                  ) : <View style={styles.iconSpacer} />}
                </PressableScale>
              );
            })}
          </View>

          <View style={styles.selectionSummary}>
            <Ionicons color={colors.goldStrong} name="calendar-outline" size={20} />
            <View style={styles.selectionCopy}>
              <Text style={styles.selectionLabel}>DATES TO BLOCK</Text>
              <Text style={styles.selectionValue}>
                {selection.startDate
                  ? selection.endDate
                    ? `${formatLagosDateOnly(selection.startDate)} through ${formatLagosDateOnly(addDaysToDateOnly(selection.endDate, -1))}`
                    : `${formatLagosDateOnly(selection.startDate)} — choose the last day`
                  : 'Choose the first unavailable day'}
              </Text>
            </View>
            {selection.startDate ? (
              <PressableScale accessibilityLabel="Clear selected dates" accessibilityRole="button" onPress={() => setSelection(EMPTY_SELECTION)} style={styles.clearButton}>
                <Ionicons color={colors.muted} name="close" size={18} />
              </PressableScale>
            ) : null}
          </View>

          {selection.endDate ? (
            <View style={styles.composer}>
              <Text style={styles.sectionTitle}>Why is it unavailable?</Text>
              <Text style={styles.sectionMeta}>Only you and MMG see this.</Text>
              <View style={styles.reasonList}>
                {REASONS.map((item) => {
                  const active = reason === item.value;
                  return (
                    <PressableScale
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      key={item.value}
                      onPress={() => setReason(item.value)}
                      style={styles.reasonRow}
                    >
                      <Ionicons color={active ? colors.goldStrong : colors.muted} name={item.icon} size={21} />
                      <View style={styles.reasonCopy}>
                        <Text style={styles.reasonLabel}>{item.label}</Text>
                        <Text style={styles.reasonDetail}>{item.detail}</Text>
                      </View>
                      <Ionicons color={active ? colors.goldStrong : colors.muted} name={active ? 'radio-button-on' : 'radio-button-off'} size={20} />
                    </PressableScale>
                  );
                })}
              </View>
              <TextInput
                accessibilityLabel="Private availability note"
                maxLength={500}
                multiline
                onChangeText={setNotes}
                placeholder="Private note (optional)"
                placeholderTextColor={colors.muted}
                style={styles.notesInput}
                value={notes}
              />
              <PressableScale
                accessibilityRole="button"
                disabled={submitting}
                onPress={() => void handleCreateBlock()}
                style={[styles.primaryButton, submitting && styles.disabledButton]}
              >
                {submitting ? <ActivityIndicator color={colors.black} /> : null}
                <Text style={styles.primaryButtonText}>BLOCK SELECTED DATES</Text>
              </PressableScale>
            </View>
          ) : null}

          <View style={styles.existingSection}>
            <Text style={styles.sectionTitle}>Your current blocks</Text>
            {calendar.ownerBlocks.length === 0 ? (
              <Text style={styles.emptyText}>No blocked dates.</Text>
            ) : calendar.ownerBlocks.map((block) => (
              <View key={block.blockId} style={styles.blockRow}>
                <View style={styles.blockDateRail} />
                <View style={styles.blockCopy}>
                  <Text style={styles.blockDates}>
                    {formatLagosDateOnly(block.startDate)} — {formatLagosDateOnly(addDaysToDateOnly(block.endDate, -1))}
                  </Text>
                  <Text style={styles.blockReason}>{block.reason.replace('_', ' ')}</Text>
                </View>
                <PressableScale
                  accessibilityLabel={`Remove block beginning ${formatLagosDateOnly(block.startDate)}`}
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={() => removeBlock(block)}
                  style={styles.removeButton}
                >
                  <Ionicons color={colors.danger} name="trash-outline" size={18} />
                </PressableScale>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  blockCopy: { flex: 1, gap: 3 },
  blockDateRail: { alignSelf: 'stretch', backgroundColor: colors.goldStrong, width: 3 },
  blockDates: { color: colors.ivory, fontFamily: typography.body, fontSize: 14, fontWeight: '600' },
  blockReason: { color: colors.muted, fontFamily: typography.body, fontSize: 12, textTransform: 'capitalize' },
  blockRow: { alignItems: 'center', borderBottomColor: colors.graphiteRaised, borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 72 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  centerState: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl },
  clearButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  composer: { borderTopColor: colors.graphiteRaised, borderTopWidth: 1, gap: spacing.md, marginTop: spacing.xl, paddingTop: spacing.xl },
  content: { paddingBottom: 64 },
  dayButton: { alignItems: 'center', backgroundColor: colors.graphite, borderColor: 'transparent', borderRadius: radii.sm, borderWidth: 1, height: 60, justifyContent: 'center' },
  dayNumber: { color: colors.ivory, fontFamily: typography.body, fontSize: 16, fontWeight: '700' },
  disabledButton: { opacity: 0.55 },
  emptyText: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, paddingVertical: spacing.lg },
  errorBanner: { alignItems: 'center', backgroundColor: 'rgba(209,133,120,0.09)', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, padding: spacing.md },
  errorText: { color: colors.silver, flex: 1, fontFamily: typography.body, fontSize: 13, lineHeight: 19 },
  existingSection: { borderTopColor: colors.graphiteRaised, borderTopWidth: 1, marginTop: spacing.xl, paddingTop: spacing.xl },
  header: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerAction: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, height: 44, justifyContent: 'center', width: 44 },
  iconSpacer: { height: 11 },
  intro: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 21, marginBottom: spacing.lg },
  legendDot: { borderRadius: 4, height: 8, width: 8 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  legendRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  legendText: { color: colors.muted, fontFamily: typography.body, fontSize: 11 },
  notesInput: { backgroundColor: colors.graphite, borderColor: colors.graphiteRaised, borderRadius: radii.sm, borderWidth: 1, color: colors.ivory, fontFamily: typography.body, fontSize: 14, minHeight: 88, padding: spacing.md, textAlignVertical: 'top' },
  ownerBlockedDay: { borderColor: colors.goldStrong },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.sm, flexDirection: 'row', gap: spacing.sm, height: 56, justifyContent: 'center' },
  primaryButtonText: { color: colors.black, fontFamily: typography.body, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  previewNotice: { color: colors.goldStrong, fontFamily: typography.body, fontSize: 11, fontWeight: '700', letterSpacing: 0.7, marginBottom: spacing.lg },
  reasonCopy: { flex: 1 },
  reasonDetail: { color: colors.muted, fontFamily: typography.body, fontSize: 12, marginTop: 2 },
  reasonLabel: { color: colors.ivory, fontFamily: typography.body, fontSize: 14, fontWeight: '600' },
  reasonList: { borderTopColor: colors.graphiteRaised, borderTopWidth: 1 },
  reasonRow: { alignItems: 'center', borderBottomColor: colors.graphiteRaised, borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 66 },
  removeButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  reservedDay: { backgroundColor: colors.graphiteRaised, opacity: 0.58 },
  retryButton: { backgroundColor: colors.goldStrong, borderRadius: radii.sm, marginTop: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  retryText: { color: colors.black, fontFamily: typography.body, fontSize: 12, fontWeight: '800' },
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  sectionHeadingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  sectionMeta: { color: colors.muted, fontFamily: typography.body, fontSize: 12, marginTop: 3 },
  sectionTitle: { color: colors.ivory, fontFamily: typography.body, fontSize: 18, fontWeight: '700' },
  selectedDay: { backgroundColor: colors.goldStrong, borderColor: colors.goldStrong },
  selectedDayText: { color: colors.black },
  selectionCopy: { flex: 1 },
  selectionLabel: { color: colors.goldStrong, fontFamily: typography.body, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  selectionSummary: { alignItems: 'center', borderBottomColor: colors.graphiteRaised, borderBottomWidth: 1, borderTopColor: colors.graphiteRaised, borderTopWidth: 1, flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, minHeight: 72 },
  selectionValue: { color: colors.ivory, fontFamily: typography.body, fontSize: 13, marginTop: 4 },
  stateText: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, marginTop: spacing.sm, textAlign: 'center' },
  stateTitle: { color: colors.ivory, fontFamily: typography.body, fontSize: 18, fontWeight: '700', marginTop: spacing.md },
  weekday: { color: colors.muted, fontFamily: typography.body, fontSize: 11, fontWeight: '700' },
});
