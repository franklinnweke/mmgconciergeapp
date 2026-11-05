import { typography } from '@mmg/brand';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../core/theme';
import { BrandLogo } from './brand-logo';

type BrandWordmarkProps = {
  compact?: boolean;
  condensed?: boolean;
  withLogo?: boolean;
};

export function BrandWordmark({
  compact = false,
  condensed = false,
  withLogo = false,
}: BrandWordmarkProps) {
  const { colors } = useTheme();

  return (
    <View accessibilityLabel="MMG Concierge" style={styles.row}>
      {withLogo ? <BrandLogo size={compact ? 24 : 28} /> : null}
      <Text style={[styles.mmg, { color: colors.textPrimary }, compact && styles.mmgCompact]}>MMG</Text>
      {!condensed ? (
        <>
          <View style={[styles.rule, { backgroundColor: colors.primary }]} />
          <Text style={[styles.concierge, { color: colors.textPrimary }]}>CONCIERGE</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  concierge: {
    fontFamily: typography.bodyMedium,
    fontSize: 11,
    letterSpacing: 2.4,
  },
  mmg: {
    fontFamily: typography.display,
    fontSize: 23,
    letterSpacing: 0.8,
  },
  mmgCompact: {
    fontSize: 20,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  rule: {
    height: 18,
    width: 1,
  },
});
