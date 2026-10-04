import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@mmg/brand';
import type { AccountType } from '@mmg/contracts';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';

const heroImage = require('../../../../assets/images/auth-land-cruiser-black.jpg');

type AuthRoleChoiceScreenProps = {
  onChooseRole(accountType: AccountType): void;
  onSignIn(): void;
};

const choices = [
  {
    accountType: 'renter' as const,
    description: 'Chauffeur-driven cars in Lagos.',
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

export function AuthRoleChoiceScreen({ onChooseRole, onSignIn }: AuthRoleChoiceScreenProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const heroHeight = Math.min(470, Math.max(330, height * 0.54));

  return (
    <ScrollView
      bounces={false}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <View style={[styles.hero, { height: heroHeight }]}>
        <Image
          accessibilityLabel="Black luxury SUV in an urban setting"
          contentFit="cover"
          contentPosition={{ left: '50%', top: '43%' }}
          source={heroImage}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(4,4,4,0.72)', 'rgba(4,4,4,0.04)', colors.black]}
          locations={[0, 0.58, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.brand, { paddingTop: insets.top + spacing.md }]}>
          <BrandWordmark withLogo />
        </View>
      </View>

      <View style={styles.decision}>

        <View style={styles.choiceList}>
          {choices.map((choice) => (
            <PressableScale
              accessibilityHint={choice.description}
              accessibilityRole="button"
              key={choice.accountType}
              onPress={() => onChooseRole(choice.accountType)}
            >
              <View style={styles.choice}>
                <Ionicons color={colors.goldStrong} name={choice.icon} size={22} />
                <View style={styles.choiceCopy}>
                  <Text style={styles.choiceLabel}>{choice.label}</Text>
                </View>
              </View>
            </PressableScale>
          ))}
        </View>

        <PressableScale accessibilityRole="button" onPress={onSignIn}>
          <View style={styles.signInButton}>
            <Text style={styles.signInText}>Sign in</Text>
          </View>
        </PressableScale>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  brand: { paddingHorizontal: spacing.lg },
  choice: {
    alignItems: 'center',
    borderBottomColor: colors.lineStrong,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.sm,
  },
  choiceCopy: { flex: 1, gap: spacing.xxs },
  choiceLabel: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 16 },
  choiceList: { marginTop: spacing.md },
  content: { backgroundColor: colors.black, flexGrow: 1 },
  decision: { paddingBottom: spacing.xl, paddingHorizontal: spacing.lg },
  hero: { backgroundColor: colors.graphite, justifyContent: 'flex-start' },
  screen: { backgroundColor: colors.black, flex: 1 },
  signInButton: { alignItems: 'center', justifyContent: 'center', minHeight: 52, marginTop: spacing.md },
  signInText: { color: colors.gold, fontFamily: typography.bodyMedium, fontSize: 13 },
});
