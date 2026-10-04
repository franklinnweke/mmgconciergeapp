import { colors, layout, spacing, typography } from '@mmg/brand';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '@/components/brand-logo';

type AuthLoadingScreenProps = { message?: string };

export function AuthLoadingScreen({ message = 'Loading' }: AuthLoadingScreenProps) {
  return (
    <View style={styles.screen}>
      <BrandLogo size={80} />
      <View accessibilityLiveRegion="polite" style={styles.status}>
        <ActivityIndicator color={colors.silver} />
        <Text style={styles.label}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.silver, fontFamily: typography.bodyMedium, fontSize: 14 },
  screen: {
    alignItems: 'center', backgroundColor: colors.black, flex: 1,
    gap: spacing.xl, justifyContent: 'center', paddingHorizontal: layout.screenGutter,
  },
  status: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
});
