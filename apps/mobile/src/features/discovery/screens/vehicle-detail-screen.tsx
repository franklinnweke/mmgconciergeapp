import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { calculateBookingQuote, formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';

import { getPreviewVehicleById } from '../data/preview-discovery-gateway';
import { vehicleImages } from '../data/vehicle-images';

const durationOptions = [
  { days: 1, label: '1 day' },
  { days: 2, label: '2 days' },
  { days: 3, label: 'Weekend' },
] as const;

type VehicleDetailScreenProps = {
  vehicleId: string;
};

export default function VehicleDetailScreen({ vehicleId }: VehicleDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const vehicle = getPreviewVehicleById(vehicleId);
  const [durationDays, setDurationDays] = useState(1);

  const quote = useMemo(() => {
    if (!vehicle) return null;
    return calculateBookingQuote(vehicle.dailyRateKobo, durationDays);
  }, [durationDays, vehicle]);

  if (!vehicle || !quote) {
    return (
      <View style={[styles.missingScreen, { paddingTop: insets.top + spacing.lg }]}>
        <PressableScale accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.back()}>
          <View style={styles.roundButton}>
            <Ionicons color={colors.ivory} name="arrow-back" size={19} />
          </View>
        </PressableScale>
        <View style={styles.missingCopy}>
          <Ionicons color={colors.goldStrong} name="car-sport-outline" size={30} />
          <Text style={styles.missingTitle}>Vehicle unavailable.</Text>
          <Text style={styles.missingBody}>Return to the fleet to choose another chauffeur-ready option.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image contentFit="cover" source={vehicleImages[vehicle.imageKey]} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(4,4,4,0.38)', 'transparent', colors.black]}
            locations={[0, 0.48, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroTop, { paddingTop: insets.top + spacing.sm }]}>
            <PressableScale accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.back()}>
              <View style={styles.roundButton}>
                <Ionicons color={colors.ivory} name="arrow-back" size={19} />
              </View>
            </PressableScale>
            <View style={styles.availablePill}>
              <View style={styles.availableDot} />
              <Text style={styles.availableText}>AVAILABLE</Text>
            </View>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.category}>
              {vehicle.category === 'executive_suv' ? 'EXECUTIVE SUV' : 'EXECUTIVE SALOON'}
            </Text>
            <Text style={styles.title}>{vehicle.displayName}</Text>
            <View style={styles.heroMeta}>
              <Ionicons color={colors.goldStrong} name="location-outline" size={15} />
              <Text style={styles.heroMetaText}>{vehicle.areaLabel}</Text>
              <View style={styles.metaDot} />
              <Text style={styles.heroMetaText}>{vehicle.seats} seats</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.rateRow}>
            <View>
              <Text style={styles.label}>DAILY RATE</Text>
              <Text style={styles.rate}>{formatNairaFromKobo(vehicle.dailyRateKobo)}</Text>
            </View>
            <View style={styles.distancePill}>
              <Ionicons color={colors.gold} name="navigate" size={13} />
              <Text style={styles.distanceText}>{vehicle.distanceKm.toFixed(1)} km away</Text>
            </View>
          </View>

          <View style={styles.promiseRail}>
            <ServicePromise icon="person-outline" label="Chauffeur" />
            <View style={styles.promiseDivider} />
            <ServicePromise icon="location-outline" label="Delivery" />
            <View style={styles.promiseDivider} />
            <ServicePromise icon="headset-outline" label="Concierge" />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>YOUR JOURNEY</Text>
            <Text style={styles.sectionTitle}>Choose the time you need.</Text>
            <View style={styles.durationRail}>
              {durationOptions.map((option) => {
                const selected = option.days === durationDays;
                return (
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={option.label}
                    onPress={() => setDurationDays(option.days)}
                    style={styles.durationFlex}
                  >
                    <View style={[styles.durationButton, selected && styles.durationButtonSelected]}>
                      <Text style={[styles.durationText, selected && styles.durationTextSelected]}>
                        {option.label}
                      </Text>
                    </View>
                  </PressableScale>
                );
              })}
            </View>
          </View>

          <View style={styles.quoteSection}>
            <View style={styles.quoteHeading}>
              <View>
                <Text style={styles.sectionEyebrow}>ESTIMATED QUOTE</Text>
                <Text style={styles.quoteTitle}>{durationDays}-day journey</Text>
              </View>
              <Ionicons color={colors.goldStrong} name="receipt-outline" size={22} />
            </View>
            <QuoteRow label={`${formatNairaFromKobo(vehicle.dailyRateKobo)} × ${durationDays}`} value={formatNairaFromKobo(quote.rentalKobo)} />
            <QuoteRow label="Service and protection" value={formatNairaFromKobo(quote.serviceFeeKobo)} />
            <View style={styles.totalRule} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Estimated total</Text>
              <Text style={styles.totalValue}>{formatNairaFromKobo(quote.totalKobo)}</Text>
            </View>
            <Text style={styles.quoteNote}>Final availability is confirmed before payment.</Text>
          </View>

          <PressableScale
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/booking/review',
                params: { durationDays, vehicleId: vehicle.id },
              })
            }
          >
            <View style={styles.primaryButton}>
              <Text style={styles.primaryText}>REVIEW THIS QUOTE</Text>
              <Ionicons color={colors.black} name="arrow-forward" size={18} />
            </View>
          </PressableScale>
        </View>
      </ScrollView>
    </View>
  );
}

function ServicePromise({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.promiseItem}>
      <Ionicons color={colors.gold} name={icon} size={17} />
      <Text style={styles.promiseText}>{label}</Text>
    </View>
  );
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.quoteRow}>
      <Text style={styles.quoteLabel}>{label}</Text>
      <Text style={styles.quoteValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  availableDot: { backgroundColor: colors.success, borderRadius: radii.pill, height: 6, width: 6 },
  availablePill: { alignItems: 'center', backgroundColor: 'rgba(4,4,4,0.72)', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingVertical: 9 },
  availableText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 8, letterSpacing: 1.3 },
  body: { gap: spacing.xl, paddingBottom: 56, paddingHorizontal: spacing.lg },
  category: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 9, letterSpacing: 2 },
  content: { backgroundColor: colors.black },
  distancePill: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 6, paddingHorizontal: 11, paddingVertical: 8 },
  distanceText: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 9 },
  durationButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, minHeight: 42, justifyContent: 'center' },
  durationButtonSelected: { backgroundColor: colors.ivory, borderColor: colors.ivory },
  durationFlex: { flex: 1 },
  durationRail: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.lg },
  durationText: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 10 },
  durationTextSelected: { color: colors.black },
  hero: { height: 500, justifyContent: 'space-between' },
  heroCopy: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  heroMeta: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: spacing.sm },
  heroMetaText: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 11 },
  heroTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  label: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 8, letterSpacing: 1.5 },
  metaDot: { backgroundColor: colors.lineStrong, borderRadius: radii.pill, height: 3, marginHorizontal: 2, width: 3 },
  missingBody: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  missingCopy: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', paddingHorizontal: spacing.xl },
  missingScreen: { backgroundColor: colors.black, flex: 1, paddingHorizontal: spacing.lg },
  missingTitle: { color: colors.ivory, fontFamily: typography.display, fontSize: 32 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 58 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 1.3 },
  promiseDivider: { backgroundColor: colors.line, height: 24, width: StyleSheet.hairlineWidth },
  promiseItem: { alignItems: 'center', flex: 1, gap: 7 },
  promiseRail: { alignItems: 'center', borderBottomColor: colors.line, borderTopColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingVertical: spacing.md },
  promiseText: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 9 },
  quoteHeading: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
  quoteLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 11 },
  quoteNote: { color: colors.muted, fontFamily: typography.body, fontSize: 9, marginTop: spacing.md },
  quoteRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  quoteSection: { backgroundColor: colors.graphite, borderColor: colors.line, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg },
  quoteTitle: { color: colors.ivory, fontFamily: typography.display, fontSize: 25, marginTop: 4 },
  quoteValue: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 11 },
  rate: { color: colors.ivory, fontFamily: typography.display, fontSize: 29, marginTop: 4 },
  rateRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  roundButton: { alignItems: 'center', backgroundColor: 'rgba(4,4,4,0.74)', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, height: 42, justifyContent: 'center', width: 42 },
  screen: { backgroundColor: colors.black, flex: 1 },
  section: { paddingTop: spacing.sm },
  sectionEyebrow: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 8, letterSpacing: 1.7 },
  sectionTitle: { color: colors.ivory, fontFamily: typography.display, fontSize: 29, letterSpacing: -0.5, marginTop: 5 },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 40, letterSpacing: -1, lineHeight: 44, marginTop: spacing.sm },
  totalLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 12 },
  totalRow: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
  totalRule: { backgroundColor: colors.lineStrong, height: StyleSheet.hairlineWidth, marginVertical: spacing.md },
  totalValue: { color: colors.goldStrong, fontFamily: typography.display, fontSize: 24 },
});
