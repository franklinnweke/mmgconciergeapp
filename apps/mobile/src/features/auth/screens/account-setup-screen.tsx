import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { AccountType } from '@mmg/contracts';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { useReducedMotion } from '@/components/use-reduced-motion';
import { useAuth } from '@/core/auth/auth-context';

const heroImage = require('../../../../assets/images/fleet/lagos-arrival-hero.png');

const choices = [
  {
    accountType: 'renter' as const,
    description: 'Discover chauffeur-ready vehicles and manage every Lagos journey.',
    icon: 'car-sport-outline' as const,
    label: 'I want to rent',
  },
  {
    accountType: 'owner' as const,
    description: 'Apply to list and operate your vehicle with MMG Concierge.',
    icon: 'key-outline' as const,
    label: 'I own a car',
  },
];

export function AccountSetupScreen() {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [selection, setSelection] = useState<AccountType>('renter');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const [translate] = useState(() => new Animated.Value(18));

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      translate.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, { duration: 440, toValue: 1, useNativeDriver: true }),
      Animated.spring(translate, { damping: 18, stiffness: 100, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [opacity, reduceMotion, translate]);

  async function continueWithSelection() {
    setBusy(true);
    setError(null);
    try {
      await auth.completeAccountSetup(selection);
    } catch (caught) {
      setError(auth.errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <View style={styles.hero}>
        <Image contentFit="cover" source={heroImage} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['rgba(4,4,4,0.2)', 'rgba(4,4,4,0.35)', colors.black]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.brandRow, { paddingTop: insets.top + spacing.md }]}>
          <BrandWordmark />
          <Text style={styles.step}>IDENTITY · 01</Text>
        </View>
      </View>

      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={[styles.scrollView, { opacity, transform: [{ translateY: translate }] }]}
      >
        <Text style={styles.eyebrow}>CHOOSE YOUR EXPERIENCE</Text>
        <Text style={styles.title}>How will you use MMG?</Text>
        <Text style={styles.body}>
          Your choice creates the right private experience. It cannot be changed inside the app.
        </Text>

        <View style={styles.choiceList}>
          {choices.map((choice) => {
            const selected = choice.accountType === selection;
            return (
              <PressableScale
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={choice.accountType}
                onPress={() => setSelection(choice.accountType)}
              >
                <View style={[styles.choice, selected && styles.choiceSelected]}>
                  <View style={[styles.iconFrame, selected && styles.iconFrameSelected]}>
                    <Ionicons
                      color={selected ? colors.black : colors.goldStrong}
                      name={choice.icon}
                      size={24}
                    />
                  </View>
                  <View style={styles.choiceCopy}>
                    <Text style={styles.choiceLabel}>{choice.label}</Text>
                    <Text style={styles.choiceDescription}>{choice.description}</Text>
                  </View>
                  <Ionicons
                    color={selected ? colors.goldStrong : colors.muted}
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={23}
                  />
                </View>
              </PressableScale>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PressableScale disabled={busy} onPress={() => void continueWithSelection()}>
          <View style={[styles.primaryButton, busy && styles.disabled]}>
            {busy ? <ActivityIndicator color={colors.black} /> : (
              <>
                <Text style={styles.primaryText}>
                  Continue as {selection === 'renter' ? 'renter' : 'car owner'}
                </Text>
                <Ionicons color={colors.black} name="arrow-forward" size={18} />
              </>
            )}
          </View>
        </PressableScale>
        <PressableScale onPress={() => void auth.signOut()}>
          <Text style={styles.signOut}>Use a different account</Text>
        </PressableScale>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 22 },
  brandRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  choice: { alignItems: 'center', backgroundColor: colors.graphite, borderColor: colors.line, borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 112, padding: spacing.md },
  choiceCopy: { flex: 1, gap: spacing.xs },
  choiceDescription: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  choiceLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 16 },
  choiceList: { gap: spacing.sm, marginVertical: spacing.lg },
  choiceSelected: { backgroundColor: colors.graphiteRaised, borderColor: colors.goldStrong },
  content: { paddingBottom: spacing.xl, paddingHorizontal: spacing.lg },
  disabled: { opacity: 0.6 },
  error: { color: colors.danger, fontFamily: typography.body, fontSize: 12, marginBottom: spacing.md, textAlign: 'center' },
  eyebrow: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 10, letterSpacing: 2.1 },
  hero: { height: 220, justifyContent: 'flex-start' },
  iconFrame: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, height: 52, justifyContent: 'center', width: 52 },
  iconFrameSelected: { backgroundColor: colors.goldStrong, borderColor: colors.goldStrong },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 56 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  screen: { backgroundColor: colors.black, flex: 1 },
  scrollView: { flex: 1 },
  signOut: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 12, paddingVertical: spacing.lg, textAlign: 'center' },
  step: { color: colors.silver, fontFamily: typography.bodySemiBold, fontSize: 9, letterSpacing: 1.5 },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 38, letterSpacing: -0.8, lineHeight: 44, marginBottom: spacing.sm, marginTop: spacing.sm },
});
