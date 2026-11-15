import { radii } from '@mmg/brand';
import { DimensionValue, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { useTheme } from '../../core/theme';

export type LuxuryShimmerProps = {
  borderRadius?: number;
  height: DimensionValue;
  style?: StyleProp<ViewStyle>;
  width?: DimensionValue;
};

// Retain the shared API; loading placeholders no longer need decorative motion.
export function LuxuryShimmer({
  borderRadius = radii.md, height, style, width = '100%',
}: LuxuryShimmerProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.placeholder,
        { backgroundColor: colors.surfaceRaised, borderRadius, height, width },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { overflow: 'hidden' },
});
