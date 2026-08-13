import { colors, spacing, typography } from '@mmg/brand';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BrandWordmark } from '@/components/brand-wordmark';

export function AuthLoadingScreen() {
  return (
    <View style={styles.screen}>
      <BrandWordmark />
      <ActivityIndicator color={colors.goldStrong} />
      <Text style={styles.label}>PREPARING YOUR CONCIERGE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.muted,
    fontFamily: typography.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1.8,
  },
  screen: {
    alignItems: 'center',
    backgroundColor: colors.black,
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
  },
});
