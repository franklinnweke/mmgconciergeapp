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
import {
  InlineNotice,
  MobileHeader,
  PrimaryAction,
  SectionHeading,
} from '@/components/ui/mobile-primitives';
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
const REASONS: { value: AvailabilityBlockReason; label: string; detail: string }[] = [
  { value: 'maintenance', label: 'Maintenance', detail: 'Workshop, service or inspection' },
  { value: 'owner_use', label: 'Owner use', detail: 'The vehicle is privately committed' },
  { value: 'offline', label: 'Temporarily offline', detail: 'Not taking journeys during these dates' },
  { value: 'other', label: 'Other', detail: 'Another operational reason' },
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

function reasonLabel(reason: AvailabilityBlockReason) {
  return REASONS.find((item) => item.value === reason)?.label ?? 'Unavailable';
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
  const compactCalendar = viewportWidth < 360;
  const horizontalGutter = compactCalendar ? 0 : spacing.md;
  const calendarGap = compactCalendar ? 2 : 4;
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
      await gateway.setBlock(
        {
          vehicleId: calendar.vehicleId,
          startDate: selection.startDate,
          endDate: selection.endDate,
          reason,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          expectedAvailabilityVersion: calendar.availabilityVersion,
        },
        createIdempotencyKey('owner_availability_set'),
      );
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
            void gateway
              .removeBlock(
                {
                  vehicleId: calendar.vehicleId,
                  blockId: block.blockId,
                  expectedBlockVersion: block.version,
                  expectedAvailabilityVersion: calendar.availabilityVersion,
                },
                createIdempotencyKey('owner_availability_remove'),
              )
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

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.headerInset}>
        <MobileHeader
          onBack={() => router.back()}
          right={
            <PressableScale
              accessibilityLabel="Refresh availability"
              accessibilityRole="button"
              disabled={loading}
              onPress={() => void loadCalendar()}
            >
              <View style={styles.refreshTarget}>
                <Ionicons color={colors.ivory} name="refresh" size={20} />
              </View>
            </PressableScale>
          }
          title="Availability"
        />
      </View>

      {loading && !calendar ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.goldStrong} size="small" />
          <Text style={styles.stateText}>Loading calendar</Text>
        </View>
      ) : !calendar ? (
        <View style={styles.centerState}>
          <Ionicons color={colors.danger} name="cloud-offline-outline" size={30} />
          <Text style={styles.stateTitle}>Calendar unavailable</Text>
          <Text style={styles.stateText}>{error ?? 'Check your connection and try again.'}</Text>
          <View style={styles.retryAction}>
            <PrimaryAction icon="refresh" label="Try again" onPress={() => void loadCalendar()} />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.inset}>
            <View style={styles.intro}>
              <Text accessibilityRole="header" style={styles.title}>Set unavailable dates</Text>
              <Text style={styles.subtitle}>
                Block dates when this vehicle cannot accept a journey. Existing booking holds remain private and appear only as reserved.
              </Text>
            </View>

            {Platform.OS === 'web' && process.env.NODE_ENV !== 'production' ? (
              <InlineNotice icon="flask-outline">Development preview with sample availability.</InlineNotice>
            ) : null}
            {error ? <InlineNotice icon="alert-circle-outline" tone="danger">{error}</InlineNotice> : null}

            <View style={styles.calendarHeading}>
              <View>
                <SectionHeading>Next five weeks</SectionHeading>
                <Text style={styles.windowText}>
                  {formatLagosDateOnly(today)} to {formatLagosDateOnly(addDaysToDateOnly(windowEndDate, -1))}
                </Text>
              </View>
              {loading ? <ActivityIndicator color={colors.goldStrong} size="small" /> : null}
            </View>

            <View style={styles.legendRow}>
              <Legend color={colors.goldStrong} label="Blocked by you" />
              <Legend color={colors.muted} label="Reserved" />
            </View>
          </View>

          <View style={[styles.calendarGrid, { gap: calendarGap, paddingHorizontal: horizontalGutter }]}>
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
                  style={{ width: calendarDayWidth }}
                >
                  <View
                    style={[
                      styles.dayButton,
                      day.status === 'owner_block' && styles.ownerBlockedDay,
                      day.status === 'reserved' && styles.reservedDay,
                      selected && styles.selectedDay,
                    ]}
                  >
                    <Text style={[styles.weekday, selected && styles.selectedDayText]}>{weekday(day.date)}</Text>
                    <Text style={[styles.dayNumber, selected && styles.selectedDayText]}>{dayNumber(day.date)}</Text>
                    {day.status !== 'available' ? (
                      <View
                        style={[
                          styles.dayStatusDot,
                          { backgroundColor: day.status === 'owner_block' ? colors.goldStrong : colors.muted },
                        ]}
                      />
                    ) : <View style={styles.dayStatusDotPlaceholder} />}
                  </View>
                </PressableScale>
              );
            })}
          </View>

          <View style={styles.inset}>
            <View style={styles.selectionSummary}>
              <View style={styles.selectionCopy}>
                <Text style={styles.selectionTitle}>Selected dates</Text>
                <Text style={styles.selectionValue}>
                  {selection.startDate
                    ? selection.endDate
                      ? `${formatLagosDateOnly(selection.startDate)} to ${formatLagosDateOnly(addDaysToDateOnly(selection.endDate, -1))}`
                      : `${formatLagosDateOnly(selection.startDate)} · choose the last day`
                    : 'Choose the first unavailable day'}
                </Text>
              </View>
              {selection.startDate ? (
                <PressableScale
                  accessibilityLabel="Clear selected dates"
                  accessibilityRole="button"
                  onPress={() => setSelection(EMPTY_SELECTION)}
                >
                  <View style={styles.clearTarget}><Ionicons color={colors.muted} name="close" size={19} /></View>
                </PressableScale>
              ) : null}
            </View>

            {selection.endDate ? (
              <View style={styles.composer}>
                <SectionHeading>Reason</SectionHeading>
                <Text style={styles.privateHint}>Only you and authorized MMG operations can see this.</Text>
                <View style={styles.reasonList}>
                  {REASONS.map((item) => {
                    const active = reason === item.value;
                    return (
                      <PressableScale
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        key={item.value}
                        onPress={() => setReason(item.value)}
                      >
                        <View style={styles.reasonRow}>
                          <View style={styles.reasonCopy}>
                            <Text style={[styles.reasonLabel, active && styles.reasonLabelActive]}>{item.label}</Text>
                            <Text style={styles.reasonDetail}>{item.detail}</Text>
                          </View>
                          <Ionicons
                            color={active ? colors.goldStrong : colors.lineStrong}
                            name={active ? 'radio-button-on' : 'radio-button-off'}
                            size={20}
                          />
                        </View>
                      </PressableScale>
                    );
                  })}
                </View>
                <TextInput
                  accessibilityLabel="Private availability note"
                  maxLength={500}
                  multiline
                  onChangeText={setNotes}
                  placeholder="Private note, optional"
                  placeholderTextColor={colors.muted}
                  style={styles.notesInput}
                  value={notes}
                />
                <PrimaryAction
                  icon="calendar-outline"
                  label="Block selected dates"
                  loading={submitting}
                  onPress={() => void handleCreateBlock()}
                />
              </View>
            ) : null}

            <View style={styles.existingSection}>
              <SectionHeading>Your blocks</SectionHeading>
              {calendar.ownerBlocks.length === 0 ? (
                <Text style={styles.emptyText}>No owner-created blocks in this five-week window.</Text>
              ) : (
                <View style={styles.blockList}>
                  {calendar.ownerBlocks.map((block) => (
                    <View key={block.blockId} style={styles.blockRow}>
                      <View style={styles.blockCopy}>
                        <Text style={styles.blockDates}>
                          {formatLagosDateOnly(block.startDate)} to {formatLagosDateOnly(addDaysToDateOnly(block.endDate, -1))}
                        </Text>
                        <Text style={styles.blockReason}>{reasonLabel(block.reason)}</Text>
                      </View>
                      <PressableScale
                        accessibilityLabel={`Remove block beginning ${formatLagosDateOnly(block.startDate)}`}
                        accessibilityRole="button"
                        disabled={submitting}
                        onPress={() => removeBlock(block)}
                      >
                        <View style={styles.removeTarget}>
                          <Ionicons color={colors.danger} name="trash-outline" size={18} />
                        </View>
                      </PressableScale>
                    </View>
                  ))}
                </View>
              )}
            </View>
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
  blockCopy: { flex: 1 },
  blockDates: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  blockList: { marginTop: spacing.sm },
  blockReason: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: 3,
  },
  blockRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 66,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  clearTarget: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  composer: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
  },
  content: { paddingBottom: spacing.xxl },
  dayButton: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: 'transparent',
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
  },
  dayNumber: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 15,
  },
  dayStatusDot: {
    borderRadius: radii.pill,
    height: 4,
    marginTop: 3,
    width: 4,
  },
  dayStatusDotPlaceholder: { height: 7 },
  emptyText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 20,
    paddingVertical: spacing.lg,
  },
  existingSection: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
  },
  headerInset: { paddingHorizontal: spacing.md },
  inset: { paddingHorizontal: spacing.md },
  intro: { marginTop: spacing.lg },
  legendDot: {
    borderRadius: radii.pill,
    height: 7,
    width: 7,
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  legendRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  legendText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
  },
  notesInput: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 14,
    marginBottom: spacing.md,
    marginTop: spacing.md,
    minHeight: 88,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  ownerBlockedDay: { borderColor: colors.goldStrong },
  privateHint: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
    marginTop: 4,
  },
  reasonCopy: { flex: 1 },
  reasonDetail: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: 2,
  },
  reasonLabel: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  reasonLabelActive: { color: colors.ivory },
  reasonList: { marginTop: spacing.sm },
  reasonRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 62,
  },
  refreshTarget: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  removeTarget: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  reservedDay: {
    backgroundColor: colors.graphiteRaised,
    opacity: 0.62,
  },
  retryAction: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  selectedDay: {
    backgroundColor: colors.ivory,
    borderColor: colors.ivory,
  },
  selectedDayText: { color: colors.black },
  selectionCopy: { flex: 1 },
  selectionSummary: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 70,
    paddingTop: spacing.sm,
  },
  selectionTitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
  },
  selectionValue: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    marginTop: 3,
  },
  stateText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  stateTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 25,
    marginTop: spacing.md,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 29,
    letterSpacing: -0.5,
  },
  weekday: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 10,
  },
  windowText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
    marginTop: 3,
  },
});
