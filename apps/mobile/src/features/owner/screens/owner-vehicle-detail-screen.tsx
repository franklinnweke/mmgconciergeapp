import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { OwnerVisibleVehicle, VehicleVisibility } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { InlineNotice, PrimaryAction, SectionHeading } from '@/components/ui/mobile-primitives';
import { normalizeVehicleImageUrl } from '@/features/discovery/data/vehicle-images';
import { createOwnerFleetGateway } from '../data/owner-fleet-gateway';

function safeVehicleErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('not found')) return 'This vehicle could not be found.';
  if (message.includes('permission') || message.includes('forbidden')) return 'You are not authorized to view this vehicle.';
  if (message.includes('stale') || message.includes('modified')) return 'This vehicle changed while you were viewing it. Return to Fleet and refresh.';
  return 'Vehicle details are unavailable. Please try again.';
}

function moderationLabel(vehicle: OwnerVisibleVehicle) {
  if (vehicle.moderationStatus === 'approved') return vehicle.visibility === 'active' ? 'Approved · Live' : 'Approved · Paused';
  if (vehicle.moderationStatus === 'pending_review') return 'Under review';
  if (vehicle.moderationStatus === 'draft') return 'Draft';
  if (vehicle.moderationStatus === 'rejected') return 'Needs changes';
  return 'Suspended';
}

function ownerImageUrl(vehicle: OwnerVisibleVehicle): string | null {
  const path = vehicle.primaryImagePath?.trim();
  if (!path || !/^https?:\/\//i.test(path)) return null;
  return normalizeVehicleImageUrl(path);
}

function categoryLabel(value: OwnerVisibleVehicle['category']) {
  if (value === 'executive_suv') return 'Executive SUV';
  if (value === 'executive_sedan') return 'Executive sedan';
  if (value === 'luxury_van') return 'Luxury van';
  if (value === 'presidential_armored') return 'Presidential armored';
  return null;
}

function ownerRateLabel(vehicle: OwnerVisibleVehicle): string {
  return typeof vehicle.ownerDailyRateKobo === 'number' && vehicle.ownerDailyRateKobo > 0
    ? formatNairaFromKobo(vehicle.ownerDailyRateKobo)
    : 'Rate not set';
}

export function OwnerVehicleDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      .then((nextVehicle) => {
        if (!isMounted) return;
        setVehicle(nextVehicle);
        setErrorMsg(null);
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
      setVehicle(await gateway.getOwnerVehicle(vehicle.vehicleId));
    } catch (err: unknown) {
      Alert.alert('Could not update listing', safeVehicleErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.goldStrong} size="small" />
        <Text style={styles.centeredText}>Loading vehicle</Text>
      </View>
    );
  }

  if (!vehicle || errorMsg) {
    return (
      <View style={[styles.fallback, { paddingTop: insets.top + spacing.sm }]}>
        <PressableScale accessibilityLabel="Back to fleet" accessibilityRole="button" onPress={() => router.back()}>
          <View style={styles.backTarget}><Ionicons color={colors.ivory} name="arrow-back" size={22} /></View>
        </PressableScale>
        <View style={styles.fallbackCopy}>
          <Ionicons color={colors.danger} name="alert-circle-outline" size={30} />
          <Text style={styles.fallbackTitle}>Vehicle unavailable</Text>
          <Text style={styles.fallbackText}>{errorMsg ?? 'This vehicle could not be found.'}</Text>
          <View style={styles.fallbackAction}>
            <PrimaryAction label="Back to fleet" onPress={() => router.back()} />
          </View>
        </View>
      </View>
    );
  }

  const imageUrl = ownerImageUrl(vehicle);
  const category = categoryLabel(vehicle.category);
  const facts = [
    vehicle.make && vehicle.model ? { label: 'Vehicle', value: `${vehicle.make} ${vehicle.model}` } : null,
    vehicle.year ? { label: 'Year', value: String(vehicle.year) } : null,
    category ? { label: 'Category', value: category } : null,
    vehicle.seats ? { label: 'Passengers', value: String(vehicle.seats) } : null,
    vehicle.transmission ? { label: 'Transmission', value: vehicle.transmission.charAt(0).toUpperCase() + vehicle.transmission.slice(1) } : null,
    vehicle.fuelType ? { label: 'Fuel', value: vehicle.fuelType.charAt(0).toUpperCase() + vehicle.fuelType.slice(1) } : null,
    vehicle.colour ? { label: 'Colour', value: vehicle.colour } : null,
    vehicle.areaLabel ? { label: 'Base area', value: vehicle.areaLabel } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {imageUrl ? (
            <Image contentFit="cover" source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={styles.heroFallback}>
              <Ionicons color={colors.muted} name="image-outline" size={31} />
              <Text style={styles.heroFallbackText}>{vehicle.imageCount ? 'Vehicle photo unavailable' : 'No vehicle photo yet'}</Text>
            </View>
          )}
          <LinearGradient colors={['rgba(4,4,4,.5)', 'transparent', colors.black]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
          <View style={[styles.heroTop, { paddingTop: insets.top + spacing.sm }]}>
            <PressableScale accessibilityLabel="Back to fleet" accessibilityRole="button" onPress={() => router.back()}>
              <View style={styles.heroBack}><Ionicons color={colors.ivory} name="arrow-back" size={22} /></View>
            </PressableScale>
          </View>
          <View style={styles.heroCopy}>
            <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{vehicle.displayName}</Text>
            <Text style={styles.status}>{moderationLabel(vehicle)}</Text>
          </View>
        </View>

        <View style={styles.body}>
          {vehicle.moderationStatus === 'rejected' && vehicle.lastDecisionReason ? (
            <InlineNotice icon="information-circle-outline" tone="danger">{vehicle.lastDecisionReason}</InlineNotice>
          ) : null}

          {vehicle.moderationStatus === 'approved' ? (
            <View style={styles.visibilitySection}>
              <View style={styles.visibilityCopy}>
                <Text style={styles.visibilityTitle}>{vehicle.visibility === 'active' ? 'Visible to renters' : 'Listing paused'}</Text>
                <Text style={styles.visibilityBody}>{vehicle.visibility === 'active' ? 'Renters can discover and request this vehicle.' : 'The listing remains approved but hidden from discovery.'}</Text>
              </View>
              <Switch
                accessibilityLabel="Vehicle visibility"
                disabled={actionLoading}
                ios_backgroundColor={colors.graphiteRaised}
                onValueChange={() => void handleToggleVisibility()}
                thumbColor={vehicle.visibility === 'active' ? colors.goldStrong : colors.muted}
                trackColor={{ false: colors.graphiteRaised, true: 'rgba(227,195,101,.38)' }}
                value={vehicle.visibility === 'active'}
              />
            </View>
          ) : null}

          {vehicle.moderationStatus === 'approved' ? (
            <PressableScale
              accessibilityHint="Opens the vehicle calendar"
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/(owner)/fleet/[id]/availability' as never,
                  params: { id: vehicle.vehicleId },
                })
              }
            >
              <View style={styles.availabilityRow}>
                <Ionicons color={colors.goldStrong} name="calendar-outline" size={21} />
                <View style={styles.availabilityCopy}>
                  <Text style={styles.availabilityTitle}>Availability</Text>
                  <Text style={styles.availabilityBody}>Block dates and review reserved periods.</Text>
                </View>
                <Ionicons color={colors.muted} name="chevron-forward" size={18} />
              </View>
            </PressableScale>
          ) : null}

          {facts.length ? (
            <View style={styles.section}>
              <SectionHeading>Vehicle details</SectionHeading>
              <View style={styles.factList}>
                {facts.map((fact) => <FactRow key={fact.label} {...fact} />)}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeading>Rate</SectionHeading>
            <View style={styles.rateRow}>
              <Text style={styles.rateLabel}>Owner daily rate</Text>
              <Text style={styles.rateValue}>{ownerRateLabel(vehicle)}</Text>
            </View>
            <Text style={styles.rateNote}>MMG calculates renter totals and owner earnings from the active pricing configuration. Chauffeur service and Lagos delivery are included.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  availabilityBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: 2,
  },
  availabilityCopy: { flex: 1 },
  availabilityRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 70,
    paddingVertical: spacing.sm,
  },
  availabilityTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
  },
  backTarget: {
    alignItems: 'flex-start',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  body: {
    paddingHorizontal: spacing.md,
  },
  centered: {
    alignItems: 'center',
    backgroundColor: colors.black,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  centeredText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  factLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  factList: { marginTop: spacing.sm },
  factRow: {
    alignItems: 'baseline',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: spacing.md,
  },
  factValue: {
    color: colors.silver,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    textAlign: 'right',
  },
  fallback: {
    backgroundColor: colors.black,
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  fallbackAction: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  fallbackCopy: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  fallbackText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  fallbackTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 27,
    marginTop: spacing.md,
  },
  hero: {
    backgroundColor: colors.graphite,
    height: 390,
  },
  heroBack: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,4,4,.42)',
    borderRadius: radii.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  heroCopy: {
    bottom: spacing.xl,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  heroFallback: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
  },
  heroFallbackText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  heroTop: {
    left: spacing.md,
    position: 'absolute',
    top: 0,
  },
  rateLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  rateNote: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  rateRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  rateValue: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 23,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  section: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
  },
  status: {
    color: colors.goldStrong,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    marginTop: 5,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 31,
    letterSpacing: -0.55,
  },
  visibilityBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
    maxWidth: 255,
  },
  visibilityCopy: { flex: 1 },
  visibilitySection: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  visibilityTitle: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
});
