import { colors, typography } from '@mmg/brand';
import { StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from './brand-logo';

type BrandWordmarkProps = {
  compact?: boolean;
  withLogo?: boolean;
};

export function BrandWordmark({ compact = false, withLogo = false }: BrandWordmarkProps) {
  return (
    <View accessibilityLabel="MMG Concierge" style={styles.row}>
      {withLogo ? <BrandLogo size={compact ? 24 : 28} /> : null}
      <Text style={[styles.mmg, compact && styles.mmgCompact]}>MMG</Text>
      <View style={styles.rule} />
      <Text style={styles.concierge}>CONCIERGE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  concierge: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
    letterSpacing: 2.4,
  },
  mmg: {
    color: colors.ivory,
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
    backgroundColor: colors.gold,
    height: 18,
    width: 1,
  },
});
