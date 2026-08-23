import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@mmg/brand';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import {
  InlineNotice,
  PrimaryAction,
  SecondaryAction,
} from '@/components/ui/mobile-primitives';
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
      <View style={styles.topBar}><BrandWordmark withLogo /></View>
      <View style={styles.content}>
        <Ionicons color={colors.goldStrong} name="mail-unread-outline" size={30} />
        <Text accessibilityRole="header" style={styles.title}>Check your inbox</Text>
        <Text style={styles.body}>
          We sent a verification link to <Text style={styles.email}>{auth.user?.email}</Text>. Open it, then return here.
        </Text>
        {message ? <InlineNotice icon="information-circle-outline">{message}</InlineNotice> : null}
        <View style={styles.actions}>
          <PrimaryAction
            icon="arrow-forward"
            label="I’ve verified my email"
            loading={busyAction === 'refresh'}
            onPress={() => void run('refresh')}
          />
          <SecondaryAction
            disabled={busyAction !== null}
            label={busyAction === 'resend' ? 'Sending link' : 'Send another link'}
            onPress={() => void run('resend')}
          />
        </View>
      </View>
      <PressableScale accessibilityRole="button" onPress={() => void auth.signOut()} style={styles.signOutTarget}>
        <Text style={styles.signOut}>Use a different account</Text>
      </PressableScale>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  body: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 340,
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  email: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  signOut: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  signOutTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 31,
    letterSpacing: -0.55,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  topBar: { paddingTop: spacing.sm },
});
