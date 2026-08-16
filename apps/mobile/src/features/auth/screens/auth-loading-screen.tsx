import { colors, layout, spacing, typography } from '@mmg/brand';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '@/components/brand-logo';
import { useReducedMotion } from '@/components/use-reduced-motion';

type AuthLoadingScreenProps = {
  message?: string;
};

export function AuthLoadingScreen({ message = 'Preparing your concierge' }: AuthLoadingScreenProps) {
  const reduceMotion = useReducedMotion();
  const [floatAnim] = useState(() => new Animated.Value(0));
  const [opacityAnim] = useState(() => new Animated.Value(0));
  const [pulseAnim] = useState(() => new Animated.Value(0.88));

  useEffect(() => {
    if (reduceMotion) {
      opacityAnim.setValue(1);
      floatAnim.setValue(0);
      pulseAnim.setValue(1);
      return;
    }

    // Entrance animation: fade in + upward glide
    Animated.parallel([
      Animated.timing(opacityAnim, {
        duration: 520,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.spring(floatAnim, {
        damping: 16,
        stiffness: 70,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle breathing/floating loop for luxury feel
    const breathingLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(floatAnim, {
            duration: 1600,
            toValue: -6,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            duration: 1600,
            toValue: 1,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(floatAnim, {
            duration: 1600,
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            duration: 1600,
            toValue: 0.88,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    breathingLoop.start();

    return () => {
      breathingLoop.stop();
    };
  }, [floatAnim, opacityAnim, pulseAnim, reduceMotion]);

  return (
    <View style={styles.screen}>
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: opacityAnim,
            transform: [{ translateY: floatAnim }],
          },
        ]}
      >
        <BrandLogo size={68} />
      </Animated.View>

      <Animated.View style={[styles.statusContainer, { opacity: pulseAnim }]}>
        <View style={styles.statusDot} />
        <Text style={styles.label}>{message.toLocaleUpperCase()}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    letterSpacing: 1.6,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    alignItems: 'center',
    backgroundColor: colors.black,
    flex: 1,
    gap: spacing.xl,
    justifyContent: 'center',
    paddingHorizontal: layout.screenGutter,
  },
  statusContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  statusDot: {
    backgroundColor: colors.goldStrong,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
});
