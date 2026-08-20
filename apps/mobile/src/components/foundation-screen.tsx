import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { Href, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandWordmark } from './brand-wordmark';
import { PressableScale } from './pressable-scale';

type FoundationScreenProps = {
  action: string;
  actionHref?: Href;
  body: string;
  eyebrow: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
};

export function FoundationScreen({
  action,
  actionHref = '/(renter)/browse',
  body,
  eyebrow,
  icon,
  title,
}: FoundationScreenProps) {
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.topBar}>
        <BrandWordmark compact withLogo />
        <View style={styles.locationPill}>
          <View style={styles.onlineDot} />
          <Text style={styles.locationText}>LAGOS</Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.iconFrame}>
          <Ionicons color={colors.goldStrong} name={icon} size={28} />
        </View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <PressableScale
          accessibilityRole="button"
          onPress={() => router.push(actionHref)}
          style={styles.actionShell}
        >
          <View style={styles.action}>
            <Text style={styles.actionText}>{action}</Text>
            <Ionicons color={colors.black} name="arrow-forward" size={18} />
          </View>
        </PressableScale>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Chauffeur and Lagos delivery included.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  actionShell: {
    alignSelf: 'stretch',
    marginTop: spacing.xs,
  },
  actionText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
  },
  body: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 25,
    maxWidth: 340,
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  eyebrow: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
    letterSpacing: 2.2,
  },
  footer: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  footerText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
  },
  iconFrame: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 64,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    width: 64,
  },
  locationPill: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  locationText: {
    color: colors.silver,
    fontFamily: typography.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1.4,
  },
  onlineDot: {
    backgroundColor: colors.success,
    borderRadius: radii.pill,
    height: 5,
    width: 5,
  },
  safeArea: {
    backgroundColor: colors.black,
    flex: 1,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 38,
    letterSpacing: -0.8,
    lineHeight: 44,
    maxWidth: 350,
    textAlign: 'center',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
