import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { OwnerVisibleVehicle, VehicleVisibility } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { OwnerVehicleImage } from '../components/owner-vehicle-image';
import { createOwnerFleetGateway } from '../data/owner-fleet-gateway';

function statusCopy(vehicle: OwnerVisibleVehicle): { label: string; body: string } {
  if (vehicle.moderationStatus === 'draft') {
    return { label: 'Draft', body: 'Finish the listing and submit it when the details are ready.' };
  }
  if (vehicle.moderationStatus === 'pending_review') {
    return { label: 'Under review', body: 'MMG is reviewing this vehicle before it can go live.' };
  }
  if (vehicle.moderationStatus === 'rejected') {
    return { label: 'Changes requested', body: vehicle.lastDecisionReason || 'Update the requested details and send this same listing back for review.' };
  }
  if (vehicle.moderationStatus === 'suspended') {
    return { label: 'Suspended', body: vehicle.lastDecisionReason || 'This listing is paused by MMG operations.' };
  }
  return {
    label: vehicle.visibility === 'active' ? 'Approved and live' : 'Approved and paused',
    body: vehicle.visibility === 'active' ? 'Renters can discover this vehicle.' : 'The listing is approved but currently hidden from renter discovery.',
  };
}

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('stale') || message.includes('modified')) return 'This vehicle changed while you were viewing it. Reopen it from Fleet.';
  if (message.includes('permission') || message.includes('forbidden')) return 'You are not authorized to manage this vehicle.';
  return 'Vehicle details are unavailable. Please try again.';
}

export function OwnerVehicleManagementScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gateway = useMemo(() => createOwnerFleetGateway(), []);
  const [vehicle, setVehicle] = useState<OwnerVisibleVehicle | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!id) {
      queueMicrotask(() => {
        if (!active) return;
        setError('This vehicle could not be found.');
        setLoading(false);
      });
      return () => { active = false; };
    }

    void gateway.getOwnerVehicle(id)
      .then((next) => {
        if (!active) return;
        setVehicle(next);
        setError(next ? null : 'This vehicle could not be found.');
      })
      .catch((caught: unknown) => {
        if (active) setError(safeMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [gateway, id]);

  const toggleVisibility = async () => {
    if (!vehicle || busy) return;
    const visibility: VehicleVisibility = vehicle.visibility === 'active' ? 'paused' : 'active';
    setBusy(true);
    try {
      await gateway.setVisibility({
        vehicleId: vehicle.vehicleId,
        expectedVersion: vehicle.version,
        visibility,
      });
      const refreshed = await gateway.getOwnerVehicle(vehicle.vehicleId);
      setVehicle(refreshed);
    } catch (caught) {
      Alert.alert('Could not update visibility', safeMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}><ScreenHeader onBack={() => router.back()} showBrand={false} title="Vehicle" /></View>
        <View style={styles.center}><ActivityIndicator color={colors.goldStrong} /><Text style={styles.muted}>Loading vehicle…</Text></View>
      </SafeAreaView>
    );
  }

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}><ScreenHeader onBack={() => router.back()} showBrand={false} title="Vehicle" /></View>
        <View style={styles.center}>
          <Ionicons color={colors.danger} name="alert-circle-outline" size={30} />
          <Text style={styles.body}>{error || 'Vehicle unavailable.'}</Text>
          <PressableScale onPress={() => router.back()}><Text style={styles.link}>Return to Fleet</Text></PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  const presentation = statusCopy(vehicle);
  const editable = vehicle.moderationStatus === 'draft' || vehicle.moderationStatus === 'rejected';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}><ScreenHeader onBack={() => router.back()} showBrand={false} title={vehicle.displayName} /></View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <OwnerVehicleImage vehicle={vehicle} style={StyleSheet.absoluteFill} />
        </View>

        <View style={styles.statusSection}>
          <View style={styles.statusTop}>
            <View style={styles.flex}>
              <Text style={styles.statusLabel}>{presentation.label}</Text>
              <Text style={styles.muted}>{presentation.body}</Text>
            </View>
            {vehicle.moderationStatus === 'approved' ? (
              <View style={styles.switchGroup}>
                <Text style={styles.muted}>{vehicle.visibility === 'active' ? 'Live' : 'Paused'}</Text>
                <Switch
                  disabled={busy}
                  onValueChange={() => void toggleVisibility()}
                  thumbColor={vehicle.visibility === 'active' ? colors.gold : colors.muted}
                  trackColor={{ false: colors.graphite, true: 'rgba(212,175,55,0.4)' }}
                  value={vehicle.visibility === 'active'}
                />
              </View>
            ) : null}
          </View>

          {editable ? (
            <PressableScale
              onPress={() => router.push({
                pathname: '/(owner)/add-vehicle',
                params: { vehicleId: vehicle.vehicleId },
              } as Href)}
            >
              <View style={styles.primaryButton}>
                <Text style={styles.primaryText}>{vehicle.moderationStatus === 'rejected' ? 'Fix and resubmit listing' : 'Continue listing'}</Text>
              </View>
            </PressableScale>
          ) : null}
        </View>

        {vehicle.moderationStatus === 'approved' ? (
          <PressableScale
            onPress={() => router.push({ pathname: '/(owner)/fleet/[id]/availability', params: { id: vehicle.vehicleId } } as Href)}
            style={styles.actionRow}
          >
            <Ionicons color={colors.goldStrong} name="calendar-outline" size={21} />
            <View style={styles.flex}>
              <Text style={styles.actionTitle}>Manage availability</Text>
              <Text style={styles.muted}>Block dates or review reserved journey dates.</Text>
            </View>
          </PressableScale>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle details</Text>
          <DetailRow label="Make and model" value={vehicle.make || vehicle.model ? `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() : 'Not set'} />
          <DetailRow label="Year" value={vehicle.year ? String(vehicle.year) : 'Not set'} />
          <DetailRow label="Category" value={vehicle.category === 'executive_suv' ? 'Executive SUV' : vehicle.category === 'executive_sedan' ? 'Executive sedan' : 'Not set'} />
          <DetailRow label="Seats" value={vehicle.seats ? String(vehicle.seats) : 'Not set'} />
          <DetailRow label="Base area" value={vehicle.areaLabel ?? 'Not set'} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Owner rate</Text>
          <DetailRow label="Daily rate" value={vehicle.ownerDailyRateKobo ? formatNairaFromKobo(vehicle.ownerDailyRateKobo) : 'Not set'} />
          <Text style={styles.muted}>Final renter totals and owner earnings use MMG’s active server pricing configuration.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 74, paddingVertical: spacing.md },
  actionTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15 },
  body: { color: colors.ivory, fontFamily: typography.body, fontSize: 14, textAlign: 'center' },
  center: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.lg },
  content: { gap: spacing.lg, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  detailLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 13 },
  detailRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48 },
  detailValue: { color: colors.ivory, flexShrink: 1, fontFamily: typography.bodyMedium, fontSize: 13, textAlign: 'right' },
  flex: { flex: 1 },
  header: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  hero: { backgroundColor: colors.graphiteRaised, borderRadius: radii.lg, height: 190, overflow: 'hidden' },
  link: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 14, padding: spacing.sm },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, justifyContent: 'center', marginTop: spacing.md, minHeight: 50 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  screen: { backgroundColor: colors.black, flex: 1 },
  section: { gap: spacing.xs },
  sectionTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 16 },
  statusLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 17, marginBottom: 3 },
  statusSection: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: spacing.lg },
  statusTop: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  switchGroup: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
});
