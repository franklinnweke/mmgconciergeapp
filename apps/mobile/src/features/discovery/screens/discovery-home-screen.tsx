import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';

import { useFeaturedVehicles } from '../hooks/use-featured-vehicles';
import { vehicleImages } from '../data/vehicle-images';

export default function DiscoveryHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isLoading, vehicles } = useFeaturedVehicles();

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]} showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <BrandWordmark />
        <View style={styles.location}><Ionicons color={colors.gold} name="location-outline" size={14} /><Text style={styles.locationText}>LAGOS</Text></View>
      </View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>A BETTER WAY TO ARRIVE</Text>
        <Text style={styles.title}>Move through Lagos beautifully.</Text>
        <Text style={styles.subtitle}>Chauffeured vehicles, considered details, and a concierge on hand when you need one.</Text>
        <PressableScale accessibilityRole="button" onPress={() => router.push('/(renter)/browse')}><View style={styles.primaryButton}><Text style={styles.primaryText}>Explore the fleet</Text><Ionicons color={colors.black} name="arrow-forward" size={18} /></View></PressableScale>
      </View>
      <View style={styles.sectionHeader}><View><Text style={styles.sectionEyebrow}>CURATED FOR YOU</Text><Text style={styles.sectionTitle}>Featured arrivals</Text></View><PressableScale accessibilityRole="button" onPress={() => router.push('/(renter)/browse')}><Text style={styles.linkText}>View all</Text></PressableScale></View>
      {isLoading ? <ActivityIndicator color={colors.gold} style={styles.loader} /> : <ScrollView contentContainerStyle={styles.rail} horizontal showsHorizontalScrollIndicator={false}>{vehicles.map((vehicle) => <PressableScale accessibilityRole="button" key={vehicle.id}><View style={styles.card}><View style={styles.imageFrame}><Image contentFit="cover" source={vehicleImages[vehicle.imageKey]} style={StyleSheet.absoluteFill} /><View style={styles.distance}><Ionicons color={colors.ivory} name="navigate" size={11} /><Text style={styles.distanceText}>{vehicle.distanceKm.toFixed(1)} km</Text></View></View><Text style={styles.vehicleName}>{vehicle.displayName}</Text><Text style={styles.meta}>{vehicle.areaLabel} · {vehicle.seats} seats</Text><Text style={styles.price}>{formatNairaFromKobo(vehicle.dailyRateKobo)} <Text style={styles.perDay}>/ day</Text></Text></View></PressableScale>)}</ScrollView>}
      <View style={styles.note}><Ionicons color={colors.goldStrong} name="shield-checkmark-outline" size={20} /><View style={styles.noteCopy}><Text style={styles.noteTitle}>Every booking includes a chauffeur.</Text><Text style={styles.noteBody}>Your vehicle arrives ready, with delivery across Lagos.</Text></View></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { width: 286 },
  content: { backgroundColor: colors.black, gap: spacing.lg, paddingBottom: 110, paddingHorizontal: spacing.lg },
  distance: { alignItems: 'center', backgroundColor: 'rgba(4,4,4,0.76)', borderRadius: radii.pill, flexDirection: 'row', gap: 5, left: spacing.sm, paddingHorizontal: 10, paddingVertical: 7, position: 'absolute', top: spacing.sm },
  distanceText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 10 },
  eyebrow: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 10, letterSpacing: 2.2 },
  hero: { gap: spacing.md, paddingBottom: spacing.lg, paddingTop: spacing.xxl },
  imageFrame: { borderRadius: radii.lg, height: 190, overflow: 'hidden' },
  linkText: { color: colors.goldStrong, fontFamily: typography.bodyMedium, fontSize: 12 },
  loader: { marginVertical: spacing.xxl },
  location: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  locationText: { color: colors.muted, fontFamily: typography.bodySemiBold, fontSize: 10, letterSpacing: 1.5 },
  meta: { color: colors.muted, fontFamily: typography.body, fontSize: 11, marginTop: 4 },
  note: { alignItems: 'center', backgroundColor: colors.graphite, borderColor: colors.line, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md },
  noteBody: { color: colors.muted, fontFamily: typography.body, fontSize: 11, lineHeight: 17, marginTop: 3 },
  noteCopy: { flex: 1 },
  noteTitle: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 12 },
  perDay: { color: colors.muted, fontFamily: typography.body, fontSize: 11 },
  price: { color: colors.silver, fontFamily: typography.bodySemiBold, fontSize: 13, marginTop: spacing.sm },
  primaryButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 16 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 13 },
  rail: { flexDirection: 'row', gap: spacing.md },
  sectionEyebrow: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 9, letterSpacing: 1.8 },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ivory, fontFamily: typography.display, fontSize: 27, marginTop: 5 },
  subtitle: { color: colors.muted, fontFamily: typography.body, fontSize: 15, lineHeight: 23, maxWidth: 330 },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 42, letterSpacing: -0.8, lineHeight: 47, maxWidth: 340 },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  vehicleName: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 16, marginTop: spacing.md },
});
