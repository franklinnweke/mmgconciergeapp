import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '@mmg/brand';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { BrandWordmark } from './brand-wordmark';
import { PressableScale } from './pressable-scale';
import { shouldCondenseScreenHeader } from './screen-header-layout';

type ScreenHeaderProps = {
  backAccessibilityLabel?: string;
  onBack?: () => void;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ScreenHeader({
  backAccessibilityLabel = 'Go back',
  onBack,
  right,
  style,
}: ScreenHeaderProps) {
  const { width } = useWindowDimensions();
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
        <BrandWordmark compact condensed={condensed} withLogo />
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(21,21,21,0.92)',
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
  },
  right: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
  },
});
