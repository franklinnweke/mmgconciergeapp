import { colors, elevation, radii, spacing } from '@mmg/brand';
import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';

type LuxuryCardProps = PropsWithChildren<{
  accessibilityLabel?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}>;

export function LuxuryCard({ accessibilityLabel, children, onPress, style }: LuxuryCardProps) {
  const card = <View style={[styles.card, style]}>{children}</View>;

  if (!onPress) return card;

  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
    >
      {card}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    ...elevation.card,
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: spacing.md,
  },
});
