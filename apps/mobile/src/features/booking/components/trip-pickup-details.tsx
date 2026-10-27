import { colors, spacing, typography } from '@mmg/brand';
import type { PickupLocationSnapshot } from '@mmg/contracts/rental-request';
import { pickupDirectionsUrl } from '@mmg/domain';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';

export function TripPickupDetails({ pickup, time }: { pickup?: PickupLocationSnapshot; time?: string }) {
  const [error, setError] = useState(false);
  const url = pickup ? pickupDirectionsUrl(pickup) : null;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>Pickup</Text>
      {pickup ? <>
        <Text style={styles.text}>{pickup.formattedAddress}</Text>
        {pickup.note ? <Text style={styles.secondary}>{pickup.note}</Text> : null}
        <Text style={styles.secondary}>{time ? `${time} WAT · Confirmed with MMG` : 'Time to be confirmed with MMG'}</Text>
        {url ? <PressableScale accessibilityRole="link" accessibilityLabel="Open pickup directions"
          style={styles.action} onPress={() => {
            setError(false);
            void Linking.openURL(url).catch(() => setError(true));
          }}><Text style={styles.link}>Open directions</Text></PressableScale> : null}
      </> : <Text style={styles.secondary}>Pickup not recorded</Text>}
      {error ? <Text accessibilityRole="alert" style={styles.secondary}>Directions could not open. Please try again.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs, marginTop: spacing.lg },
  title: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 16 },
  text: { color: colors.ivory, fontFamily: typography.body, fontSize: 15, lineHeight: 22 },
  secondary: { color: colors.silver, fontFamily: typography.body, fontSize: 13, lineHeight: 19 },
  action: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { color: colors.goldStrong, fontFamily: typography.bodyMedium, fontSize: 14 },
});
