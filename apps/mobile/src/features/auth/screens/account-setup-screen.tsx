import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@mmg/brand';
import type { AccountType } from '@mmg/contracts';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { InlineNotice, PrimaryAction } from '@/components/ui/mobile-primitives';
import { useAuth } from '@/core/auth/auth-context';

const heroImage = require('../../../../assets/images/fleet/prado-250-obsidian-hero.png');
const choices = [
  {
    accountType: 'renter' as const,
    description: 'Book chauffeur-driven luxury vehicles in Lagos.',
    icon: 'car-sport-outline' as const,
    label: 'Rent a vehicle',
  },
  {
    accountType: 'owner' as const,
    description: 'Apply to list and operate an approved luxury vehicle.',
    icon: 'key-outline' as const,
    label: 'List a vehicle',
  },
];

export function AccountSetupScreen() {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const [selection, setSelection] = useState<AccountType>('renter');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image contentFit="cover" source={heroImage} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['rgba(4,4,4,.2)', 'rgba(4,4,4,.32)', colors.black]} style={StyleSheet.absoluteFill} />
          <View style={[styles.brandRow, { paddingTop: insets.top + spacing.md }]}>
            <BrandWordmark withLogo />
          </View>
        </View>

        <View style={styles.content}>
          <Text accessibilityRole="header" style={styles.title}>How will you use MMG?</Text>
          <Text style={styles.body}>Choose your account type. This cannot currently be changed inside the app.</Text>

          {error ? <InlineNotice icon="alert-circle-outline" tone="danger">{error}</InlineNotice> : null}

          <View style={styles.choiceList}>
            {choices.map((choice) => {
              const selected = choice.accountType === selection;
              return (
                <PressableScale
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  key={choice.accountType}
                  onPress={() => setSelection(choice.accountType)}
                >
                  <View style={styles.choice}>
                    <View style={styles.choiceIcon}>
                      <Ionicons color={selected ? colors.goldStrong : colors.muted} name={choice.icon} size={22} />
                    </View>
                    <View style={styles.choiceCopy}>
                      <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{choice.label}</Text>
                      <Text style={styles.choiceDescription}>{choice.description}</Text>
                    </View>
                    <Ionicons
                      color={selected ? colors.goldStrong : colors.lineStrong}
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={21}
                    />
                  </View>
                </PressableScale>
              );
            })}
          </View>

          <PrimaryAction
            icon="arrow-forward"
            label={selection === 'renter' ? 'Continue as renter' : 'Continue as owner'}
            loading={busy}
            onPress={() => void continueWithSelection()}
          />

          <PressableScale accessibilityRole="button" onPress={() => void auth.signOut()} style={styles.signOutTarget}>
            <Text style={styles.signOut}>Use a different account</Text>
          </PressableScale>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  brandRow: {
    paddingHorizontal: spacing.md,
  },
  choice: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 76,
    paddingVertical: spacing.sm,
  },
  choiceCopy: { flex: 1 },
  choiceDescription: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  choiceIcon: {
    alignItems: 'center',
    width: 28,
  },
  choiceLabel: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
  },
  choiceLabelSelected: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
  },
  choiceList: {
    marginBottom: spacing.xl,
    marginTop: spacing.lg,
  },
  content: {
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  hero: {
    height: 235,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  scrollContent: { flexGrow: 1 },
  signOut: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  signOutTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 31,
    letterSpacing: -0.55,
  },
});
