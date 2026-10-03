import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { useReducedMotion } from '@/components/use-reduced-motion';
import { useAuth } from '@/core/auth/auth-context';

const heroImage = require('../../../../assets/images/fleet/prado-250-obsidian-hero.png');
const steps = [
  ['person-outline', 'Owner identity', 'Confirm your contact and ownership details.'],
  ['car-sport-outline', 'Vehicle profile', 'Add the vehicle, documents, and operating details.'],
  ['shield-checkmark-outline', 'MMG review', 'Our team reviews every vehicle before it can be listed.'],
] as const;

export function OwnerOnboardingScreen() {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, { duration: 520, toValue: 1, useNativeDriver: true }).start();
  }, [opacity, reduceMotion]);

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} style={styles.scrollView}>
        <View style={styles.hero}>
          <Image contentFit="cover" source={heroImage} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(4,4,4,0.18)', 'rgba(4,4,4,0.45)', colors.black]}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[styles.brandRow, { paddingTop: insets.top + spacing.md }]}
          >
            <BrandWordmark withLogo />
          </View>
        </View>

        <Animated.View style={[styles.content, { opacity }]}>
          <Text style={styles.title}>Prepare your owner profile.</Text>
          <Text style={styles.body}>
            We are building your dedicated owner workspace. Your vehicle will only become visible
            after identity, document, and quality review.
          </Text>

          <View style={styles.steps}>
            {steps.map(([icon, title, description]) => (
              <View key={title} style={styles.stepRow}>
                <View style={styles.stepIcon}>
                  <Ionicons color={colors.goldStrong} name={icon} size={21} />
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitle}>{title}</Text>
                  <Text style={styles.stepDescription}>{description}</Text>
                </View>
              </View>
            ))}
          </View>

          <PressableScale onPress={() => router.push('/(owner)' as Href)}>
            <View style={styles.primaryButton}>
              <Text style={styles.primaryText}>OPEN OWNER APPLICATION</Text>
              <Ionicons color={colors.black} name="arrow-forward" size={18} />
            </View>
          </PressableScale>

          <PressableScale onPress={() => void auth.signOut()}>
            <View style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Sign out</Text>
            </View>
          </PressableScale>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.muted, fontFamily: typography.body, fontSize: 15, lineHeight: 24 },
  brandRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  content: { paddingHorizontal: spacing.lg },
  hero: { height: 250 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.button, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 54 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 13 },
  screen: { backgroundColor: colors.black, flex: 1 },
  scroll: { paddingBottom: spacing.xl },
  scrollView: { flex: 1 },
  secondaryButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.button, borderWidth: 1, justifyContent: 'center', minHeight: 54 },
  secondaryText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 14 },
  stepCopy: { flex: 1 },
  stepDescription: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 19, marginTop: spacing.xxs },
  stepIcon: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, height: 46, justifyContent: 'center', width: 46 },
  stepRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  stepTitle: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 15, marginTop: 2 },
  steps: { marginTop: spacing.lg },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 40, letterSpacing: -0.8, lineHeight: 46, marginBottom: spacing.sm, marginTop: spacing.sm },
});
