import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { type Href, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { RenterProfileScreen } from './renter-profile-screen';

export function RenterAccountPortalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <RenterProfileScreen />
      <PressableScale
        accessibilityLabel="List a car or open Owner Desk"
        accessibilityRole="button"
        onPress={() => router.push('/(owner)' as Href)}
        style={[styles.ownerAction, { top: insets.top + spacing.sm }]}
      >
        <Ionicons color={colors.goldStrong} name="car-sport-outline" size={17} />
        <Text style={styles.ownerActionText}>List a car</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  ownerAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(21,21,21,0.92)',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    position: 'absolute',
    right: spacing.lg,
    zIndex: 20,
  },
  ownerActionText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 12 },
  root: { backgroundColor: colors.black, flex: 1 },
});
