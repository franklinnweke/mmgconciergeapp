import { colors, fontSizes, spacing, typography } from '@mmg/brand';
import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '@/components/brand-logo';
import { useReducedMotion } from '@/components/use-reduced-motion';

export type LuxuryEmblemLoaderProps = {
  label?: string;
  size?: number;
};

export function LuxuryEmblemLoader({
  label = 'CALCULATING QUOTE',
  size = 40,
}: LuxuryEmblemLoaderProps) {
  const reduceMotion = useReducedMotion();
  const [pulseAnim] = useState(() => new Animated.Value(0.85));
  const [floatAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, {
            duration: 1400,
            toValue: 1,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(floatAnim, {
            duration: 1400,
            toValue: -4,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, {
            duration: 1400,
            toValue: 0.85,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(floatAnim, {
            duration: 1400,
            toValue: 0,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]),
      ]),
    );

    loop.start();

    return () => loop.stop();
  }, [floatAnim, pulseAnim, reduceMotion]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.logoWrapper,
          {
            opacity: pulseAnim,
            transform: [{ translateY: floatAnim }],
          },
        ]}
      >
        <View
          style={[
            styles.glowAura,
            {
              borderRadius: size,
              height: size * 1.6,
              width: size * 1.6,
            },
          ]}
        />
        <BrandLogo size={size} />
      </Animated.View>

      {label ? (
        <Animated.View style={[styles.labelWrapper, { opacity: pulseAnim }]}>
          <View style={styles.statusDot} />
          <Text style={styles.labelText}>{label}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  glowAura: {
    backgroundColor: 'rgba(227, 195, 101, 0.12)',
    position: 'absolute',
  },
  labelText: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
    letterSpacing: 1.4,
  },
  labelWrapper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  logoWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  statusDot: {
    backgroundColor: colors.goldStrong,
    borderRadius: 2.5,
    height: 5,
    width: 5,
  },
});
