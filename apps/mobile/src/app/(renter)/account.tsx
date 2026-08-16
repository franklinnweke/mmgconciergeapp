import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { useAuth } from '@/core/auth/auth-context';

export default function AccountScreen() {
  const { signOut, user } = useAuth();

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}>
        <BrandWordmark compact withLogo />
        <View style={styles.verifiedPill}>
          <Ionicons color={colors.success} name="checkmark-circle" size={13} />
          <Text style={styles.verifiedText}>VERIFIED EMAIL</Text>
        </View>
      </View>
      <View style={styles.content}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.displayName?.charAt(0).toUpperCase() || 'M'}</Text>
        </View>
        <Text style={styles.eyebrow}>RENTER ACCOUNT</Text>
        <Text style={styles.title}>{user?.displayName || 'MMG Guest'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={styles.rule} />
        <Text style={styles.note}>
          Keep your verified contact details, delivery address, privacy choices, and support access together.
        </Text>
        <PressableScale accessibilityRole="button" onPress={() => void signOut()} style={styles.fullWidth}>
          <View style={styles.signOutButton}>
            <Ionicons color={colors.ivory} name="log-out-outline" size={18} />
            <Text style={styles.signOutText}>Sign out</Text>
          </View>
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    height: 74,
    justifyContent: 'center',
    width: 74,
  },
  avatarText: { color: colors.black, fontFamily: typography.display, fontSize: 31 },
  content: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', paddingHorizontal: spacing.xl },
  email: { color: colors.muted, fontFamily: typography.body, fontSize: 14 },
  eyebrow: { color: colors.gold, fontFamily: typography.bodySemiBold, fontSize: 9, letterSpacing: 2 },
  fullWidth: { alignSelf: 'stretch' },
  note: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 21,
    maxWidth: 340,
    textAlign: 'center',
  },
  rule: { backgroundColor: colors.lineStrong, height: StyleSheet.hairlineWidth, marginVertical: spacing.xs, width: 64 },
  screen: { backgroundColor: colors.black, flex: 1 },
  signOutButton: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 54,
  },
  signOutText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 14 },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 38, letterSpacing: -0.7 },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: spacing.lg },
  verifiedPill: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  verifiedText: { color: colors.muted, fontFamily: typography.bodySemiBold, fontSize: 8, letterSpacing: 1.1 },
});
