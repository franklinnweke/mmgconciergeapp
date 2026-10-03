import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { useAuth } from '@/core/auth/auth-context';

export function VerifyEmailScreen() {
  const auth = useAuth();
  const [busyAction, setBusyAction] = useState<'refresh' | 'resend' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: 'refresh' | 'resend') {
    setBusyAction(action);
    setMessage(null);
    try {
      if (action === 'refresh') {
        await auth.refreshUser();
      } else {
        await auth.resendVerification();
        setMessage('A new verification link has been sent.');
      }
    } catch (error) {
      setMessage(auth.errorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <BrandWordmark withLogo />
      </View>
      <View style={styles.content}>
        <View style={styles.iconFrame}>
          <Ionicons color={colors.goldStrong} name="mail-unread-outline" size={31} />
        </View>
        <Text style={styles.title}>Check your inbox.</Text>
        <Text style={styles.body}>
          We sent a verification link to{' '}
          <Text style={styles.email}>{auth.user?.email}</Text>. Open it, then return here.
        </Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <PressableScale accessibilityRole="button" onPress={() => void run('refresh')} style={styles.fullWidth}>
          <View style={styles.primaryButton}>
            {busyAction === 'refresh' ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <Text style={styles.primaryText}>I’ve verified my email</Text>
            )}
          </View>
        </PressableScale>
        <PressableScale accessibilityRole="button" onPress={() => void run('resend')} style={styles.fullWidth}>
          <View style={styles.secondaryButton}>
            {busyAction === 'resend' ? (
              <ActivityIndicator color={colors.ivory} />
            ) : (
              <Text style={styles.secondaryText}>Send another link</Text>
            )}
          </View>
        </PressableScale>
      </View>
      <PressableScale accessibilityRole="button" onPress={() => void auth.signOut()}>
        <Text style={styles.signOut}>Use a different account</Text>
      </PressableScale>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 24,
    maxWidth: 340,
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  email: { color: colors.ivory, fontFamily: typography.bodyMedium },
  fullWidth: { alignSelf: 'stretch' },
  iconFrame: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 72,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    width: 72,
  },
  message: {
    color: colors.silver,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.button,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 56,
  },
  primaryText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  screen: { backgroundColor: colors.black, flex: 1, paddingHorizontal: spacing.lg },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.button,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 54,
  },
  secondaryText: { color: colors.ivory, fontFamily: typography.bodyMedium, fontSize: 14 },
  signOut: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    paddingBottom: spacing.lg,
    textAlign: 'center',
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 40,
    letterSpacing: -0.8,
    lineHeight: 46,
    textAlign: 'center',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
});
