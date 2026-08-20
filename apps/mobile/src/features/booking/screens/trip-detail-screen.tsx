import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useReducer, useState } from 'react';
import { Animated, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { LuxuryEmblemLoader } from '@/components/ui/luxury-emblem-loader';
import { RadarPulseDot } from '@/components/ui/radar-pulse-dot';
import { useReducedMotion } from '@/components/use-reduced-motion';
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
  payment: { icon: 'lock-closed-outline', label: 'CONTINUE TO SECURE PAYMENT' },
  support: { icon: 'chatbubble-outline', label: 'CONTACT CONCIERGE' },
  cancellation: { icon: 'close-circle-outline', label: 'REQUEST CANCELLATION' },
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
  const reduceMotion = useReducedMotion();
  const { initializing, syncError, syncState, trips } = useBookings();
  const [entrance] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const [session, dispatch] = useReducer(reduceRenterTripActionSession, initialRenterTripActionSession);
  const trip = tripOverride !== undefined ? tripOverride : trips.find((candidate) => candidate.id === tripId) ?? null;
  const vehicle = trip?.vehicleSnapshot ?? null;
  const vehicleImage = resolveVehicleImageSource(vehicle);
  const mode = tripDetailMode({
    initializing,
    syncState,
    trip,
  });

  useEffect(() => {
    if (reduceMotion) {
      entrance.setValue(1);
      return;
    }
    Animated.timing(entrance, { duration: 460, toValue: 1, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [entrance, reduceMotion]);

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
      <View accessibilityLiveRegion="polite" style={[styles.centered, { paddingTop: insets.top + spacing.xl }]}>
        <LuxuryEmblemLoader label="SYNCING TRIP TELEMETRY" size={48} />
      </View>
    );
  }

  if (mode === 'missing' || !trip || !vehicle) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.missingIcon}>
          <Ionicons color={colors.goldStrong} name="map-outline" size={27} />
        </View>
        <Text style={styles.centeredEyebrow}>JOURNEY NOT FOUND</Text>
        <Text accessibilityRole="header" style={styles.centeredTitle}>This trip is not available on this device.</Text>
        <Text style={styles.centeredBody}>
          It may still be syncing, belong to another account, or no longer be available.
        </Text>
        <PressableScale accessibilityLabel="Back to trips" accessibilityRole="button" onPress={() => router.replace('/(renter)/trips')}>
          <View style={styles.goldButton}>
            <Text style={styles.goldButtonText}>BACK TO TRIPS</Text>
            <Ionicons color={colors.black} name="arrow-forward" size={16} />
          </View>
        </PressableScale>
      </View>
    );
  }

  const copy = tripStateCopy(trip.state);
  const presentation = tripDetailPresentation(trip);
  const timeline = renterTripTimeline(trip.state);
  const busy = session.pendingAction !== null;

  return (
    <View style={styles.screen}>
      <Animated.View style={[styles.flex, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Image accessibilityLabel={vehicle.displayName} contentFit="cover" source={vehicleImage} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={['rgba(4,4,4,.42)', 'transparent', colors.black]} locations={[0, .46, 1]} style={StyleSheet.absoluteFill} />
            <View style={[styles.heroTop, { paddingTop: insets.top + spacing.sm }]}>
              <PressableScale accessibilityLabel="Back to trips" accessibilityRole="button" onPress={() => router.back()}>
                <View style={styles.backButton}>
                  <Ionicons color={colors.ivory} name="arrow-back" size={20} />
                </View>
              </PressableScale>
              {mode !== 'ready' ? <View style={styles.syncPill}>
                <RadarPulseDot
                  color={mode === 'offline' || mode === 'preview' ? colors.goldStrong : colors.success}
                  glowColor={mode === 'offline' || mode === 'preview' ? 'rgba(227,195,101,0.35)' : 'rgba(74,222,128,0.35)'}
                  size={6}
                />
                <Text style={styles.syncText}>
                  {mode === 'preview' ? 'STATE PREVIEW' : 'OFFLINE COPY'}
                </Text>
              </View> : null}
            </View>
            <View style={styles.heroCopy}>
              <Text accessibilityRole="header" style={styles.vehicleName}>{vehicle.displayName}</Text>
              <Text style={styles.vehicleMeta}>{vehicle.areaLabel} · Chauffeur included</Text>
            </View>
          </View>

          <View style={styles.body}>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.subtitle}>{copy.body}</Text>

            {mode === 'preview' ? (
              <View accessibilityLiveRegion="polite" style={styles.previewNotice}>
                <Ionicons color={colors.goldStrong} name="flask-outline" size={16} />
                <Text style={styles.previewNoticeText}>DEVELOPMENT FIXTURE · ACTIONS DO NOT CHANGE LIVE DATA</Text>
              </View>
            ) : null}
            {mode === 'offline' || syncError ? (
              <View accessibilityLiveRegion="polite" style={styles.offlineNotice}>
                <Ionicons color={colors.goldStrong} name="cloud-offline-outline" size={16} />
                <Text style={styles.offlineNoticeText}>
                  {syncError ?? 'Showing a cached copy. Live updates are unavailable.'}
                </Text>
              </View>
            ) : null}

            <View style={styles.dateCard}>
              <DatePoint label="PICKUP" value={formatDate(trip.startDate)} />
              <View style={styles.dateDivider}>
                <Ionicons color={colors.gold} name="arrow-forward" size={16} />
              </View>
              <DatePoint label="RETURN" value={formatDate(trip.endDate)} />
            </View>

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
                <View>
                  <Text style={styles.priceTotalLabel}>RENTER TOTAL</Text>
                  <Text style={styles.priceVersion}>
                    {trip.source === 'legacy'
                      ? 'EARLIER REQUEST ESTIMATE'
                      : trip.source === 'preview'
                        ? 'PREVIEW SNAPSHOT'
                        : `CONFIG ${trip.priceSnapshot.configVersion}`}
                  </Text>
                </View>
                <Text style={styles.priceTotal}>{formatNairaFromKobo(trip.priceSnapshot.renterTotalKobo)}</Text>
              </View>
            </View>

            {session.notice ? (
              <View accessibilityLiveRegion="polite" style={styles.notice}>
                <Ionicons color={colors.goldStrong} name="information-circle-outline" size={19} />
                <Text style={styles.noticeText}>{session.notice.message}</Text>
              </View>
            ) : null}

            {session.confirmingCancellation ? (
              <View style={styles.confirmCard}>
                <Text style={styles.confirmTitle}>Request cancellation?</Text>
                <Text style={styles.confirmBody}>
                  This asks the service to review the request. It does not promise a refund or change the journey until the server confirms it.
                </Text>
                <View style={styles.confirmActions}>
                  <ActionButton
                    disabled={busy}
                    icon="arrow-back"
                    label="KEEP JOURNEY"
                    onPress={() => dispatch({ type: 'dismiss-cancellation' })}
                    secondary
                  />
                  <ActionButton
                    disabled={busy}
                    icon="close-circle-outline"
                    label="SEND REQUEST"
                    loading={session.pendingAction === 'cancellation'}
                    onPress={() => void perform('cancellation')}
                  />
                </View>
              </View>
            ) : null}

            {!session.confirmingCancellation && presentation.primary ? (
              <View style={styles.actions}>
                <ActionButton
                  disabled={busy}
                  icon={actionCopy[presentation.primary].icon}
                  label={actionCopy[presentation.primary].label}
                  loading={session.pendingAction === presentation.primary}
                  onPress={() => presentation.primary === 'cancellation'
                    ? dispatch({ type: 'begin', action: 'cancellation' })
                    : void perform(presentation.primary!)}
                />
                {presentation.secondary.map((action) => (
                  <ActionButton
                    key={action}
                    disabled={busy}
                    icon={actionCopy[action].icon}
                    label={actionCopy[action].label}
                    loading={session.pendingAction === action}
                    onPress={() => action === 'cancellation'
                      ? dispatch({ type: 'begin', action: 'cancellation' })
                      : void perform(action)}
                    secondary
                  />
                ))}
              </View>
            ) : null}

            {presentation.isTerminal ? (
              <View style={styles.terminalNote}>
                <Ionicons color={colors.muted} name="checkmark-circle-outline" size={18} />
                <Text style={styles.terminalText}>No journey action is required in this state.</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </Animated.View>
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
          {loading ? 'SENDING…' : label}
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
  actionText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.2 },
  actionTextSecondary: { color: colors.ivory },
  actionWrapper: { minHeight: 44 },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
  backButton: { alignItems: 'center', backgroundColor: 'rgba(4,4,4,.68)', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, height: 46, justifyContent: 'center', width: 46 },
  body: { paddingBottom: 120, paddingHorizontal: spacing.lg },
  centered: { alignItems: 'center', backgroundColor: colors.black, flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  centeredBody: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 21, marginTop: spacing.md, textAlign: 'center' },
  centeredEyebrow: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.8, marginTop: spacing.lg },
  centeredTitle: { color: colors.ivory, fontFamily: typography.display, fontSize: 31, lineHeight: 38, marginTop: spacing.sm, textAlign: 'center' },
  confirmActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  confirmBody: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 19, marginTop: spacing.sm },
  confirmCard: { backgroundColor: colors.graphiteRaised, borderColor: 'rgba(209,133,120,.36)', borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, marginTop: spacing.xl, padding: spacing.lg },
  confirmTitle: { color: colors.ivory, fontFamily: typography.display, fontSize: 22 },
  content: { backgroundColor: colors.black },
  dateCard: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xl, paddingVertical: spacing.lg },
  dateDivider: { alignItems: 'center', flex: .45, minWidth: 36 },
  dateLabel: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.4 },
  datePoint: { flex: 1, minWidth: 120 },
  dateValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 11, lineHeight: 17, marginTop: 5 },
  flex: { flex: 1 },
  goldButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, minHeight: 52, paddingHorizontal: spacing.lg },
  goldButtonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.2 },
  hero: { height: 405, justifyContent: 'space-between', position: 'relative' },
  heroCopy: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  heroTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  missingIcon: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, height: 58, justifyContent: 'center', width: 58 },
  notice: { alignItems: 'flex-start', backgroundColor: 'rgba(227,195,101,.08)', borderColor: 'rgba(227,195,101,.28)', borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, padding: spacing.md },
  noticeText: { color: colors.ivory, flex: 1, fontFamily: typography.body, fontSize: 11, lineHeight: 18 },
  offlineNotice: { alignItems: 'center', backgroundColor: 'rgba(227,195,101,.08)', borderColor: 'rgba(227,195,101,.28)', borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, padding: spacing.md },
  offlineNoticeText: { color: colors.ivory, flex: 1, fontFamily: typography.body, fontSize: 11, lineHeight: 17 },
  previewNotice: { alignItems: 'center', borderBottomColor: colors.line, borderTopColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, paddingVertical: spacing.md },
  previewNoticeText: { color: colors.goldStrong, flex: 1, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.1, lineHeight: 16 },
  priceCard: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.md },
  priceLabel: { color: colors.muted, flexShrink: 1, fontFamily: typography.body, fontSize: 11, paddingRight: spacing.md },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  priceRule: { backgroundColor: colors.lineStrong, height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
  priceTotal: { color: colors.goldStrong, fontFamily: typography.display, fontSize: 25 },
  priceTotalLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.3 },
  priceTotalRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', paddingTop: spacing.md },
  priceValue: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 11 },
  priceVersion: { color: colors.muted, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: .8, marginTop: 4 },
  screen: { backgroundColor: colors.black, flex: 1 },
  sectionLabel: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.6 },
  sectionLine: { backgroundColor: colors.line, flex: 1, height: StyleSheet.hairlineWidth },
  sectionTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg, marginTop: spacing.xxl },
  subtitle: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 21, marginTop: spacing.sm },
  syncDot: { backgroundColor: colors.success, borderRadius: radii.pill, height: 6, width: 6 },
  syncDotOffline: { backgroundColor: colors.goldStrong },
  syncPill: { alignItems: 'center', backgroundColor: 'rgba(4,4,4,.68)', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingVertical: 10 },
  syncText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.2 },
  terminalNote: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, paddingTop: spacing.lg },
  terminalText: { color: colors.muted, flex: 1, fontFamily: typography.body, fontSize: 11 },
  timeline: { gap: 0 },
  timelineCopy: { flex: 1, paddingBottom: spacing.lg },
  timelineDetail: { color: colors.muted, fontFamily: typography.body, fontSize: 11, lineHeight: 18, marginTop: 4 },
  timelineDot: { alignItems: 'center', backgroundColor: colors.graphiteRaised, borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, height: 22, justifyContent: 'center', width: 22 },
  timelineDotComplete: { backgroundColor: colors.goldStrong, borderColor: colors.goldStrong },
  timelineDotCurrent: { borderColor: colors.goldStrong, borderWidth: 2 },
  timelineLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 11 },
  timelineLine: { backgroundColor: colors.lineStrong, flex: 1, marginVertical: 4, width: StyleSheet.hairlineWidth },
  timelineRail: { alignItems: 'center', marginRight: spacing.md },
  timelineRow: { flexDirection: 'row', minHeight: 70 },
  timelineUpcoming: { color: colors.muted },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 33, letterSpacing: -.5, lineHeight: 40, marginTop: spacing.sm },
  vehicleMeta: { color: colors.muted, fontFamily: typography.body, fontSize: 11, marginTop: spacing.xs },
  vehicleName: { color: colors.ivory, fontFamily: typography.display, fontSize: 35, lineHeight: 41 },
});
