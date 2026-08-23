import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radii, spacing, typography } from '@mmg/brand';
import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';

export const MOBILE_GUTTER = spacing.md;

type MobileHeaderProps = {
  onBack?: () => void;
  right?: ReactNode;
  subtitle?: string;
  title?: string;
};

export function MobileHeader({ onBack, right, subtitle, title }: MobileHeaderProps) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <PressableScale
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={onBack}
          style={styles.headerSide}
        >
          <View style={styles.iconTarget}>
            <Ionicons color={colors.ivory} name="arrow-back" size={22} />
          </View>
        </PressableScale>
      ) : (
        <View style={styles.headerSide} />
      )}
      <View style={styles.headerCopy}>
        {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
    </View>
  );
}

type PrimaryActionProps = {
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  loading?: boolean;
  onPress: () => void;
};

export function PrimaryAction({ disabled, icon, label, loading, onPress }: PrimaryActionProps) {
  return (
    <PressableScale
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: Boolean(loading), disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      haptic="light"
      onPress={onPress}
      style={[styles.actionShell, (disabled || loading) && styles.disabled]}
    >
      <View style={styles.primaryAction}>
        {loading ? <ActivityIndicator color={colors.black} size="small" /> : null}
        <Text style={styles.primaryActionText}>{label}</Text>
        {!loading && icon ? <Ionicons color={colors.black} name={icon} size={18} /> : null}
      </View>
    </PressableScale>
  );
}

type SecondaryActionProps = {
  destructive?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
};

export function SecondaryAction({ destructive, disabled, icon, label, onPress }: SecondaryActionProps) {
  const color = destructive ? colors.danger : colors.ivory;
  return (
    <PressableScale
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.actionShell, disabled && styles.disabled]}
    >
      <View style={[styles.secondaryAction, destructive && styles.destructiveAction]}>
        <Text style={[styles.secondaryActionText, { color }]}>{label}</Text>
        {icon ? <Ionicons color={color} name={icon} size={18} /> : null}
      </View>
    </PressableScale>
  );
}

export function SectionHeading({ children }: PropsWithChildren) {
  return <Text style={styles.sectionHeading}>{children}</Text>;
}

export function FieldLabel({ children }: PropsWithChildren) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

type InlineNoticeProps = PropsWithChildren<{
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'danger' | 'neutral' | 'success';
}>;

export function InlineNotice({ children, icon, tone = 'neutral' }: InlineNoticeProps) {
  const color = tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : colors.goldStrong;
  return (
    <View style={[styles.notice, tone === 'danger' && styles.dangerNotice]}>
      {icon ? <Ionicons color={color} name={icon} size={18} /> : null}
      <Text style={[styles.noticeText, tone === 'danger' && styles.dangerNoticeText]}>{children}</Text>
    </View>
  );
}

export function Hairline() {
  return <View style={styles.hairline} />;
}

const styles = StyleSheet.create({
  actionShell: {
    alignSelf: 'stretch',
  },
  dangerNotice: {
    borderColor: 'rgba(209,133,120,0.32)',
  },
  dangerNoticeText: {
    color: colors.silver,
  },
  destructiveAction: {
    borderColor: 'rgba(209,133,120,0.42)',
  },
  disabled: {
    opacity: 0.48,
  },
  fieldLabel: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
    marginBottom: spacing.xs,
  },
  hairline: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 52,
  },
  headerCopy: {
    flex: 1,
    paddingHorizontal: spacing.xs,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerSide: {
    minHeight: 44,
    minWidth: 44,
  },
  headerSubtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
    textAlign: 'center',
  },
  headerTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
    textAlign: 'center',
  },
  iconTarget: {
    alignItems: 'flex-start',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  notice: {
    alignItems: 'flex-start',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  noticeText: {
    color: colors.silver,
    flex: 1,
    fontFamily: typography.body,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  primaryActionText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  secondaryAction: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  secondaryActionText: {
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.sm,
  },
  sectionHeading: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.lg,
    letterSpacing: -0.25,
  },
});
