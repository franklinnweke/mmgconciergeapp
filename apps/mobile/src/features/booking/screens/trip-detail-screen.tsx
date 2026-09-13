import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { BookingCancellationQuote } from '@mmg/contracts/cancellation';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { safeProviderError } from '@/core/errors/safe-provider-error';
import { resolveVehicleImageSource } from '@/features/discovery/data/vehicle-images';

import { useBookings } from '../booking-context';
import { RenterPaymentCheckout } from '../components/renter-payment-checkout';
import {
  createRenterCancellationGateway,
  type RenterCancellationGateway,
} from '../data/renter-cancellation-gateway';
import {
  type RenterTripActionGateway,
  unavailableRenterTripActionGateway,
} from '../data/renter-trip-action-gateway';
import {
  createRentalRequestGateway,
  type RentalRequestGateway,
} from '../data/rental-request-gateway';
import {
  initialRenterTripActionSession,
  reduceRenterTripActionSession,
  splitRenterTripActions,
  tripDetailMode,
  tripDetailPresentation,
} from '../domain/renter-trip-actions';
import {
  isTerminalState,
  renterTripTimeline,
  tripStateCopy,
  type RenterTrip,
  type RenterTripAction,
} from '../domain/renter-trip';

type TripDetailScreenProps = {
  actionGateway?: RenterTripActionGateway;
  cancellationGateway?: RenterCancellationGateway;
  rentalRequestGateway?: RentalRequestGateway;
  trip?: RenterTrip | null;
  tripId: string;
};

const actionCopy: Record<RenterTripAction, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  payment: { icon: 'lock-closed-outline', label: 'Pay securely' },
  support: { icon: 'chatbubble-outline', label: 'Contact concierge' },
  cancellation: { icon: 'close-circle-outline', label: 'Cancel request' },
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
  cancellationGateway,
  rentalRequestGateway,
  trip: tripOverride,
  tripId,
}: TripDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { initializing, refreshRentalRequests, syncError, syncState, trips } = useBookings();
  const [session, dispatch] = useReducer(reduceRenterTripActionSession, initialRenterTripActionSession);
  const [cancellationQuote, setCancellationQuote] = useState<BookingCancellationQuote | null>(null);
  const [cancellationError, setCancellationError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const requestGateway = useMemo(
    () => rentalRequestGateway ?? createRentalRequestGateway(),
    [rentalRequestGateway],
  );
  const paidCancellationGateway = useMemo(
    () => cancellationGateway ?? createRenterCancellationGateway(),
    [cancellationGateway],
  );
  const trip = tripOverride !== undefined ? tripOverride : trips.find((candidate) => candidate.id === tripId) ?? null;
  const [prevTripId, setPrevTripId] = useState(tripId);
  const [hasAttemptedRefresh, setHasAttemptedRefresh] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  if (prevTripId !== tripId) {
    setPrevTripId(tripId);
    setHasAttemptedRefresh(false);
    setIsRefreshing(false);
    setRefreshError(null);
  }

  useEffect(() => {
    let isMounted = true;
    if (
      tripOverride === undefined &&
      !trip &&
      tripId &&
      !initializing &&
      !hasAttemptedRefresh &&
      !isRefreshing
    ) {
      queueMicrotask(() => {
        if (!isMounted) return;
        setHasAttemptedRefresh(true);
        setIsRefreshing(true);
        setRefreshError(null);
        void refreshRentalRequests()
          .catch((err: unknown) => {
            if (!isMounted) return;
            setRefreshError(err instanceof Error ? err.message : 'Could not refresh trip details.');
          })
          .finally(() => {
            if (!isMounted) return;
            setIsRefreshing(false);
          });
      });
    }
    return () => {
      isMounted = false;
    };
  }, [hasAttemptedRefresh, initializing, isRefreshing, refreshRentalRequests, trip, tripId, tripOverride]);

  const handleRetryRefresh = () => {
    setIsRefreshing(true);
    setRefreshError(null);
    void refreshRentalRequests()
      .catch((err: unknown) => {
        setRefreshError(err instanceof Error ? err.message : 'Could not refresh trip details.');
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  };

  const vehicle = trip?.vehicleSnapshot ?? null;
  const vehicleImage = resolveVehicleImageSource(vehicle);
  const mode = tripDetailMode({
    initializing,
    syncState,
    trip,
  });

  async function beginCancellation() {
    if (!trip || session.pendingAction || quoteLoading) return;
    setCancellationError(null);
    setCancellationQuote(null);

    if (trip.source !== 'trusted') {
      dispatch({ type: 'begin', action: 'cancellation' });
      return;
    }

    setQuoteLoading(true);
    try {
      const result = await paidCancellationGateway.quoteBooking(trip.id);
      setCancellationQuote(result.quote);
      dispatch({ type: 'begin', action: 'cancellation' });
    } catch (error) {
      setCancellationError(safeProviderError(
        error,
        'Cancellation terms could not be loaded. Your booking has not changed.',
      ));
    } finally {
      setQuoteLoading(false);
    }
  }

  async function perform(action: RenterTripAction) {
    if (!trip || session.pendingAction) return;
    dispatch({ type: 'start', action });
    try {
      if (action === 'cancellation' && trip.source === 'request') {
        if (!trip.requestVersion) throw new Error('Refresh this request before cancelling.');
        await requestGateway.cancelRequest(trip.id, trip.requestVersion);
        await refreshRentalRequests();
        dispatch({ type: 'finish', action });
        router.replace('/(renter)/trips');
        return;
      }

      if (action === 'cancellation' && trip.source === 'trusted') {
        if (!cancellationQuote?.selfServiceAllowed || !cancellationQuote.bookingVersion) {
          throw new Error('This booking needs concierge review before it can be cancelled.');
        }
        await paidCancellationGateway.cancelBooking(trip.id, cancellationQuote.bookingVersion);
        await refreshRentalRequests();
        dispatch({ type: 'finish', action });
        router.replace('/(renter)/trips');
        return;
      }

      await actionGateway.perform(action, tripId);
      dispatch({ type: 'finish', action });
    } catch (error) {
      dispatch({ type: 'finish', action, error });
    }
  }

  if (mode === 'initializing' || isRefreshing) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.stateHeader}>
          <ScreenHeader backAccessibilityLabel="Back to trips" onBack={() => router.back()} />
        </View>
        <View accessibilityLiveRegion="polite" style={styles.centeredContent}>
          <ActivityIndicator color={colors.goldStrong} size="small" />
          <Text style={styles.loadingText}>Loading trip details…</Text>
        </View>
      </View>
    );
  }

  if (mode === 'missing' || !trip || !vehicle) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.stateHeader}>
          <ScreenHeader backAccessibilityLabel="Back to trips" onBack={() => router.replace('/(renter)/trips')} />
        </View>
        <View style={styles.centeredContent}>
          <View style={styles.missingIcon}>
            <Ionicons color={colors.goldStrong} name="map-outline" size={27} />
          </View>
          <Text style={styles.centeredEyebrow}>Trip not found</Text>
          <Text accessibilityRole="header" style={styles.centeredTitle}>This trip is not available on this device.</Text>
          <Text style={styles.centeredBody}>
            {refreshError
              ? `Could not refresh trip details: ${refreshError}`
              : 'It may still be syncing, belong to another account, or no longer be available.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            {refreshError ? (
              <PressableScale accessibilityLabel="Retry loading trip" accessibilityRole="button" onPress={handleRetryRefresh}>
                <View style={styles.goldButton}>
                  <Text style={styles.goldButtonText}>Try again</Text>
                </View>
              </PressableScale>
            ) : null}
            <PressableScale accessibilityLabel="Back to trips" accessibilityRole="button" onPress={() => router.replace('/(renter)/trips')}>
              <View style={[styles.goldButton, refreshError ? { backgroundColor: colors.graphite, borderColor: colors.line, borderWidth: 1 } : undefined]}>
                <Text style={[styles.goldButtonText, refreshError ? { color: colors.ivory } : undefined]}>Back to trips</Text>
              </View>
            </PressableScale>
          </View>
        </View>
      </View>
    );
  }

  const copy = tripStateCopy(trip.state);
  const presentation = tripDetailPresentation(trip);
  const renderedActions = (() => {
    const hasSupport = actionGateway !== unavailableRenterTripActionGateway;
    const connectedActions = presentation.actions.filter((action) => {
      if (action === 'cancellation') {
        return trip.source === 'request' || trip.source === 'trusted';
      }
      if (action === 'payment') {
        return true;
      }
      if (action === 'support') {
        return hasSupport;
      }
      return false;
    });
    return {
      actions: connectedActions,
      ...splitRenterTripActions(connectedActions),
      isTerminal: isTerminalState(trip.state),
    };
  })();
  const timeline = renterTripTimeline(trip.state);
  const busy = session.pendingAction !== null || quoteLoading;
  const requestFirstPayment = trip.source === 'request'
    && trip.state === 'ready_for_payment'
    && Boolean(trip.intentId)
    && Boolean(trip.holdExpiresAt);
  const requestCancellation = trip.source === 'request';
  const selfServicePaidCancellation = cancellationQuote?.selfServiceAllowed === true
    && Boolean(cancellationQuote.bookingVersion);

  return (
    <View style={styles.screen}>
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Image accessibilityLabel={vehicle.displayName} contentFit="cover" source={vehicleImage} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={['rgba(4,4,4,.42)', 'transparent', colors.black]} locations={[0, .46, 1]} style={StyleSheet.absoluteFill} />
            <ScreenHeader
              backAccessibilityLabel="Back to trips"
              onBack={() => router.back()}
              style={[styles.heroTop, { paddingTop: insets.top + spacing.sm }]}
            />
            <View style={styles.heroCopy}>
              <Text accessibilityRole="header" style={styles.vehicleName}>{vehicle.displayName}</Text>
              <Text style={styles.vehicleMeta}>{vehicle.areaLabel} · Chauffeur included</Text>
            </View>
          </View>

          <View style={styles.body}>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.subtitle}>{copy.body}</Text>
            {mode === 'offline' || syncError ? (
              <View accessibilityLiveRegion="polite" style={styles.offlineNotice}>
                <Ionicons color={colors.goldStrong} name="cloud-offline-outline" size={16} />
                <Text style={styles.offlineNoticeText}>
                  {syncError ?? 'Showing a cached copy. Live updates are unavailable.'}
                </Text>
              </View>
            ) : null}

            <View style={styles.dateCard}>
              <DatePoint label="Pickup" value={formatDate(trip.startDate)} />
              <View style={styles.dateDivider}>
                <Ionicons color={colors.gold} name="arrow-forward" size={16} />
              </View>
              <DatePoint label="Return" value={formatDate(trip.endDate)} />
            </View>

            {timeline.length > 1 ? (
              <>
                <SectionTitle label="Timeline" />
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
                          {step.status === 'complete' ? <Ionicons color={colors.black} name="checkmark" size={11} /> : null}
                        </View>
                        {index < timeline.length - 1 ? <View style={styles.timelineLine} /> : null}
                      </View>
                      <View style={styles.timelineCopy}>
                        <Text style={[styles.timelineLabel, step.status === 'upcoming' && styles.timelineUpcoming]}>
                          {step.label}
                          {step.status === 'current' ? ' · Now' : step.status === 'complete' ? ' · Done' : ''}
                        </Text>
                        <Text style={styles.timelineDetail}>{step.detail}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <SectionTitle label="Price" />
            <View style={styles.priceCard}>
              <PriceRow
                label={`${trip.priceSnapshot.chargedDays} charged day${trip.priceSnapshot.chargedDays === 1 ? '' : 's'}`}
                value={formatNairaFromKobo(trip.priceSnapshot.baseRentalKobo)}
              />
              <PriceRow label="Service and protection" value={formatNairaFromKobo(trip.priceSnapshot.serviceFeeKobo)} />
              {trip.priceSnapshot.deliveryFeeKobo ? (
                <PriceRow label="Delivery" value={formatNairaFromKobo(trip.priceSnapshot.deliveryFeeKobo)} />
              ) : null}
              <View style={styles.priceRule} />
              <View style={styles.priceTotalRow}>
                <Text style={styles.priceTotalLabel}>
                  {trip.state === 'confirmed' || trip.state === 'in_progress' || trip.state === 'completed'
                    ? 'Total'
                    : 'Estimated total'}
                </Text>
                <Text style={styles.priceTotal}>{formatNairaFromKobo(trip.priceSnapshot.renterTotalKobo)}</Text>
              </View>
            </View>

            {cancellationError ? (
              <View accessibilityLiveRegion="polite" style={styles.notice}>
                <Ionicons color={colors.goldStrong} name="alert-circle-outline" size={19} />
                <Text style={styles.noticeText}>{cancellationError}</Text>
              </View>
            ) : null}

            {session.notice ? (
              <View accessibilityLiveRegion="polite" style={styles.notice}>
                <Ionicons color={colors.goldStrong} name="information-circle-outline" size={19} />
                <Text style={styles.noticeText}>{session.notice.message}</Text>
              </View>
            ) : null}

            {session.confirmingCancellation ? (
              <View style={styles.confirmCard}>
                <Text style={styles.confirmTitle}>
                  {requestCancellation ? 'Cancel this request?' : 'Cancel this paid booking?'}
                </Text>
                {requestCancellation ? (
                  <Text style={styles.confirmBody}>
                    No payment has been confirmed. If checkout has not started, MMG will cancel the request and release any active hold immediately. If Paystack is already processing, the hold stays protected until payment resolves and MMG will then finish the cancellation safely.
                  </Text>
                ) : cancellationQuote ? (
                  <>
                    <Text style={styles.confirmBody}>{cancellationQuote.consequenceText}</Text>
                    <View style={styles.cancellationFacts}>
                      <PriceRow label="Payment captured" value={formatNairaFromKobo(cancellationQuote.amountPaidKobo)} />
                      <PriceRow label="Cancellation policy" value={cancellationQuote.cancellationPolicyVersion} />
                      <PriceRow label="Refund amount" value="Pending manual review" />
                    </View>
                  </>
                ) : (
                  <Text style={styles.confirmBody}>Cancellation terms are unavailable. Your booking has not changed.</Text>
                )}
                <View style={styles.confirmActions}>
                  <ActionButton
                    disabled={busy}
                    icon="arrow-back"
                    label="Keep trip"
                    onPress={() => {
                      setCancellationQuote(null);
                      setCancellationError(null);
                      dispatch({ type: 'dismiss-cancellation' });
                    }}
                    secondary
                  />
                  {(requestCancellation || selfServicePaidCancellation) ? (
                    <ActionButton
                      disabled={busy}
                      icon="close-circle-outline"
                      label={requestCancellation ? 'Cancel request' : 'Confirm cancellation'}
                      loading={session.pendingAction === 'cancellation'}
                      onPress={() => void perform('cancellation')}
                    />
                  ) : null}
                </View>
                {!requestCancellation && cancellationQuote && !cancellationQuote.selfServiceAllowed ? (
                  <Text style={styles.confirmBody}>Contact MMG Concierge for manual review. No inventory or refund state has changed.</Text>
                ) : null}
              </View>
            ) : null}

            {requestFirstPayment && trip.intentId && trip.holdExpiresAt ? (
              <>
                <RenterPaymentCheckout
                  holdExpiresAt={trip.holdExpiresAt}
                  intentId={trip.intentId}
                  mode="request_first"
                  onRestartHold={() => { void refreshRentalRequests(); }}
                  onViewTrips={() => {
                    void refreshRentalRequests();
                    router.replace('/(renter)/trips');
                  }}
                />
                {!session.confirmingCancellation ? (
                  <View style={styles.actions}>
                    <ActionButton
                      disabled={busy}
                      icon="close-circle-outline"
                      label={quoteLoading ? 'Checking…' : 'Cancel request'}
                      onPress={() => void beginCancellation()}
                      secondary
                    />
                  </View>
                ) : null}
              </>
            ) : null}

            {!requestFirstPayment && !session.confirmingCancellation && renderedActions.primary ? (
              <View style={styles.actions}>
                <ActionButton
                  disabled={busy}
                  icon={actionCopy[renderedActions.primary].icon}
                  label={renderedActions.primary === 'cancellation' && quoteLoading ? 'Checking…' : actionCopy[renderedActions.primary].label}
                  loading={session.pendingAction === renderedActions.primary}
                  onPress={() => renderedActions.primary === 'cancellation'
                    ? void beginCancellation()
                    : void perform(renderedActions.primary!)}
                />
                {renderedActions.secondary.map((action) => (
                  <ActionButton
                    key={action}
                    disabled={busy}
                    icon={actionCopy[action].icon}
                    label={action === 'cancellation' && quoteLoading ? 'Checking…' : actionCopy[action].label}
                    loading={session.pendingAction === action}
                    onPress={() => action === 'cancellation'
                      ? void beginCancellation()
                      : void perform(action)}
                    secondary
                  />
                ))}
              </View>
            ) : null}

            {renderedActions.isTerminal ? (
              <View style={styles.terminalNote}>
                <Ionicons color={colors.muted} name="checkmark-circle-outline" size={18} />
                <Text style={styles.terminalText}>No journey action is required in this state.</Text>
              </View>
            ) : null}

            {!renderedActions.isTerminal && renderedActions.actions.length === 0 ? (
              <View style={styles.terminalNote}>
                <Ionicons
                  color={colors.goldStrong}
                  name={
                    trip.state === 'needs_attention' ||
                    trip.state === 'intervention_required' ||
                    trip.state === 'paid_conflict'
                      ? 'information-circle-outline'
                      : 'hourglass-outline'
                  }
                  size={18}
                />
                <Text style={styles.terminalText}>
                  {trip.state === 'needs_attention' ||
                  trip.state === 'intervention_required' ||
                  trip.state === 'paid_conflict'
                    ? 'MMG Concierge is resolving this booking. Our team will reach out directly.'
                    : copy.body}
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function DatePoint({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.datePoint}>
      <Text style={styles.dateLabel}>{label}</Text>
      <Text style={styles.dateValue}>{value}</Text>
    </View>
  );
}

function SectionTitle({ label }: { label: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionLine} />
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

function ActionButton({
  disabled,
  icon,
  label,
  loading,
  onPress,
  secondary = false,
}: {
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  loading?: boolean;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <PressableScale
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: Boolean(loading), disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={styles.actionWrapper}
    >
      <View style={[styles.actionButton, secondary && styles.actionButtonSecondary, (disabled || loading) && styles.actionButtonDisabled]}>
        <Text style={[styles.actionText, secondary && styles.actionTextSecondary]}>
          {loading ? 'Sending…' : label}
        </Text>
        <Ionicons color={secondary ? colors.ivory : colors.black} name={icon} size={17} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  actionButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderColor: colors.goldStrong, borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 54, paddingHorizontal: spacing.lg },
  actionButtonDisabled: { opacity: 0.62 },
  actionButtonSecondary: { backgroundColor: 'transparent', borderColor: colors.lineStrong },
  actionText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 13 },
  actionTextSecondary: { color: colors.ivory },
  actionWrapper: { minHeight: 44 },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
  body: { paddingBottom: 120, paddingHorizontal: spacing.lg },
  cancellationFacts: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.md, paddingTop: spacing.md },
  centeredBody: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 21, marginTop: spacing.md, textAlign: 'center' },
  centeredContent: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  centeredEyebrow: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.4, marginTop: spacing.lg },
  centeredTitle: { color: colors.ivory, fontFamily: typography.display, fontSize: 31, lineHeight: 38, marginTop: spacing.sm, textAlign: 'center' },
  confirmActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  confirmBody: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 19, marginTop: spacing.sm },
  confirmCard: { backgroundColor: colors.graphiteRaised, borderColor: 'rgba(209,133,120,.36)', borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, marginTop: spacing.xl, padding: spacing.lg },
  confirmTitle: { color: colors.ivory, fontFamily: typography.display, fontSize: 22 },
  content: { backgroundColor: colors.black },
  dateCard: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xl, paddingVertical: spacing.lg },
  dateDivider: { alignItems: 'center', flex: .45, minWidth: 36 },
  dateLabel: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 12 },
  datePoint: { flex: 1, minWidth: 120 },
  dateValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 12, lineHeight: 18, marginTop: 5 },
  flex: { flex: 1 },
  goldButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, minHeight: 52, paddingHorizontal: spacing.lg },
  goldButtonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 13 },
  hero: { height: 405, justifyContent: 'space-between', position: 'relative' },
  heroCopy: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  heroTop: { paddingHorizontal: spacing.lg },
  loadingText: { color: colors.muted, fontFamily: typography.body, fontSize: 13, marginTop: spacing.sm },
  missingIcon: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, height: 58, justifyContent: 'center', width: 58 },
  notice: { alignItems: 'flex-start', backgroundColor: 'rgba(227,195,101,.08)', borderColor: 'rgba(227,195,101,.28)', borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, padding: spacing.md },
  noticeText: { color: colors.ivory, flex: 1, fontFamily: typography.body, fontSize: 11, lineHeight: 18 },
  offlineNotice: { alignItems: 'center', backgroundColor: 'rgba(227,195,101,.08)', borderColor: 'rgba(227,195,101,.28)', borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, padding: spacing.md },
  offlineNoticeText: { color: colors.ivory, flex: 1, fontFamily: typography.body, fontSize: 11, lineHeight: 17 },
  priceCard: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.md },
  priceLabel: { color: colors.muted, flexShrink: 1, fontFamily: typography.body, fontSize: 12, paddingRight: spacing.md },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  priceRule: { backgroundColor: colors.lineStrong, height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
  priceTotal: { color: colors.goldStrong, fontFamily: typography.display, fontSize: 25 },
  priceTotalLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 13 },
  priceTotalRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', paddingTop: spacing.md },
  priceValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 12 },
  screen: { backgroundColor: colors.black, flex: 1 },
  sectionLabel: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 12 },
  sectionLine: { backgroundColor: colors.line, flex: 1, height: StyleSheet.hairlineWidth },
  sectionTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg, marginTop: spacing.xxl },
  stateHeader: { paddingHorizontal: spacing.lg },
  subtitle: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 21, marginTop: spacing.sm },
  terminalNote: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, paddingTop: spacing.lg },
  terminalText: { color: colors.muted, flex: 1, fontFamily: typography.body, fontSize: 11 },
  timeline: { gap: 0 },
  timelineCopy: { flex: 1, paddingBottom: spacing.lg },
  timelineDetail: { color: colors.muted, fontFamily: typography.body, fontSize: 11, lineHeight: 18, marginTop: 4 },
  timelineDot: { alignItems: 'center', backgroundColor: colors.graphiteRaised, borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, height: 22, justifyContent: 'center', width: 22 },
  timelineDotComplete: { backgroundColor: colors.goldStrong, borderColor: colors.goldStrong },
  timelineDotCurrent: { borderColor: colors.goldStrong, borderWidth: 2 },
  timelineLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 12 },
  timelineLine: { backgroundColor: colors.lineStrong, flex: 1, marginVertical: 4, width: StyleSheet.hairlineWidth },
  timelineRail: { alignItems: 'center', marginRight: spacing.md },
  timelineRow: { flexDirection: 'row', minHeight: 70 },
  timelineUpcoming: { color: colors.muted },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 33, letterSpacing: -.5, lineHeight: 40, marginTop: spacing.sm },
  vehicleMeta: { color: colors.muted, fontFamily: typography.body, fontSize: 12, marginTop: spacing.xs },
  vehicleName: { color: colors.ivory, fontFamily: typography.display, fontSize: 35, lineHeight: 41 },
});
