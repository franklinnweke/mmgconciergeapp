import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, spacing, typography } from '@mmg/brand';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';

type SectionHeaderProps = {
  actionLabel?: string;
  eyebrow?: string;
  onAction?: () => void;
  title: string;
};

export function SectionHeader({ actionLabel, eyebrow, onAction, title }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      </View>
      {actionLabel && onAction ? (
        <PressableScale
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onPress={onAction}
        >
          <View style={styles.action}>
            <Text style={styles.actionLabel}>{actionLabel}</Text>
            <Ionicons color={colors.goldStrong} name="chevron-forward" size={16} />
          </View>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    minHeight: 44,
    paddingLeft: spacing.sm,
  },
  actionLabel: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  copy: { flex: 1 },
  eyebrow: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
    letterSpacing: 1.2,
  },
  row: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.xl,
    letterSpacing: -0.4,
    marginTop: 4,
  },
});
