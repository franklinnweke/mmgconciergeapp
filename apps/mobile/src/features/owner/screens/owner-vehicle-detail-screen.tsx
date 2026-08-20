import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { OwnerVisibleVehicle, VehicleVisibility } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';
import { createOwnerFleetGateway } from '../data/owner-fleet-gateway';

export function OwnerVehicleDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [vehicle, setVehicle] = useState<OwnerVisibleVehicle | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const gateway = useMemo(() => createOwnerFleetGateway(), []);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    gateway
      .getOwnerVehicle(id)
      .then((v) => {
        if (!isMounted) return;
        setVehicle(v);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (!isMounted) return;
        setErrorMsg(err.message || 'Failed to load vehicle details.');
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [gateway, id]);

  const handleToggleVisibility = async () => {
    if (!vehicle || actionLoading) return;
    const target: VehicleVisibility = vehicle.visibility === 'active' ? 'paused' : 'active';
    setActionLoading(true);
    try {
      await gateway.setVisibility({
        vehicleId: vehicle.vehicleId,
        expectedVersion: vehicle.version,
        visibility: target,
      });
      setVehicle((prev) => (prev ? { ...prev, visibility: target, version: prev.version + 1 } : null));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Visibility change failed.';
      Alert.alert('Update Failed', msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleManageAvailability = () => {
    if (!vehicle) return;
    router.push({
      pathname: '/(owner)/fleet/[id]/availability' as any,
      params: { id: vehicle.vehicleId },
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.gold} size="large" />
          <Text style={styles.loadingText}>Loading vehicle record...</Text>
        </View>

      </SafeAreaView>
    );
  }

  if (!vehicle || errorMsg) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorBox}>
          <Ionicons color={colors.danger} name="alert-circle" size={32} />
          <Text style={styles.errorTitle}>{errorMsg || 'Vehicle Not Found'}</Text>
          <PressableScale onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Return to Fleet</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <PressableScale accessibilityRole="button" onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons color={colors.ivory} name="arrow-back" size={20} />
        </PressableScale>
        <Text style={styles.headerTitle}>{vehicle.displayName}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroImageContainer}>
          <Image
            contentFit="cover"
            source={resolveVehicleImageSource({
              imageUrl: vehicle.primaryImagePath ?? undefined,
              category: vehicle.category ?? undefined,
            })}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View>
              <Text style={styles.statusHeading}>MODERATION STATUS</Text>
              <Text style={styles.statusValue}>{vehicle.moderationStatus.toUpperCase().replace('_', ' ')}</Text>
            </View>
            {vehicle.moderationStatus === 'approved' ? (
              <View style={styles.toggleGroup}>
                <Text style={styles.toggleText}>{vehicle.visibility === 'active' ? 'Active' : 'Paused'}</Text>
                <Switch
                  disabled={actionLoading}
                  onValueChange={handleToggleVisibility}
                  thumbColor={vehicle.visibility === 'active' ? colors.gold : colors.muted}
                  trackColor={{ false: colors.graphite, true: 'rgba(212,175,55,0.4)' }}
                  value={vehicle.visibility === 'active'}
                />
              </View>
            ) : null}
          </View>

          {vehicle.moderationStatus === 'rejected' && vehicle.lastDecisionReason ? (
            <View style={styles.feedbackContainer}>
              <Ionicons color={colors.danger} name="information-circle" size={18} />
              <View style={{ flex: 1 }}>
                <Text style={styles.feedbackHeading}>Moderator Feedback</Text>
                <Text style={styles.feedbackBody}>{vehicle.lastDecisionReason}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {vehicle.moderationStatus === 'approved' ? (
          <PressableScale
            accessibilityHint="Opens the trusted booking and owner-block calendar"
            accessibilityRole="button"
            onPress={handleManageAvailability}
            style={styles.availabilityRow}
          >
            <View style={styles.availabilityIcon}>
              <Ionicons color={colors.goldStrong} name="calendar-outline" size={22} />
            </View>
            <View style={styles.availabilityCopy}>
              <Text style={styles.availabilityTitle}>Manage availability</Text>
              <Text style={styles.availabilityBody}>Block dates or review reserved journey dates.</Text>
            </View>
            <Ionicons color={colors.muted} name="chevron-forward" size={20} />
          </PressableScale>
        ) : null}

        {/* Specs Overview */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>SPECIFICATIONS</Text>
          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Make & Model</Text>
              <Text style={styles.itemVal}>{vehicle.make ?? 'Unknown'} {vehicle.model ?? ''}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Year</Text>
              <Text style={styles.itemVal}>{vehicle.year ?? 'N/A'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Category</Text>
              <Text style={styles.itemVal}>{vehicle.category === 'executive_suv' ? 'Executive SUV' : 'Executive Saloon'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Seats</Text>
              <Text style={styles.itemVal}>{vehicle.seats ?? 4} Passengers</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Transmission</Text>
              <Text style={styles.itemVal}>{vehicle.transmission?.toUpperCase() ?? 'AUTOMATIC'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Base Area</Text>
              <Text style={styles.itemVal}>{vehicle.areaLabel ?? 'Lagos'}</Text>
            </View>
          </View>
        </View>

        {/* Daily Rate */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>FINANCIAL TERMS</Text>
          <View style={styles.rateRow}>
            <Text style={styles.rateLabel}>Owner daily rate</Text>
            <Text style={styles.rateValue}>{formatNairaFromKobo(vehicle.ownerDailyRateKobo ?? 0)}</Text>
          </View>
          <Text style={styles.policyNotice}>
            Final renter totals and owner earnings are calculated by MMG from the active pricing configuration. Chauffeured service and delivery are included.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  availabilityBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: 3,
  },
  availabilityCopy: {
    flex: 1,
  },
  availabilityIcon: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderRadius: radii.sm,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  availabilityRow: {
    alignItems: 'center',
    borderBottomColor: colors.graphiteRaised,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
    minHeight: 72,
  },
  availabilityTitle: {
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 15,
    fontWeight: '700',
  },
  backBtn: {
    backgroundColor: colors.gold,
    borderRadius: radii.md,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backBtnText: {
    color: colors.black,
    fontFamily: typography.body,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl + 40,
  },
  errorBox: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorTitle: {
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 16,
    marginTop: spacing.sm,
  },
  feedbackBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  feedbackContainer: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  feedbackHeading: {
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: 12,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  gridItem: {
    width: '45%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 15,
    fontWeight: '600',
  },
  heroImageContainer: {
    backgroundColor: '#1E1E1E',
    borderRadius: radii.lg,
    height: 180,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  itemLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
  },
  itemVal: {
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  loadingBox: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  policyNotice: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
    marginTop: spacing.sm,
  },
  rateLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  rateValue: {
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 14,
    fontWeight: '700',
  },
  safeArea: {
    backgroundColor: colors.black,
    flex: 1,
  },
  sectionCard: {
    backgroundColor: '#141414',
    borderColor: '#262626',
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  sectionHeader: {
    color: colors.goldStrong,
    fontFamily: typography.body,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  statusCard: {
    backgroundColor: '#141414',
    borderColor: '#262626',
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  statusHeading: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusValue: {
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  toggleGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  toggleText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
  },
});
