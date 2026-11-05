import { Ionicons } from '@expo/vector-icons';
import { layout, spacing, typography } from '@mmg/brand';
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';

import { BrandWordmark } from '../../../components/brand-wordmark';
import { useReducedMotion } from '../../../components/use-reduced-motion';
import { useTheme } from '../../../core/theme';

type AuthLoadingScreenProps = { message?: string };

export function AuthLoadingScreen({ message = 'Loading' }: AuthLoadingScreenProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion(true);
  const [travel] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) return undefined;
    const timing = (toValue: number) => Animated.timing(travel, {
      toValue, duration: 850, easing: Easing.inOut(Easing.sin),
      isInteraction: false, useNativeDriver: Platform.OS !== 'web',
    });
    const loop = Animated.loop(Animated.sequence([timing(12), timing(-12), timing(0)]));
    loop.start();
    return () => {
      loop.stop();
      travel.setValue(0);
    };
  }, [reduceMotion, travel]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
      <BrandWordmark />
      <View accessible accessibilityLabel={message} accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={styles.status}>
        <View style={styles.lane} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Animated.View style={[styles.vehicle, { transform: [{ translateX: travel }] }]}>
            <Ionicons name="car-sport-outline" size={26} color={colors.textPrimary} />
          </Animated.View>
          <View style={[styles.road, { backgroundColor: colors.borderStrong }]} />
        </View>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: typography.bodyMedium, fontSize: 14 },
  screen: {
    alignItems: 'center', flex: 1,
    gap: spacing.xl, justifyContent: 'center', paddingHorizontal: layout.screenGutter,
  },
  status: { alignItems: 'center', gap: spacing.md },
  lane: { alignItems: 'center', gap: spacing.xs, width: 76 },
  vehicle: { alignItems: 'center' },
  road: { alignSelf: 'stretch', height: StyleSheet.hairlineWidth },
});
