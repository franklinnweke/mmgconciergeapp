import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@mmg/brand';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { PrimaryAction } from '@/components/ui/mobile-primitives';
import { useAuth } from '@/core/auth/auth-context';

export function AccountProfileErrorScreen() {
  const auth = useAuth();
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      await auth.retryProfile();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}><BrandWordmark withLogo /></View>
      <View style={styles.content}>
        <Ionicons color={colors.goldStrong} name="cloud-offline-outline" size={30} />
        <Text accessibilityRole="header" style={styles.title}>Could not load your account</Text>
        <Text style={styles.body}>Check your connection and try again before continuing.</Text>
        <View style={styles.action}>
          <PrimaryAction icon="refresh" label="Try again" loading={retrying} onPress={() => void retry()} />
        </View>
        <PressableScale accessibilityRole="button" onPress={() => void auth.signOut()} style={styles.signOutTarget}>
          <Text style={styles.signOut}>Use a different account</Text>
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  action: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  body: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 340,
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
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
    fontSize: 30,
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  topBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
});
