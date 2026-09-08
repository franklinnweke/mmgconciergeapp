import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BrandWordmark } from './brand-wordmark';
import { PressableScale } from './pressable-scale';
import { shouldCondenseScreenHeader } from './screen-header-layout';

type ScreenHeaderProps = {
  backAccessibilityLabel?: string;
  onBack?: () => void;
  right?: ReactNode;
  showBrand?: boolean;
  style?: StyleProp<ViewStyle>;
  title?: string;
};

export function ScreenHeader({
  backAccessibilityLabel = 'Go back',
  onBack,
  right,
  showBrand,
  style,
  title,
}: ScreenHeaderProps) {
  const { width } = useWindowDimensions();
  const shouldShowBrand = showBrand ?? !onBack;
  const condensed = shouldCondenseScreenHeader({
    hasBack: Boolean(onBack),
    hasRight: Boolean(right),
    width,
  });

  return (
    <View style={[styles.header, style]}>
      <View style={styles.left}>
        {onBack ? (
          <PressableScale
            accessibilityLabel={backAccessibilityLabel}
            accessibilityRole="button"
            onPress={onBack}
            style={styles.backPressable}
          >
            <View style={styles.backButton}>
              <Ionicons color={colors.ivory} name="arrow-back" size={20} />
            </View>
          </PressableScale>
        ) : null}
        {title ? (
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
        ) : shouldShowBrand ? (
          <BrandWordmark compact condensed={condensed} withLogo />
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(21,21,21,0.84)',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  backPressable: {
    height: 44,
    width: 44,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  left: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  right: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
  },
  title: {
    color: colors.ivory,
    flexShrink: 1,
    fontFamily: typography.bodySemiBold,
    fontSize: 17,
  },
});
