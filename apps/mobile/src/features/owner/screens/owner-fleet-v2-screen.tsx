import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { OwnerVisibleVehicle, VehicleModerationStatus } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { type Href, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';
import { useOwnerFleet } from '../hooks/use-owner-fleet';

function statusPresentation(status: VehicleModerationStatus, visibility: string) {
  if (status === 'approved' && visibility === 'active') return { label: 'Live', color: colors.success ?? '#10B981' };
  if (status === 'approved') return { label: 'Approved · paused', color: colors.muted };
  if (status === 'pending_review') return { label: 'Under review', color: '#60A5FA' };
  if (status === 'rejected') return { label: 'Changes requested', color: colors.danger ?? '#EF4444' };
  if (status === 'suspended') return { label: 'Suspended', color: colors.danger ?? '#EF4444' };
  return { label: 'Draft', color: colors.silver };
}

export function OwnerFleetV2Screen() {
  const router = useRouter();
  const { actionInProgress, loading, syncError, toggleVisibility, vehicles } = useOwnerFleet();

  const right = (
    <View style={styles.headerActions}>
      <PressableScale accessibilityLabel="Back to renting" accessibilityRole="button" onPress={() => router.replace('/(renter)' as Href)} style={styles.headerAction}>
        <Ionicons color={colors.ivory} name="storefront-outline" size={18} />
      </PressableScale>
      <PressableScale accessibilityLabel="Open requests and bookings" accessibilityRole="button" onPress={() => router.push('/(owner)/owner-bookings' as Href)} style={styles.headerAction}>
        <Ionicons color={colors.ivory} name="calendar-outline" size={19} />
      </PressableScale>
      <PressableScale accessibilityLabel="List another vehicle" accessibilityRole="button" onPress={() => router.push('/(owner)/add-vehicle' as Href)} style={styles.headerAction}>
        <Ionicons color={colors.ivory} name="add" size={21} />
      </PressableScale>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}><ScreenHeader right={right} showBrand={false} title="Fleet" /></View>

      {syncError ? (
        <View accessibilityLiveRegion="polite" style={styles.errorBanner}>
          <Ionicons color={colors.danger} name="alert-circle-outline" size={18} />
          <Text style={styles.errorText}>{syncError}</Text>
        </View>
      ) : null}

      {loading && vehicles.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.goldStrong} />
          <Text style={styles.muted}>Loading fleet…</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={vehicles}
          keyExtractor={(item) => item.vehicleId}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No vehicles yet</Text>
              <Text style={styles.muted}>Create a draft and MMG will review it before it appears to renters.</Text>
              <PressableScale onPress={() => router.push('/(owner)/add-vehicle' as Href)}>
                <View style={styles.primaryButton}><Text style={styles.primaryText}>List a vehicle</Text></View>
              </PressableScale>
            </View>
          }
          renderItem={({ item }) => <VehicleRow item={item} busy={actionInProgress === item.vehicleId} onOpen={() => router.push({ pathname: '/(owner)/fleet/[id]', params: { id: item.vehicleId } } as Href)} onToggle={() => void toggleVisibility(item)} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function VehicleRow({
  item,
  busy,
  onOpen,
  onToggle,
}: {
  item: OwnerVisibleVehicle;
  busy: boolean;
  onOpen(): void;
  onToggle(): void;
}) {
  const status = statusPresentation(item.moderationStatus, item.visibility);
  return (
    <View style={styles.card}>
      <PressableScale accessibilityLabel={`Open ${item.displayName}`} accessibilityRole="button" onPress={onOpen}>
        <View style={styles.media}>
          <Image contentFit="cover" source={resolveVehicleImageSource({ imageUrl: item.primaryImagePath ?? undefined, category: item.category ?? undefined })} style={StyleSheet.absoluteFill} />
        </View>
        <View style={styles.cardBody}>
          <Text numberOfLines={1} style={styles.name}>{item.displayName}</Text>
          <Text style={[styles.status, { color: status.color }]}>{status.label}</Text>
          <Text style={styles.meta}>{[item.areaLabel, item.year ? String(item.year) : null, item.seats ? `${item.seats} seats` : null].filter(Boolean).join(' · ')}</Text>
          <View style={styles.rateRow}>
            <Text style={styles.muted}>Daily rate</Text>
            <Text style={styles.rate}>{item.ownerDailyRateKobo ? formatNairaFromKobo(item.ownerDailyRateKobo) : 'Not set'}</Text>
          </View>
          {item.moderationStatus === 'rejected' && item.lastDecisionReason ? (
            <Text numberOfLines={2} style={styles.feedback}>MMG feedback: {item.lastDecisionReason}</Text>
          ) : null}
        </View>
      </PressableScale>

      {item.moderationStatus === 'approved' ? (
        <View style={styles.visibilityRow}>
          <View>
            <Text style={styles.visibilityTitle}>Renter discovery</Text>
            <Text style={styles.muted}>{item.visibility === 'active' ? 'Visible to renters' : 'Paused'}</Text>
          </View>
          <Switch
            accessibilityLabel={`${item.visibility === 'active' ? 'Pause' : 'Activate'} ${item.displayName}`}
            disabled={busy}
            onValueChange={onToggle}
            thumbColor={item.visibility === 'active' ? colors.gold : colors.muted}
            trackColor={{ false: colors.graphite, true: 'rgba(212,175,55,0.4)' }}
            value={item.visibility === 'active'}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: spacing.lg, paddingBottom: spacing.lg },
  cardBody: { gap: 3, paddingTop: spacing.sm },
  center: { alignItems: 'center', flex: 1, gap: spacing.sm, justifyContent: 'center' },
  empty: { gap: spacing.md, paddingVertical: spacing.xxl },
  emptyTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 20 },
  errorBanner: { alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.08)', flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.lg, padding: spacing.md },
  errorText: { color: colors.danger, flex: 1, fontFamily: typography.body, fontSize: 13 },
  feedback: { color: colors.danger, fontFamily: typography.body, fontSize: 12, lineHeight: 17, marginTop: spacing.xs },
  header: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerAction: { alignItems: 'center', borderColor: colors.line, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, height: 40, justifyContent: 'center', width: 40 },
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  list: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  media: { backgroundColor: colors.graphiteRaised, borderRadius: radii.md, height: 164, overflow: 'hidden' },
  meta: { color: colors.muted, fontFamily: typography.body, fontSize: 12, marginTop: 2 },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  name: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 17 },
  primaryButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.lg },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 13 },
  rate: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14 },
  rateRow: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm },
  screen: { backgroundColor: colors.black, flex: 1 },
  status: { fontFamily: typography.bodySemiBold, fontSize: 12 },
  visibilityRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.md },
  visibilityTitle: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 13 },
});
