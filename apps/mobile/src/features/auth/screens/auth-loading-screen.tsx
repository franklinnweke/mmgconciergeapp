import { colors, spacing, typography } from '@mmg/brand';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '@/components/brand-logo';

type AuthLoadingScreenProps = {
  message?: string;
};

export function AuthLoadingScreen({ message = 'Preparing MMG Concierge' }: AuthLoadingScreenProps) {
  return (
    <View style={styles.screen} accessibilityLiveRegion="polite">
      <BrandLogo size={68} />
      <ActivityIndicator color={colors.goldStrong} size="small" />
      <Text style={styles.label}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  screen: {
    alignItems: 'center',
    backgroundColor: colors.black,
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
