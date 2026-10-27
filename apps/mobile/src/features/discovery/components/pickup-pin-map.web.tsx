import { colors, spacing, typography } from '@mmg/brand';
import { Text, View } from 'react-native';
import type { PickupPinMapProps } from './pickup-pin-map';

/** Native Maps SDKs cannot be imported by the browser. GPS/search still work. */
export function PickupPinMap({ style }: PickupPinMapProps) {
  return <View style={[{ flex: 1, justifyContent: 'center', padding: spacing.lg }, style]}>
    <Text style={{ color: colors.silver, fontFamily: typography.body, fontSize: 13 }}>
      Map preview is available in the mobile app. Search or use your location to choose a pickup.
    </Text>
  </View>;
}
