import { colors } from '@mmg/brand';
import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { useReducedMotion } from '@/components/use-reduced-motion';

export type RadarPulseDotProps = {
  color?: string;
  glowColor?: string;
  size?: number;
};

export function RadarPulseDot({
  color = colors.success,
  glowColor = 'rgba(74, 222, 128, 0.35)',
  size = 7,
}: RadarPulseDotProps) {
  const reduceMotion = useReducedMotion();
  const [pulseAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          duration: 1800,
          toValue: 1,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          duration: 400,
          toValue: 0,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );

    loop.start();

    return () => loop.stop();
  }, [pulseAnim, reduceMotion]);

  const ringScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.4],
  });

  const ringOpacity = pulseAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0.8, 0.4, 0],
  });

  return (
    <View style={[styles.container, { height: size * 2.4, width: size * 2.4 }]}>
      {!reduceMotion && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              backgroundColor: glowColor,
              borderRadius: (size * 2.4) / 2,
              height: size * 2.4,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
              width: size * 2.4,
            },
          ]}
        />
      )}
      <View
        style={[
          styles.coreDot,
          {
            backgroundColor: color,
            borderRadius: size / 2,
            height: size,
            width: size,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  coreDot: {
    zIndex: 2,
  },
  pulseRing: {
    position: 'absolute',
    zIndex: 1,
  },
});
