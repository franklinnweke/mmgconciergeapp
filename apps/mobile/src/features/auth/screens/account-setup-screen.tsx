import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { AccountType } from '@mmg/contracts';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { useAuth } from '@/core/auth/auth-context';

const heroImage = require('../../../../assets/images/auth-lagos-victoria-island.jpg');

const choices = [
  {
    accountType: 'renter' as const,
    description: 'Book chauffeur-driven cars.',
    icon: 'car-sport-outline' as const,
    label: 'Rent a car',
  },
  {
    accountType: 'owner' as const,
    description: 'Apply to list an approved vehicle.',
    icon: 'key-outline' as const,
    label: 'List your car',
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
      <View style={styles.hero}>
        <Image contentFit="cover" source={heroImage} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['rgba(4,4,4,0.72)', 'rgba(4,4,4,0.35)', colors.black]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.brandRow, { paddingTop: insets.top + spacing.md }]}>
          <BrandWordmark withLogo />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        <Text style={styles.title}>Get started</Text>

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
                  <View style={styles.choiceCopy}>
                    <Text style={styles.choiceLabel}>{choice.label}</Text>
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
              <Text style={styles.primaryText}>
                Continue as {selection === 'renter' ? 'renter' : 'car owner'}
              </Text>
            )}
          </View>
        </PressableScale>
        <PressableScale onPress={() => void auth.signOut()}>
          <Text style={styles.signOut}>Use a different account</Text>
        </PressableScale>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 22 },
  brandRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  choice: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 72, paddingVertical: spacing.sm },
  choiceCopy: { flex: 1, gap: spacing.xs },
  choiceDescription: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  choiceLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 16 },
  choiceList: { gap: spacing.sm, marginVertical: spacing.lg },
  choiceSelected: {
    backgroundColor: 'rgba(227,195,101,0.1)',
    borderLeftColor: colors.goldStrong,
    borderLeftWidth: 2,
  },
  content: { paddingBottom: spacing.xl, paddingHorizontal: spacing.lg },
  disabled: { opacity: 0.6 },
  error: { color: colors.danger, fontFamily: typography.body, fontSize: 12, marginBottom: spacing.md, textAlign: 'center' },
  hero: { height: 220, justifyContent: 'flex-start' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.button, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 56 },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  screen: { backgroundColor: colors.black, flex: 1 },
  scrollView: { flex: 1 },
  signOut: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 12, paddingVertical: spacing.lg, textAlign: 'center' },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 38, letterSpacing: -0.8, lineHeight: 44, marginBottom: spacing.sm, marginTop: spacing.sm },
});
