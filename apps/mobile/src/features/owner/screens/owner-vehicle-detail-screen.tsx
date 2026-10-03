import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { OwnerVisibleVehicle, VehicleVisibility } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
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
import { ScreenHeader } from '@/components/screen-header';
import { OwnerVehicleImage } from '../components/owner-vehicle-image';
import { createOwnerFleetGateway } from '../data/owner-fleet-gateway';

function safeVehicleErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('not found')) return 'This vehicle could not be found.';
  if (message.includes('permission') || message.includes('forbidden')) return 'You are not authorized to view this vehicle.';
  if (message.includes('stale') || message.includes('modified')) return 'This vehicle changed while you were viewing it. Return to Fleet and refresh.';
  return 'Vehicle details are unavailable. Please try again.';
}

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
      .then((value) => {
        if (!isMounted) return;
        setVehicle(value);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setErrorMsg(safeVehicleErrorMessage(err));
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
      const refreshed = await gateway.getOwnerVehicle(vehicle.vehicleId);
      setVehicle(refreshed);
    } catch (err: unknown) {
      Alert.alert('Update Failed', safeVehicleErrorMessage(err));
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

  const header = (
    <View style={styles.header}>
      <ScreenHeader
        onBack={() => router.back()}
        showBrand={false}
        title={vehicle?.displayName ?? 'Vehicle'}
      />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        {header}
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.gold} size="large" />
          <Text style={styles.loadingText}>Loading vehicle…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!vehicle || errorMsg) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        {header}
        <View style={styles.errorBox}>
          <Ionicons color={colors.danger} name="alert-circle" size={32} />
          <Text style={styles.errorTitle}>{errorMsg || 'Vehicle not found'}</Text>
          <PressableScale onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Return to Fleet</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      {header}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroImageContainer}>
          <OwnerVehicleImage vehicle={vehicle} style={StyleSheet.absoluteFill} />
        </View>

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
              <View style={styles.feedbackCopy}>
                <Text style={styles.feedbackHeading}>Moderator feedback</Text>
                <Text style={styles.feedbackBody}>{vehicle.lastDecisionReason}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {vehicle.moderationStatus === 'approved' ? (
          <PressableScale
            accessibilityHint="Opens the booking and owner-block calendar"
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
          </PressableScale>
        ) : null}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>SPECIFICATIONS</Text>
          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Make & Model</Text>
              <Text style={styles.itemVal}>{vehicle.make || vehicle.model ? `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() : 'Not set'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Year</Text>
              <Text style={styles.itemVal}>{vehicle.year ? String(vehicle.year) : 'Not set'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Category</Text>
              <Text style={styles.itemVal}>{vehicle.category === 'executive_suv' ? 'Executive SUV' : vehicle.category === 'executive_sedan' ? 'Executive Saloon' : 'Not set'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Seats</Text>
              <Text style={styles.itemVal}>{vehicle.seats ? `${vehicle.seats} Passengers` : 'Not set'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Transmission</Text>
              <Text style={styles.itemVal}>{vehicle.transmission ? vehicle.transmission.toUpperCase() : 'Not set'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Base Area</Text>
              <Text style={styles.itemVal}>{vehicle.areaLabel ?? 'Not set'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>FINANCIAL TERMS</Text>
          <View style={styles.rateRow}>
            <Text style={styles.rateLabel}>Owner daily rate</Text>
            <Text style={styles.rateValue}>
              {vehicle.ownerDailyRateKobo ? formatNairaFromKobo(vehicle.ownerDailyRateKobo) : 'Not set'}
            </Text>
          </View>
          <Text style={styles.policyNotice}>
            Final renter totals and owner earnings use MMG’s active pricing configuration.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  availabilityBody: { color: colors.muted, fontFamily: typography.body, fontSize: 12, marginTop: 3 },
  availabilityCopy: { flex: 1 },
  availabilityIcon: { alignItems: 'center', backgroundColor: colors.graphiteRaised, borderRadius: radii.sm, height: 44, justifyContent: 'center', width: 44 },
  availabilityRow: { alignItems: 'center', borderBottomColor: colors.graphiteRaised, borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg, minHeight: 72 },
  availabilityTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15 },
  backBtn: { backgroundColor: colors.gold, borderRadius: radii.button, marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  backBtnText: { color: colors.black, fontFamily: typography.bodySemiBold },
  content: { paddingBottom: spacing.xxl + 40, paddingHorizontal: spacing.lg },
  errorBox: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl },
  errorTitle: { color: colors.ivory, fontFamily: typography.body, fontSize: 16, marginTop: spacing.sm },
  feedbackBody: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: 2 },
  feedbackContainer: { backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: radii.sm, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md },
  feedbackCopy: { flex: 1 },
  feedbackHeading: { color: colors.danger, fontFamily: typography.bodySemiBold, fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridItem: { width: '45%' },
  header: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  heroImageContainer: { backgroundColor: '#1E1E1E', borderRadius: radii.lg, height: 180, marginBottom: spacing.md, overflow: 'hidden' },
  itemLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 11 },
  itemVal: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13, marginTop: 2 },
  loadingBox: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  loadingText: { color: colors.muted, fontFamily: typography.body, fontSize: 13, marginTop: spacing.sm },
  policyNotice: { color: colors.muted, fontFamily: typography.body, fontSize: 11, marginTop: spacing.sm },
  rateLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 13 },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  rateValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14 },
  safeArea: { backgroundColor: colors.black, flex: 1 },
  sectionCard: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: spacing.md, paddingBottom: spacing.md },
  sectionHeader: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1, marginBottom: spacing.sm },
  statusCard: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: spacing.md, paddingBottom: spacing.md },
  statusHeading: { color: colors.muted, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1 },
  statusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  statusValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 16, marginTop: 2 },
  toggleGroup: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  toggleText: { color: colors.muted, fontFamily: typography.body, fontSize: 12 },
});
