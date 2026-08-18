import { colors, radii } from '@mmg/brand';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  Animated,
  DimensionValue,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { useReducedMotion } from '@/components/use-reduced-motion';

export type LuxuryShimmerProps = {
  borderRadius?: number;
  height: DimensionValue;
  style?: StyleProp<ViewStyle>;
  width?: DimensionValue;
};

export function LuxuryShimmer({
  borderRadius = radii.md,
  height,
  style,
  width = '100%',
}: LuxuryShimmerProps) {
  const reduceMotion = useReducedMotion();
  const [shimmerAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) return;

    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
        duration: 1600,
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );

    loop.start();

    return () => loop.stop();
  }, [reduceMotion, shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-240, 240],
  });

  return (
    <View
      style={[
        styles.shimmerBase,
        {
          borderRadius,
          height,
          width,
        },
        style,
      ]}
    >
      {!reduceMotion && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [{ translateX }],
            },
          ]}
        >
          <LinearGradient
            colors={[
              'transparent',
              'rgba(227, 195, 101, 0.08)',
              'rgba(227, 195, 101, 0.16)',
              'rgba(227, 195, 101, 0.08)',
              'transparent',
            ]}
            end={{ x: 1, y: 0.5 }}
            start={{ x: 0, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shimmerBase: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
  },
});
