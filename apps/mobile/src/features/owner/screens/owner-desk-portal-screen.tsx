import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { type Href, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { OwnerApplicationDeskScreen } from './owner-application-desk-screen';

export function OwnerDeskPortalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <OwnerApplicationDeskScreen />
      <PressableScale
        accessibilityLabel="Back to renting"
        accessibilityRole="button"
        onPress={() => router.replace('/(renter)' as Href)}
        style={[styles.renterAction, { top: insets.top + spacing.sm }]}
      >
        <Ionicons color={colors.ivory} name="arrow-back" size={16} />
        <Text style={styles.renterActionText}>Rent cars</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  renterAction: {
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
  renterActionText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 12 },
  root: { backgroundColor: colors.black, flex: 1 },
});
