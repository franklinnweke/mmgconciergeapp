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
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { addDaysToDateOnly, formatLagosDateOnly, todayLagosDateOnly } from '@/features/discovery/data/lagos-destinations';
import { createOwnerAvailabilityGateway } from '../data/owner-availability-gateway';
import { isDateInSelection, selectOwnerAvailabilityDate, type AvailabilitySelection } from '../domain/owner-availability-calendar';

const WINDOW_DAYS = 60;
const EMPTY_SELECTION: AvailabilitySelection = { startDate: null, endDate: null };
const REASONS: { value: AvailabilityBlockReason; label: string; detail: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'maintenance', label: 'Maintenance', detail: 'Workshop, service or inspection', icon: 'build-outline' },
  { value: 'owner_use', label: 'Owner use', detail: 'Privately committed on these dates', icon: 'key-outline' },
  { value: 'offline', label: 'Temporarily offline', detail: 'Not taking journeys during these dates', icon: 'pause-circle-outline' },
  { value: 'other', label: 'Other', detail: 'Another operational reason', icon: 'ellipsis-horizontal-circle-outline' },
];

function key(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('stale') || message.includes('version') || message.includes('conflict')) return 'The calendar changed. It has been refreshed; choose the dates again.';
  if (message.includes('permission') || message.includes('forbidden')) return 'You are not authorized to manage this vehicle calendar.';
  if (message.includes('overlap') || message.includes('unavailable')) return 'Those dates overlap an existing reservation or owner block.';
  return 'Availability is temporarily unavailable. Please try again.';
}

function dayLabel(day: OwnerVehicleCalendarDay) {
  const date = new Date(`${day.date}T12:00:00+01:00`);
  const weekday = new Intl.DateTimeFormat('en-NG', { weekday: 'short', timeZone: 'Africa/Lagos' }).format(date);
  return { weekday, number: String(Number(day.date.slice(8, 10))) };
}

export function OwnerVehicleAvailabilityV2Screen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gateway = useMemo(() => createOwnerAvailabilityGateway(), []);
  const today = useMemo(() => todayLagosDateOnly(), []);
  const windowEndDate = useMemo(() => addDaysToDateOnly(today, WINDOW_DAYS), [today]);
  const [calendar, setCalendar] = useState<GetOwnerVehicleCalendarResult | null>(null);
  const [selection, setSelection] = useState<AvailabilitySelection>(EMPTY_SELECTION);
  const [reason, setReason] = useState<AvailabilityBlockReason>('maintenance');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gap = 4;
  const horizontal = spacing.lg;
  const dayWidth = Math.max(42, Math.floor((width - horizontal * 2 - gap * 6) / 7));

  const load = useCallback(async () => {
    if (!id) {
      setError('Vehicle reference is missing.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setCalendar(await gateway.getCalendar({ vehicleId: id, windowStartDate: today, windowEndDate }));
    } catch (caught) {
      setError(safeMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [gateway, id, today, windowEndDate]);

  useEffect(() => {
    let active = true;
    if (!id) {
      queueMicrotask(() => {
        if (!active) return;
        setError('Vehicle reference is missing.');
        setLoading(false);
      });
      return () => { active = false; };
    }

    void gateway.getCalendar({ vehicleId: id, windowStartDate: today, windowEndDate })
      .then((next) => {
        if (!active) return;
        setCalendar(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) setError(safeMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [gateway, id, today, windowEndDate]);

  const chooseDate = (date: string) => {
    if (!calendar || busy) return;
    const next = selectOwnerAvailabilityDate(selection, date, calendar.days);
    setSelection(next.selection);
    setError(next.error);
  };

  const createBlock = async () => {
    if (!calendar || !selection.startDate || !selection.endDate || busy) return;
    setBusy(true);
    setError(null);
    try {
      await gateway.setBlock({
        vehicleId: calendar.vehicleId,
        startDate: selection.startDate,
        endDate: selection.endDate,
        reason,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        expectedAvailabilityVersion: calendar.availabilityVersion,
      }, key('owner_block'));
      setSelection(EMPTY_SELECTION);
      setNotes('');
      await load();
    } catch (caught) {
      setError(safeMessage(caught));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const removeBlock = (block: OwnerAvailabilityBlock) => {
    if (!calendar || busy) return;
    Alert.alert(
      'Make these dates available?',
      `${formatLagosDateOnly(block.startDate)} through ${formatLagosDateOnly(addDaysToDateOnly(block.endDate, -1))} will reopen for booking.`,
      [
        { text: 'Keep blocked', style: 'cancel' },
        {
          text: 'Make available',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            void gateway.removeBlock({
              vehicleId: calendar.vehicleId,
              blockId: block.blockId,
              expectedBlockVersion: block.version,
              expectedAvailabilityVersion: calendar.availabilityVersion,
            }, key('owner_unblock'))
              .then(() => load())
              .catch(async (caught: unknown) => { setError(safeMessage(caught)); await load(); })
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <ScreenHeader
          onBack={() => router.back()}
          right={
            <PressableScale accessibilityLabel="Refresh availability" disabled={loading} onPress={() => void load()} style={styles.headerAction}>
              <Ionicons color={colors.ivory} name="refresh" size={18} />
            </PressableScale>
          }
          showBrand={false}
          title="Vehicle availability"
        />
      </View>

      {loading && !calendar ? (
        <View style={styles.center}><ActivityIndicator color={colors.goldStrong} /><Text style={styles.muted}>Loading availability…</Text></View>
      ) : !calendar ? (
        <View style={styles.center}>
          <Text style={styles.title}>Calendar unavailable</Text>
          <Text style={styles.muted}>{error || 'Check your connection and try again.'}</Text>
          <PressableScale onPress={() => void load()}><Text style={styles.link}>Try again</Text></PressableScale>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>Block dates when unavailable.</Text>
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}

          <View style={styles.sectionHeader}>
            <View><Text style={styles.title}>Next 60 days</Text><Text style={styles.muted}>{formatLagosDateOnly(today)} to {formatLagosDateOnly(addDaysToDateOnly(windowEndDate, -1))}</Text></View>
            {loading ? <ActivityIndicator color={colors.goldStrong} /> : null}
          </View>

          <View style={styles.legend}>
            <Legend label="Available" color={colors.graphiteRaised} />
            <Legend label="Your block" color={colors.goldStrong} />
            <Legend label="Reserved" color={colors.muted} />
          </View>

          <View style={[styles.grid, { gap }]}>
            {calendar.days.map((day) => {
              const selected = isDateInSelection(day.date, selection);
              const disabled = day.status !== 'available' || busy;
              const label = dayLabel(day);
              return (
                <PressableScale
                  accessibilityLabel={`${formatLagosDateOnly(day.date)}, ${day.status}`}
                  accessibilityState={{ disabled, selected }}
                  disabled={disabled}
                  key={day.date}
                  onPress={() => chooseDate(day.date)}
                  style={[
                    styles.day,
                    { width: dayWidth },
                    day.status === 'owner_block' && styles.ownerBlock,
                    day.status === 'reserved' && styles.reserved,
                    selected && styles.selected,
                  ]}
                >
                  <Text style={[styles.weekday, selected && styles.selectedText]}>{label.weekday.slice(0, 2).toUpperCase()}</Text>
                  <Text style={[styles.dayNumber, selected && styles.selectedText]}>{label.number}</Text>
                  {day.status !== 'available' ? <Ionicons color={day.status === 'owner_block' ? colors.goldStrong : colors.muted} name={day.status === 'owner_block' ? 'remove-circle' : 'lock-closed'} size={11} /> : <View style={styles.iconSpace} />}
                </PressableScale>
              );
            })}
          </View>

          <View style={styles.selection}>
            <View style={styles.flex}>
              <Text style={styles.selectionLabel}>Dates to block</Text>
              <Text style={styles.selectionValue}>
                {selection.startDate
                  ? selection.endDate
                    ? `${formatLagosDateOnly(selection.startDate)} through ${formatLagosDateOnly(addDaysToDateOnly(selection.endDate, -1))}`
                    : `${formatLagosDateOnly(selection.startDate)} · choose the last day`
                  : 'Choose the first unavailable day'}
              </Text>
            </View>
            {selection.startDate ? <PressableScale onPress={() => setSelection(EMPTY_SELECTION)}><Text style={styles.link}>Clear</Text></PressableScale> : null}
          </View>

          {selection.endDate ? (
            <View style={styles.composer}>
              <Text style={styles.title}>Why is it unavailable?</Text>
              <Text style={styles.muted}>Only you and MMG see this.</Text>
              {REASONS.map((item) => {
                const active = reason === item.value;
                return (
                  <PressableScale key={item.value} onPress={() => setReason(item.value)} style={styles.reasonRow}>
                    <Ionicons color={active ? colors.goldStrong : colors.muted} name={item.icon} size={20} />
                    <View style={styles.flex}><Text style={styles.reasonTitle}>{item.label}</Text><Text style={styles.muted}>{item.detail}</Text></View>
                    <Ionicons color={active ? colors.goldStrong : colors.muted} name={active ? 'radio-button-on' : 'radio-button-off'} size={19} />
                  </PressableScale>
                );
              })}
              <TextInput maxLength={500} multiline onChangeText={setNotes} placeholder="Private note (optional)" placeholderTextColor={colors.muted} style={styles.notes} value={notes} />
              <PressableScale disabled={busy} onPress={() => void createBlock()}>
                <View style={styles.primaryButton}>{busy ? <ActivityIndicator color={colors.black} /> : <Text style={styles.primaryText}>Block selected dates</Text>}</View>
              </PressableScale>
            </View>
          ) : null}

          <View style={styles.blocks}>
            <Text style={styles.title}>Your current blocks</Text>
            {!calendar.ownerBlocks.length ? <Text style={styles.muted}>No blocked dates.</Text> : calendar.ownerBlocks.map((block) => (
              <View key={block.blockId} style={styles.blockRow}>
                <View style={styles.flex}>
                  <Text style={styles.blockDates}>{formatLagosDateOnly(block.startDate)} to {formatLagosDateOnly(addDaysToDateOnly(block.endDate, -1))}</Text>
                  <Text style={styles.muted}>{block.reason.replace('_', ' ')}</Text>
                </View>
                <PressableScale accessibilityLabel="Remove availability block" disabled={busy} onPress={() => removeBlock(block)}><Ionicons color={colors.danger} name="trash-outline" size={18} /></PressableScale>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Legend({ label, color }: { label: string; color: string }) {
  return <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={styles.muted}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  blockDates: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 13 },
  blockRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 58, paddingVertical: spacing.sm },
  blocks: { gap: spacing.sm },
  center: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.lg },
  composer: { gap: spacing.sm },
  content: { gap: spacing.lg, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  day: { alignItems: 'center', borderColor: colors.line, borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth, height: 58, justifyContent: 'center' },
  dayNumber: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15 },
  dot: { borderRadius: 4, height: 8, width: 8 },
  error: { color: colors.danger, fontFamily: typography.body, fontSize: 13 },
  flex: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  header: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerAction: { alignItems: 'center', borderColor: colors.line, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, height: 40, justifyContent: 'center', width: 40 },
  iconSpace: { height: 11 },
  intro: { color: colors.silver, fontFamily: typography.body, fontSize: 13, lineHeight: 19 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  link: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 13, padding: spacing.xs },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  notes: { borderColor: colors.line, borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth, color: colors.ivory, fontFamily: typography.body, fontSize: 13, minHeight: 82, padding: spacing.md, textAlignVertical: 'top' },
  ownerBlock: { backgroundColor: 'rgba(212,175,55,0.08)' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', minHeight: 50 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  reasonRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, minHeight: 60 },
  reasonTitle: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 13 },
  reserved: { opacity: 0.58 },
  screen: { backgroundColor: colors.black, flex: 1 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  selected: { backgroundColor: colors.ivory, borderColor: colors.ivory },
  selectedText: { color: colors.black },
  selection: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  selectionLabel: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 11 },
  selectionValue: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 13, marginTop: 2 },
  title: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 17 },
  weekday: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 9 },
});
