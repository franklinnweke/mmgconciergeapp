import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useReducer } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import {
  InlineNotice,
  PrimaryAction,
  SecondaryAction,
  SectionHeading,
} from '@/components/ui/mobile-primitives';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';

import { useBookings } from '../booking-context';
import {
  type RenterTripActionGateway,
  unavailableRenterTripActionGateway,
} from '../data/renter-trip-action-gateway';
import {
  initialRenterTripActionSession,
  reduceRenterTripActionSession,
  tripDetailMode,
  tripDetailPresentation,
} from '../domain/renter-trip-actions';
import {
  renterTripTimeline,
  tripStateCopy,
  type RenterTrip,
  type RenterTripAction,
} from '../domain/renter-trip';

type TripDetailScreenProps = {
  actionGateway?: RenterTripActionGateway;
  trip?: RenterTrip | null;
  tripId: string;
};

const actionCopy: Record<RenterTripAction, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  payment: { icon: 'lock-closed-outline', label: 'Continue to payment' },
  support: { icon: 'chatbubble-outline', label: 'Contact concierge' },
  cancellation: { icon: 'close-circle-outline', label: 'Request cancellation' },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  }).format(new Date(`${value}T12:00:00+01:00`));
}

export default function TripDetailScreen({
  actionGateway = unavailableRenterTripActionGateway,
  trip: tripOverride,
  tripId,
}: TripDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { initializing, syncError, syncState, trips } = useBookings();
  const [session, dispatch] = useReducer(reduceRenterTripActionSession, initialRenterTripActionSession);
  const trip = tripOverride !== undefined ? tripOverride : trips.find((candidate) => candidate.id === tripId) ?? null;
  const vehicle = trip?.vehicleSnapshot ?? null;
  const mode = tripDetailMode({ initializing, syncState, trip });

  async function perform(action: RenterTripAction) {
    if (session.pendingAction) return;
    dispatch({ type: 'start', action });
    try {
      await actionGateway.perform(action, tripId);
      dispatch({ type: 'finish', action });
    } catch (error) {
      dispatch({ type: 'finish', action, error });
    }
  }

  if (mode === 'initializing') {
    return (
      <View accessibilityLiveRegion="polite" style={styles.centered}>
        <ActivityIndicator color={colors.goldStrong} size="small" />
        <Text style={styles.centeredBody}>Loading trip</Text>
      </View>
    );
  }

  if (mode === 'missing' || !trip || !vehicle) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + spacing.xl }]}>
        <Ionicons color={colors.goldStrong} name="map-outline" size={28} />
        <Text accessibilityRole="header" style={styles.centeredTitle}>Trip unavailable</Text>
        <Text style={styles.centeredBody}>
          It may still be syncing, belong to another account, or no longer be available.
        </Text>
        <View style={styles.centeredAction}>
          <PrimaryAction icon="arrow-forward" label="Back to trips" onPress={() => router.replace('/(renter)/trips')} />
        </View>
      </View>
    );
  }

  const copy = tripStateCopy(trip.state);
  const presentation = tripDetailPresentation(trip);
  const timeline = renterTripTimeline(trip.state);
  const busy = session.pendingAction !== null;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image
            accessibilityLabel={vehicle.displayName}
            contentFit="cover"
            source={resolveVehicleImageSource(vehicle)}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(4,4,4,.45)', 'transparent', colors.black]}
            locations={[0, 0.48, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroTop, { paddingTop: insets.top + spacing.sm }]}>
            <PressableScale
              accessibilityLabel="Back to trips"
              accessibilityRole="button"
              onPress={() => router.back()}
              style={styles.backTarget}
            >
              <View style={styles.backTargetInner}>
                <Ionicons color={colors.ivory} name="arrow-back" size={22} />
              </View>
            </PressableScale>
          </View>
          <View style={styles.heroCopy}>
            <Text accessibilityRole="header" numberOfLines={2} style={styles.vehicleName}>{vehicle.displayName}</Text>
            <Text style={styles.vehicleMeta}>{vehicle.areaLabel} · Chauffeur included</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.stateBlock}>
            <Text style={styles.stateTitle}>{copy.title}</Text>
            <Text style={styles.stateBody}>{copy.body}</Text>
          </View>

          {mode === 'preview' ? (
            <InlineNotice icon="flask-outline">Preview trip. Actions do not affect live bookings.</InlineNotice>
          ) : null}
          {mode === 'offline' || syncError ? (
            <InlineNotice icon="cloud-offline-outline">
              {syncError ?? 'Showing the latest saved copy. Live updates are unavailable.'}
            </InlineNotice>
          ) : null}

          <View style={styles.dateRow}>
            <DatePoint label="Pickup" value={formatDate(trip.startDate)} />
            <Ionicons color={colors.muted} name="arrow-forward" size={17} />
            <DatePoint alignEnd label="Return" value={formatDate(trip.endDate)} />
          </View>

          <View style={styles.section}>
            <SectionHeading>Journey progress</SectionHeading>
            <View style={styles.timeline}>
              {timeline.map((step, index) => (
                <View key={step.id} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View
                      style={[
                        styles.timelineDot,
                        step.status === 'complete' && styles.timelineDotComplete,
                        step.status === 'current' && styles.timelineDotCurrent,
                      ]}
                    >
                      {step.status === 'complete' ? <Ionicons color={colors.black} name="checkmark" size={10} /> : null}
                    </View>
                    {index < timeline.length - 1 ? <View style={styles.timelineLine} /> : null}
                  </View>
                  <View style={styles.timelineCopy}>
                    <Text style={[styles.timelineLabel, step.status === 'upcoming' && styles.timelineUpcoming]}>
                      {step.label}{step.status === 'current' ? ' · Now' : ''}
                    </Text>
                    <Text style={styles.timelineDetail}>{step.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeading>Price</SectionHeading>
            <PriceRow
              label={`${trip.priceSnapshot.chargedDays} ${trip.priceSnapshot.chargedDays === 1 ? 'day' : 'days'}`}
              value={formatNairaFromKobo(trip.priceSnapshot.baseRentalKobo)}
            />
            <PriceRow label="Service and protection" value={formatNairaFromKobo(trip.priceSnapshot.serviceFeeKobo)} />
            {trip.priceSnapshot.deliveryFeeKobo ? (
              <PriceRow label="Delivery" value={formatNairaFromKobo(trip.priceSnapshot.deliveryFeeKobo)} />
            ) : null}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatNairaFromKobo(trip.priceSnapshot.renterTotalKobo)}</Text>
            </View>
            {trip.source !== 'live' ? (
              <Text style={styles.priceContext}>
                {trip.source === 'preview' ? 'Preview price' : 'Earlier request estimate'}
              </Text>
            ) : null}
          </View>

          {session.notice ? (
            <InlineNotice icon="information-circle-outline">{session.notice.message}</InlineNotice>
          ) : null}

          {session.confirmingCancellation ? (
            <View style={styles.confirmBlock}>
              <Text style={styles.confirmTitle}>Request cancellation?</Text>
              <Text style={styles.confirmBody}>
                MMG will review the request. The journey and any refund do not change until the server confirms it.
              </Text>
              <View style={styles.actions}>
                <SecondaryAction
                  disabled={busy}
                  label="Keep journey"
                  onPress={() => dispatch({ type: 'dismiss-cancellation' })}
                />
                <PrimaryAction
                  label="Send cancellation request"
                  loading={session.pendingAction === 'cancellation'}
                  onPress={() => void perform('cancellation')}
                />
              </View>
            </View>
          ) : null}

          {!session.confirmingCancellation && presentation.primary ? (
            <View style={styles.actions}>
              <PrimaryAction
                disabled={busy}
                icon={actionCopy[presentation.primary].icon}
                label={actionCopy[presentation.primary].label}
                loading={session.pendingAction === presentation.primary}
                onPress={() =>
                  presentation.primary === 'cancellation'
                    ? dispatch({ type: 'begin', action: 'cancellation' })
                    : void perform(presentation.primary!)
                }
              />
              {presentation.secondary.map((action) => (
                <SecondaryAction
                  destructive={action === 'cancellation'}
                  disabled={busy}
                  icon={actionCopy[action].icon}
                  key={action}
                  label={actionCopy[action].label}
                  onPress={() =>
                    action === 'cancellation'
                      ? dispatch({ type: 'begin', action: 'cancellation' })
                      : void perform(action)
                  }
                />
              ))}
            </View>
          ) : null}

          {presentation.isTerminal ? (
            <View style={styles.terminalRow}>
              <Ionicons color={colors.muted} name="checkmark-circle-outline" size={18} />
              <Text style={styles.terminalText}>No action is needed right now.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function DatePoint({ alignEnd, label, value }: { alignEnd?: boolean; label: string; value: string }) {
  return (
    <View style={[styles.datePoint, alignEnd && styles.datePointEnd]}>
      <Text style={styles.dateLabel}>{label}</Text>
      <Text style={styles.dateValue}>{value}</Text>
    </View>
  );
}

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.priceRow}>
      <Text style={styles.priceLabel}>{label}</Text>
      <Text style={styles.priceValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  backTarget: {
    height: 44,
    width: 44,
  },
  backTargetInner: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,4,4,.42)',
    borderRadius: radii.md,
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
    gap: spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  centeredAction: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  centeredBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  centeredTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 28,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  confirmBlock: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  confirmBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  confirmTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 22,
  },
  dateLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  datePoint: { flex: 1 },
  datePointEnd: { alignItems: 'flex-end' },
  dateRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
  },
  dateValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
    marginTop: 3,
  },
  hero: {
    height: 370,
  },
  heroCopy: {
    bottom: spacing.xl,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  heroTop: {
    left: spacing.md,
    position: 'absolute',
    top: 0,
  },
  priceContext: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
    marginTop: spacing.xs,
  },
  priceLabel: {
    color: colors.muted,
    flex: 1,
    fontFamily: typography.body,
    fontSize: 13,
  },
  priceRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  priceValue: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  section: {
    marginTop: spacing.xl,
  },
  stateBlock: {
    marginTop: spacing.sm,
  },
  stateBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  stateTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 28,
    letterSpacing: -0.45,
  },
  terminalRow: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingTop: spacing.md,
  },
  terminalText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  timeline: {
    marginTop: spacing.md,
  },
  timelineCopy: {
    flex: 1,
    paddingBottom: spacing.lg,
  },
  timelineDetail: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  timelineDot: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 16,
    justifyContent: 'center',
    width: 16,
  },
  timelineDotComplete: {
    backgroundColor: colors.goldStrong,
    borderColor: colors.goldStrong,
  },
  timelineDotCurrent: {
    borderColor: colors.goldStrong,
    borderWidth: 4,
  },
  timelineLabel: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
  },
  timelineLine: {
    backgroundColor: colors.line,
    flex: 1,
    marginVertical: 3,
    width: StyleSheet.hairlineWidth,
  },
  timelineRail: {
    alignItems: 'center',
    marginRight: spacing.md,
    width: 16,
  },
  timelineRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
  },
  timelineUpcoming: {
    color: colors.muted,
  },
  totalLabel: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
  },
  totalRow: {
    alignItems: 'baseline',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.md,
  },
  totalValue: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 25,
  },
  vehicleMeta: {
    color: colors.silver,
    fontFamily: typography.body,
    fontSize: 13,
    marginTop: 5,
  },
  vehicleName: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 31,
    letterSpacing: -0.55,
  },
});
