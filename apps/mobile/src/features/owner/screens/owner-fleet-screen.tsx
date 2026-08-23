import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { OwnerVisibleVehicle, VehicleModerationStatus } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { InlineNotice, PrimaryAction } from '@/components/ui/mobile-primitives';
import { normalizeVehicleImageUrl } from '@/features/discovery/data/vehicle-images';
import { useOwnerFleet } from '../hooks/use-owner-fleet';

function statusCopy(status: VehicleModerationStatus, visibility: string) {
  switch (status) {
    case 'approved':
      return visibility === 'active'
        ? { label: 'Live', color: colors.success }
        : { label: 'Paused', color: colors.muted };
    case 'pending_review':
      return { label: 'Under review', color: colors.goldStrong };
    case 'draft':
      return { label: 'Draft', color: colors.muted };
    case 'rejected':
      return { label: 'Needs changes', color: colors.danger };
    case 'suspended':
      return { label: 'Suspended', color: colors.danger };
  }
}

function ownerImageUrl(vehicle: OwnerVisibleVehicle): string | null {
  const path = vehicle.primaryImagePath?.trim();
  if (!path || !/^https?:\/\//i.test(path)) return null;
  return normalizeVehicleImageUrl(path);
}

function ownerRateLabel(vehicle: OwnerVisibleVehicle): string {
  return typeof vehicle.ownerDailyRateKobo === 'number' && vehicle.ownerDailyRateKobo > 0
    ? formatNairaFromKobo(vehicle.ownerDailyRateKobo)
    : 'Rate not set';
}

export function OwnerFleetScreen() {
  const router = useRouter();
  const { actionInProgress, loading, syncError, toggleVisibility, vehicles } = useOwnerFleet();

  const handleAddVehicle = () => router.push('/(owner)/add-vehicle' as never);
  const handlePressVehicle = (vehicle: OwnerVisibleVehicle) => {
    if (vehicle.moderationStatus === 'draft' || vehicle.moderationStatus === 'rejected') {
      router.push({
        pathname: '/(owner)/add-vehicle' as never,
        params: { vehicleId: vehicle.vehicleId },
      });
      return;
    }
    router.push({
      pathname: '/(owner)/fleet/[id]' as never,
      params: { id: vehicle.vehicleId },
    });
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={vehicles}
        keyExtractor={(item) => item.vehicleId}
        ListHeaderComponent={
          <View>
            <View style={styles.topBar}>
              <BrandWordmark compact withLogo />
              <View style={styles.topActions}>
                <PressableScale
                  accessibilityLabel="Open bookings"
                  accessibilityRole="button"
                  onPress={() => router.push('/(owner)/owner-bookings' as never)}
                >
                  <View style={styles.iconTarget}>
                    <Ionicons color={colors.ivory} name="calendar-outline" size={21} />
                  </View>
                </PressableScale>
                <PressableScale
                  accessibilityLabel="Add vehicle"
                  accessibilityRole="button"
                  haptic="light"
                  onPress={handleAddVehicle}
                >
                  <View style={styles.addTarget}>
                    <Ionicons color={colors.black} name="add" size={21} />
                  </View>
                </PressableScale>
              </View>
            </View>
            <View style={styles.intro}>
              <Text accessibilityRole="header" style={styles.title}>Fleet</Text>
              <Text style={styles.subtitle}>Manage your listed vehicles and availability.</Text>
            </View>
            {syncError ? <InlineNotice icon="cloud-offline-outline" tone="danger">{syncError}</InlineNotice> : null}
            {!loading && vehicles.length ? (
              <Text style={styles.count}>{vehicles.length} {vehicles.length === 1 ? 'vehicle' : 'vehicles'}</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.goldStrong} size="small" />
              <Text style={styles.loadingText}>Loading fleet</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons color={colors.goldStrong} name="car-outline" size={27} />
              <Text style={styles.emptyTitle}>No vehicles yet</Text>
              <Text style={styles.emptyBody}>Add your first chauffeured vehicle to begin the MMG review process.</Text>
              <View style={styles.emptyAction}>
                <PrimaryAction icon="add" label="Add vehicle" onPress={handleAddVehicle} />
              </View>
            </View>
          )
        }
        renderItem={({ item }) => (
          <VehicleRow
            actionInProgress={actionInProgress}
            item={item}
            onPress={() => handlePressVehicle(item)}
            onToggle={() => void toggleVisibility(item)}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function VehicleRow({
  actionInProgress,
  item,
  onPress,
  onToggle,
}: {
  actionInProgress: string | null;
  item: OwnerVisibleVehicle;
  onPress: () => void;
  onToggle: () => void;
}) {
  const status = statusCopy(item.moderationStatus, item.visibility);
  const imageUrl = ownerImageUrl(item);
  const isToggling = actionInProgress === item.vehicleId;
  const metadata = [
    item.areaLabel,
    item.seats ? `${item.seats} seats` : null,
    item.year ? String(item.year) : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.vehicleBlock}>
      <PressableScale
        accessibilityHint="Opens vehicle management"
        accessibilityLabel={`${item.displayName}, ${status.label}`}
        accessibilityRole="button"
        onPress={onPress}
      >
        <View>
          <View style={styles.media}>
            {imageUrl ? (
              <Image contentFit="cover" source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} />
            ) : (
              <View style={styles.mediaFallback}>
                <Ionicons color={colors.muted} name="image-outline" size={28} />
                <Text style={styles.mediaFallbackText}>{item.imageCount ? 'Vehicle photo unavailable' : 'No vehicle photo yet'}</Text>
              </View>
            )}
          </View>
          <View style={styles.vehicleCopy}>
            <View style={styles.vehicleHeading}>
              <View style={styles.nameBlock}>
                <Text numberOfLines={2} style={styles.vehicleName}>{item.displayName}</Text>
                <Text style={[styles.status, { color: status.color }]}>{status.label}</Text>
              </View>
              <Ionicons color={colors.muted} name="chevron-forward" size={19} />
            </View>
            {metadata ? <Text style={styles.meta}>{metadata}</Text> : null}
            <View style={styles.rateRow}>
              <Text style={styles.rate}>{ownerRateLabel(item)}</Text>
              {typeof item.ownerDailyRateKobo === 'number' && item.ownerDailyRateKobo > 0 ? (
                <Text style={styles.rateContext}>per day</Text>
              ) : null}
            </View>
          </View>
        </View>
      </PressableScale>

      {item.moderationStatus === 'approved' ? (
        <View style={styles.visibilityRow}>
          <View>
            <Text style={styles.visibilityTitle}>{item.visibility === 'active' ? 'Visible to renters' : 'Listing paused'}</Text>
            <Text style={styles.visibilityBody}>{item.visibility === 'active' ? 'Renters can discover this vehicle.' : 'The vehicle remains approved but hidden.'}</Text>
          </View>
          <Switch
            accessibilityLabel="Vehicle visibility"
            disabled={isToggling}
            ios_backgroundColor={colors.graphiteRaised}
            onValueChange={onToggle}
            thumbColor={item.visibility === 'active' ? colors.goldStrong : colors.muted}
            trackColor={{ false: colors.graphiteRaised, true: 'rgba(227,195,101,.38)' }}
            value={item.visibility === 'active'}
          />
        </View>
      ) : null}

      {item.moderationStatus === 'rejected' && item.lastDecisionReason ? (
        <InlineNotice icon="information-circle-outline" tone="danger">{item.lastDecisionReason}</InlineNotice>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  addTarget: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  count: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  empty: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  emptyAction: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  emptyBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  emptyTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 27,
    marginTop: spacing.md,
  },
  iconTarget: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  intro: {
    marginTop: spacing.xl,
  },
  listContent: {
    paddingBottom: spacing.xxl + 50,
    paddingHorizontal: spacing.md,
  },
  loading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  loadingText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  media: {
    backgroundColor: colors.graphite,
    borderRadius: radii.md,
    height: 196,
    overflow: 'hidden',
  },
  mediaFallback: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
  },
  mediaFallbackText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  meta: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  nameBlock: { flex: 1 },
  rate: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 15,
  },
  rateContext: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
  },
  rateRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  status: {
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    marginTop: 3,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    marginTop: 5,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 32,
    letterSpacing: -0.6,
  },
  topActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  vehicleBlock: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  vehicleCopy: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.md,
  },
  vehicleHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  vehicleName: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 23,
    letterSpacing: -0.3,
  },
  visibilityBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
    marginTop: 2,
    maxWidth: 255,
  },
  visibilityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.md,
  },
  visibilityTitle: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
});
