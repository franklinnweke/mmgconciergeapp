import { Image } from 'expo-image';
import { type StyleProp, StyleSheet, type ImageStyle, View } from 'react-native';

const logoSource = require('../../assets/images/logo-transparent.png');

export type BrandLogoVariant = 'icon' | 'header' | 'hero' | 'splash';

export type BrandLogoProps = {
  size?: number;
  variant?: BrandLogoVariant;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
};

const variantSizes: Record<BrandLogoVariant, { width: number; height: number }> = {
  icon: { width: 28, height: 28 },
  header: { width: 36, height: 36 },
  hero: { width: 64, height: 64 },
  splash: { width: 88, height: 88 },
};

export function BrandLogo({
  accessibilityLabel = 'MMG Concierge Logo',
  size,
  style,
  variant = 'header',
}: BrandLogoProps) {
  const dimensions = size
    ? { width: size, height: size }
    : variantSizes[variant];

  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="image" style={styles.container}>
      <Image
        contentFit="contain"
        source={logoSource}
        style={[dimensions, style]}
        transition={200}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
