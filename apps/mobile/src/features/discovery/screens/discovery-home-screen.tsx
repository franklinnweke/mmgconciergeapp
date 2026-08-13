import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { formatNairaFromKobo } from '@mmg/domain';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';

import { vehicleImages } from '../data/vehicle-images';
import { useFeaturedVehicles } from '../hooks/use-featured-vehicles';

const popularAreas = [
  { icon: 'business-outline', label: 'Victoria Island' },
  { icon: 'restaurant-outline', label: 'Ikoyi' },
  { icon: 'water-outline', label: 'Lekki' },
] as const;

export default function DiscoveryHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isLoading, vehicles } = useFeaturedVehicles();
  const [entrance] = useState(() => new Animated.Value(0));
  const [scrollY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(entrance, {
      duration: 620,
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [entrance]);

  const openArea = (area: (typeof popularAreas)[number]['label']) => {
    router.push({ pathname: '/(renter)/browse', params: { area } });
  };

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: Platform.OS !== 'web',
        })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                transform: [
                  {
                    translateY: scrollY.interpolate({
                      extrapolate: 'clamp',
                      inputRange: [0, 420],
                      outputRange: [0, 78],
                    }),
                  },
                  {
                    scale: scrollY.interpolate({
                      extrapolate: 'clamp',
                      inputRange: [-100, 0],
                      outputRange: [1.12, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Image
              accessibilityLabel="A chauffeur-ready luxury SUV arriving in Lagos"
              contentFit="cover"
              source={vehicleImages['hero-suv']}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <LinearGradient
            colors={['rgba(4,4,4,0.48)', 'rgba(4,4,4,0.04)', 'rgba(4,4,4,0.96)']}
            locations={[0, 0.42, 1]}
            style={StyleSheet.absoluteFill}
          />

          <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
            <BrandWordmark />
            <View style={styles.locationPill}>
              <View style={styles.liveDot} />
              <Text style={styles.locationText}>LAGOS</Text>
            </View>
          </View>

          <Animated.View
            style={[
              styles.heroCopy,
              {
                opacity: entrance,
                transform: [
                  {
                    translateY: entrance.interpolate({
                      inputRange: [0, 1],
                      outputRange: [24, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.eyebrowRow}>
              <View style={styles.goldRule} />
              <Text style={styles.eyebrow}>PRIVATE MOBILITY · LAGOS</Text>
            </View>
            <Text style={styles.title}>Arrive like it was all arranged.</Text>
            <Text style={styles.subtitle}>
              A considered vehicle, professional chauffeur, and a concierge already thinking ahead.
            </Text>
            <PressableScale
              accessibilityLabel="Explore the chauffeur-ready fleet"
              accessibilityRole="button"
              onPress={() => router.push('/(renter)/browse')}
            >
              <View style={styles.primaryButton}>
                <Text style={styles.primaryText}>EXPLORE THE FLEET</Text>
                <View style={styles.buttonIcon}>
                  <Ionicons color={colors.black} name="arrow-forward" size={17} />
                </View>
              </View>
            </PressableScale>
            <View style={styles.heroAssurance}>
              <Ionicons color={colors.goldStrong} name="shield-checkmark-outline" size={16} />
              <Text style={styles.heroAssuranceText}>VETTED VEHICLES · PROFESSIONAL CHAUFFEURS</Text>
            </View>
          </Animated.View>
        </View>

        <View style={styles.body}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>START WITH WHERE</Text>
              <Text style={styles.sectionTitle}>Your Lagos, closer.</Text>
            </View>
            <Ionicons color={colors.gold} name="compass-outline" size={23} />
          </View>
          <View style={styles.areaList}>
            {popularAreas.map((area, index) => (
              <PressableScale
                accessibilityLabel={`Browse vehicles in ${area.label}`}
                accessibilityRole="button"
                key={area.label}
                onPress={() => openArea(area.label)}
              >
                <View style={styles.areaRow}>
                  <View style={styles.areaLeading}>
                    <View style={styles.areaIcon}>
                      <Ionicons color={colors.goldStrong} name={area.icon} size={18} />
                    </View>
                    <View>
                      <Text style={styles.areaIndex}>0{index + 1}</Text>
                      <Text style={styles.areaName}>{area.label}</Text>
                    </View>
                  </View>
                  <Ionicons color={colors.muted} name="arrow-forward-outline" size={18} />
                </View>
              </PressableScale>
            ))}
          </View>

          <View style={styles.featuredHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>CHAUFFEUR-READY</Text>
              <Text style={styles.sectionTitle}>The fleet, curated.</Text>
            </View>
            <PressableScale
              accessibilityLabel="View all vehicles"
              accessibilityRole="button"
              onPress={() => router.push('/(renter)/browse')}
            >
              <Text style={styles.linkText}>VIEW ALL</Text>
            </PressableScale>
          </View>

          {isLoading ? (
            <ActivityIndicator color={colors.gold} style={styles.loader} />
          ) : (
            <ScrollView
              contentContainerStyle={styles.rail}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {vehicles.map((vehicle) => (
                <PressableScale
                  accessibilityLabel={`View ${vehicle.displayName}`}
                  accessibilityRole="button"
                  key={vehicle.id}
                  onPress={() =>
                    router.push({
                      pathname: '/vehicle/[vehicleId]',
                      params: { vehicleId: vehicle.id },
                    })
                  }
                >
                  <View style={styles.card}>
                    <View style={styles.imageFrame}>
                      <Image
                        contentFit="cover"
                        source={vehicleImages[vehicle.imageKey]}
                        style={StyleSheet.absoluteFill}
                      />
                      <LinearGradient
                        colors={['transparent', 'rgba(4,4,4,0.66)']}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.distance}>
                        <Ionicons color={colors.ivory} name="navigate" size={11} />
                        <Text style={styles.distanceText}>{vehicle.distanceKm.toFixed(1)} km</Text>
                      </View>
                      <View style={styles.cardCategory}>
                        <Text style={styles.cardCategoryText}>
                          {vehicle.category === 'executive_suv' ? 'EXECUTIVE SUV' : 'EXECUTIVE SALOON'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.vehicleName}>{vehicle.displayName}</Text>
                    <View style={styles.vehicleMetaRow}>
                      <Text style={styles.meta}>{vehicle.areaLabel} · {vehicle.seats} seats</Text>
                      <Text style={styles.price}>
                        {formatNairaFromKobo(vehicle.dailyRateKobo)} <Text style={styles.perDay}>/ day</Text>
                      </Text>
                    </View>
                  </View>
                </PressableScale>
              ))}
            </ScrollView>
          )}

          <View style={styles.note}>
            <View style={styles.noteIcon}>
              <Ionicons color={colors.goldStrong} name="headset-outline" size={21} />
            </View>
            <View style={styles.noteCopy}>
              <Text style={styles.noteEyebrow}>THE MMG STANDARD</Text>
              <Text style={styles.noteTitle}>One booking. Everything considered.</Text>
              <Text style={styles.noteBody}>
                Vehicle, chauffeur, Lagos delivery, and human support are reviewed before confirmation.
              </Text>
            </View>
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  areaIcon: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, height: 42, justifyContent: 'center', width: 42 },
  areaIndex: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 7, letterSpacing: 1.3 },
  areaLeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  areaList: { marginTop: spacing.lg },
  areaName: { color: colors.ivory, fontFamily: typography.display, fontSize: 20, marginTop: 2 },
  areaRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 72 },
  body: { paddingBottom: 120, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  buttonIcon: { alignItems: 'center', backgroundColor: 'rgba(4,4,4,0.1)', borderRadius: radii.pill, height: 30, justifyContent: 'center', width: 30 },
  card: { width: 292 },
  cardCategory: { bottom: spacing.sm, left: spacing.sm, position: 'absolute' },
  cardCategoryText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 8, letterSpacing: 1.4 },
  content: { backgroundColor: colors.black },
  distance: { alignItems: 'center', backgroundColor: 'rgba(4,4,4,0.76)', borderRadius: radii.pill, flexDirection: 'row', gap: 5, left: spacing.sm, paddingHorizontal: 10, paddingVertical: 7, position: 'absolute', top: spacing.sm },
  distanceText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 9 },
  eyebrow: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 9, letterSpacing: 1.8 },
  eyebrowRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  featuredHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.section },
  goldRule: { backgroundColor: colors.goldStrong, height: 1, width: 24 },
  hero: { height: 650, justifyContent: 'space-between', overflow: 'hidden' },
  heroAssurance: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  heroAssuranceText: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 7, letterSpacing: 1.25 },
  heroCopy: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  imageFrame: { borderRadius: radii.lg, height: 202, overflow: 'hidden' },
  linkText: { color: colors.goldStrong, fontFamily: typography.bodySemiBold, fontSize: 9, letterSpacing: 1.2, paddingVertical: spacing.sm },
  liveDot: { backgroundColor: colors.success, borderRadius: radii.pill, height: 6, width: 6 },
  loader: { marginVertical: spacing.xxl },
  locationPill: { alignItems: 'center', backgroundColor: 'rgba(4,4,4,0.58)', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingVertical: 8 },
  locationText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 8, letterSpacing: 1.5 },
  meta: { color: colors.muted, fontFamily: typography.body, fontSize: 10 },
  note: { alignItems: 'flex-start', backgroundColor: colors.graphite, borderColor: colors.line, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, marginTop: spacing.section, padding: spacing.lg },
  noteBody: { color: colors.muted, fontFamily: typography.body, fontSize: 11, lineHeight: 18, marginTop: spacing.sm },
  noteCopy: { flex: 1 },
  noteEyebrow: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 7, letterSpacing: 1.5 },
  noteIcon: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, height: 44, justifyContent: 'center', width: 44 },
  noteTitle: { color: colors.ivory, fontFamily: typography.display, fontSize: 19, lineHeight: 25, marginTop: 4 },
  perDay: { color: colors.muted, fontFamily: typography.body, fontSize: 9 },
  price: { color: colors.silver, fontFamily: typography.bodySemiBold, fontSize: 11 },
  primaryButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, paddingBottom: 7, paddingLeft: spacing.lg, paddingRight: 8, paddingTop: 7 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 9, letterSpacing: 1.3 },
  rail: { flexDirection: 'row', gap: spacing.md, paddingRight: spacing.lg, paddingTop: spacing.lg },
  screen: { backgroundColor: colors.black, flex: 1 },
  sectionEyebrow: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 8, letterSpacing: 1.8 },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ivory, fontFamily: typography.display, fontSize: 29, letterSpacing: -0.4, marginTop: 5 },
  subtitle: { color: colors.silver, fontFamily: typography.body, fontSize: 14, lineHeight: 22, marginTop: spacing.md, maxWidth: 330 },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 47, letterSpacing: -1.2, lineHeight: 51, marginTop: spacing.md, maxWidth: 350 },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  vehicleMetaRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  vehicleName: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15, marginTop: spacing.md },
});
