import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { OwnerVisibleVehicle, VehicleModerationStatus } from '@mmg/contracts';
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

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';
import { useOwnerFleet } from '../hooks/use-owner-fleet';

function statusBadgeConfig(status: VehicleModerationStatus, visibility: string) {
  switch (status) {
    case 'approved':
      if (visibility === 'active') {
        return {
          label: 'APPROVED & LIVE',
          color: colors.success ?? '#10B981',
          bgColor: 'rgba(160, 185, 129, 0.12)',
          borderColor: 'rgba(16, 185, 129, 0.3)',
          icon: 'checkmark-circle' as const,
        };
      }
      return {
        label: 'APPROVED (PAUSED)',
        color: colors.muted,
        bgColor: 'rgba(160, 160, 160, 0.12)',
        borderColor: 'rgba(160, 160, 160, 0.3)',
        icon: 'pause-circle' as const,
      };
    case 'pending_review':
      return {
        label: 'UNDER REVIEW',
        color: '#3B82F6',
        bgColor: 'rgba(59, 130, 246, 0.12)',
        borderColor: 'rgba(59, 130, 246, 0.3)',
        icon: 'time' as const,
      };
    case 'draft':
      return {
        label: 'DRAFT',
        color: colors.goldStrong,
        bgColor: 'rgba(212, 175, 55, 0.12)',
        borderColor: 'rgba(212, 175, 55, 0.3)',
        icon: 'document-text' as const,
      };
    case 'rejected':
      return {
        label: 'REVISION REQUIRED',
        color: colors.danger ?? '#EF4444',
        bgColor: 'rgba(239, 68, 68, 0.12)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
        icon: 'alert-circle' as const,
      };
    case 'suspended':
      return {
        label: 'SUSPENDED',
        color: colors.danger ?? '#EF4444',
        bgColor: 'rgba(239, 68, 68, 0.12)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
        icon: 'close-circle' as const,
      };
  }
}

export function OwnerFleetScreen() {
  const router = useRouter();
  const { actionInProgress, loading, syncError, toggleVisibility, vehicles } = useOwnerFleet();

  const handleAddVehicle = () => {
    router.push('/(owner)/add-vehicle' as any);
  };

  const handlePressVehicle = (vehicle: OwnerVisibleVehicle) => {
    router.push({
      pathname: '/(owner)/fleet/[id]' as any,
      params: { id: vehicle.vehicleId },
    });
  };

  const headerActions = (
    <View style={styles.headerActions}>
      <PressableScale
        accessibilityLabel="Open bookings"
        accessibilityRole="button"
        onPress={() => router.push('/(owner)/owner-bookings' as any)}
        style={styles.headerAction}
      >
        <Ionicons color={colors.ivory} name="calendar-outline" size={19} />
      </PressableScale>
      <PressableScale
        accessibilityLabel="List a vehicle"
        accessibilityRole="button"
        onPress={handleAddVehicle}
        style={styles.headerAction}
      >
        <Ionicons color={colors.ivory} name="add" size={22} />
      </PressableScale>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <ScreenHeader right={headerActions} showBrand={false} title="Fleet" />
      </View>

      {syncError ? (
        <View style={styles.errorBanner}>
          <Ionicons color={colors.danger} name="alert-circle-outline" size={18} />
          <Text style={styles.errorText}>{syncError}</Text>
        </View>
      ) : null}

      {loading && vehicles.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.gold} size="large" />
          <Text style={styles.loadingText}>Loading fleet…</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={vehicles}
          keyExtractor={(item) => item.vehicleId}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No vehicles yet</Text>
              <Text style={styles.emptyCopy}>
                Add a vehicle to start managing your fleet.
              </Text>
              <PressableScale onPress={handleAddVehicle} style={styles.emptyButton}>
                <Text style={styles.emptyButtonText}>Add vehicle</Text>
              </PressableScale>
            </View>
          }
          renderItem={({ item }) => {
            const badge = statusBadgeConfig(item.moderationStatus, item.visibility);
            const isToggling = actionInProgress === item.vehicleId;

            return (
              <PressableScale
                accessibilityHint="Opens vehicle management details"
                accessibilityLabel={`${item.displayName}, ${badge.label}`}
                accessibilityRole="button"
                onPress={() => handlePressVehicle(item)}
                style={styles.card}
              >
                <View style={styles.cardMedia}>
                  <Image
                    contentFit="cover"
                    source={resolveVehicleImageSource({
                      imageUrl: item.primaryImagePath ?? undefined,
                      category: item.category ?? undefined,
                    })}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={[styles.badge, { backgroundColor: badge.bgColor, borderColor: badge.borderColor }]}>
                    <Ionicons color={badge.color} name={badge.icon} size={12} />
                    <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.cardTopRow}>
                    <Text numberOfLines={2} style={styles.vehicleName}>
                      {item.displayName}
                    </Text>
                    {item.moderationStatus === 'approved' ? (
                      <View style={styles.switchRow}>
                        <Text style={styles.switchLabel}>
                          {item.visibility === 'active' ? 'Active' : 'Paused'}
                        </Text>
                        <Switch
                          disabled={isToggling}
                          onValueChange={() => void toggleVisibility(item)}
                          thumbColor={item.visibility === 'active' ? colors.gold : colors.muted}
                          trackColor={{ false: colors.graphite, true: 'rgba(212,175,55,0.4)' }}
                          value={item.visibility === 'active'}
                        />
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.metaRow}>
                    <Ionicons color={colors.gold} name="location-outline" size={13} />
                    <Text style={styles.metaText}>{item.areaLabel ?? 'Lagos'}</Text>
                    {item.seats ? (
                      <>
                        <Text style={styles.metaDot}>·</Text>
                        <Ionicons color={colors.gold} name="people-outline" size={13} />
                        <Text style={styles.metaText}>{item.seats} seats</Text>
                      </>
                    ) : null}
                    {item.year ? (
                      <>
                        <Text style={styles.metaDot}>·</Text>
                        <Text style={styles.metaText}>{item.year}</Text>
                      </>
                    ) : null}
                  </View>

                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>DAILY RATE</Text>
                    <Text style={styles.priceValue}>
                      {item.ownerDailyRateKobo ? formatNairaFromKobo(item.ownerDailyRateKobo) : 'Not set'}
                    </Text>
                  </View>

                  {item.moderationStatus === 'rejected' && item.lastDecisionReason ? (
                    <View style={styles.rejectionBox}>
                      <Ionicons color={colors.danger} name="information-circle" size={14} />
                      <Text numberOfLines={2} style={styles.rejectionText}>
                        Feedback: {item.lastDecisionReason}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </PressableScale>
            );
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    position: 'absolute',
    top: spacing.sm,
  },
  badgeText: {
    fontFamily: typography.body,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.graphiteRaised,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  cardBody: { padding: spacing.md },
  cardMedia: { backgroundColor: '#1E1E1E', height: 160, width: '100%' },
  cardTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  emptyButton: {
    alignItems: 'center',
    backgroundColor: colors.gold,
    borderRadius: radii.pill,
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  emptyButtonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 13 },
  emptyCopy: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 22, marginTop: spacing.xs, textAlign: 'center' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  emptyTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 18 },
  errorBanner: {
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
    padding: spacing.sm,
  },
  errorText: { color: colors.danger, flex: 1, fontFamily: typography.body, fontSize: 12 },
  header: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerAction: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  listContent: { paddingBottom: spacing.xxl + 40, paddingHorizontal: spacing.lg },
  loadingContainer: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingVertical: spacing.xxl },
  loadingText: { color: colors.muted, fontFamily: typography.body, fontSize: 13, marginTop: spacing.sm },
  metaDot: { color: colors.muted },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  metaText: { color: colors.muted, fontFamily: typography.body, fontSize: 12 },
  priceLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  priceRow: {
    alignItems: 'center',
    borderTopColor: 'rgba(255,255,255,0.06)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  priceValue: { color: colors.ivory, fontFamily: typography.body, fontSize: 15, fontWeight: '700' },
  rejectionBox: { alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: radii.sm, flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, padding: spacing.xs },
  rejectionText: { color: colors.danger, flex: 1, fontFamily: typography.body, fontSize: 11 },
  safeArea: { backgroundColor: colors.black, flex: 1 },
  switchLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 12 },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  vehicleName: { color: colors.ivory, flex: 1, fontFamily: typography.body, fontSize: 16, fontWeight: '600', marginRight: spacing.sm },
});
