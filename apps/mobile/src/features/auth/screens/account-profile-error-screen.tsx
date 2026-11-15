import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, typography, type ThemeColors } from '@mmg/brand';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandWordmark } from '../../../components/brand-wordmark';
import { PressableScale } from '../../../components/pressable-scale';
import { useAuth } from '../../../core/auth/auth-context';
import { useTheme, useThemeStyles } from '../../../core/theme';

export function AccountProfileErrorScreen() {
  const auth = useAuth();
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      await auth.retryProfile();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}><BrandWordmark withLogo /></View>
      <View style={styles.content}>
        <View style={styles.iconFrame}>
          <Ionicons color={colors.goldStrong} name="cloud-offline-outline" size={30} />
        </View>
        <Text style={styles.title}>We couldn’t confirm your profile.</Text>
        <Text style={styles.body}>
          Check your connection and try again before continuing.
        </Text>
        <PressableScale disabled={retrying} onPress={() => void retry()} style={styles.fullWidth}>
          <View style={styles.primaryButton}>
            {retrying ? <ActivityIndicator color={colors.primaryContrast} /> : (
              <><Text style={styles.primaryText}>Try again</Text><Ionicons color={colors.primaryContrast} name="refresh" size={18} /></>
            )}
          </View>
        </PressableScale>
        <PressableScale onPress={() => void auth.signOut()} style={styles.signOutPressable}>
          <Text style={styles.signOut}>Use a different account</Text>
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}

const createStyles = ({ colors }: { colors: ThemeColors }) =>
  StyleSheet.create({
    body: { color: colors.textMuted, fontFamily: typography.body, fontSize: 15, lineHeight: 24, maxWidth: 340, textAlign: 'center' },
    content: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', paddingHorizontal: spacing.xl },
    eyebrow: { color: colors.primary, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 2.1 },
    fullWidth: { alignSelf: 'stretch' },
    iconFrame: { alignItems: 'center', borderColor: colors.borderStrong, borderRadius: radii.pill, borderWidth: 1, height: 70, justifyContent: 'center', width: 70 },
    primaryButton: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.button, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.md, minHeight: 56 },
    primaryText: { color: colors.primaryContrast, fontFamily: typography.bodySemiBold, fontSize: 14 },
    screen: { backgroundColor: colors.canvas, flex: 1 },
    signOut: { color: colors.textMuted, fontFamily: typography.bodyMedium, fontSize: 12, padding: spacing.md },
    signOutPressable: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
    title: { color: colors.textPrimary, fontFamily: typography.display, fontSize: 38, letterSpacing: -0.8, lineHeight: 44, textAlign: 'center' },
    topBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  });
