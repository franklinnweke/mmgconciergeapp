import { colors, radii, spacing, typography } from '@mmg/brand';
import { type Href, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { useAuth } from '@/core/auth/auth-context';
import { createOwnerVerificationRepository } from '../data/owner-verification-repository';

type OwnerProfileReadGuardProps = {
  children: ReactNode;
};

type ReadState = 'loading' | 'ready' | 'error';

export function OwnerProfileReadGuard({ children }: OwnerProfileReadGuardProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [retryKey, setRetryKey] = useState(0);
  const [readState, setReadState] = useState<ReadState>(user?.uid ? 'loading' : 'error');

  useEffect(() => {
    const ownerId = user?.uid;
    if (!ownerId) {
      setReadState('error');
      return;
    }

    let active = true;
    setReadState('loading');

    const unsubscribe = createOwnerVerificationRepository().subscribe(
      ownerId,
      () => {
        if (active) setReadState('ready');
      },
      () => {
        if (active) setReadState('error');
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [retryKey, user?.uid]);

  if (readState === 'loading') {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
        <View style={styles.content}>
          <ActivityIndicator color={colors.goldStrong} size="small" />
          <Text style={styles.loadingText}>Checking owner application...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (readState === 'error') {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
        <View style={styles.content}>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>
              We couldn&apos;t load your owner application.
            </Text>
            <Text style={styles.body}>Try again to refresh your application status.</Text>

            <PressableScale onPress={() => setRetryKey((key) => key + 1)} style={styles.action}>
              <View style={styles.primaryButton}>
                <Text style={styles.primaryText}>RETRY</Text>
              </View>
            </PressableScale>

            <PressableScale
              onPress={() => router.replace('/(owner)' as Href)}
              style={styles.action}
            >
              <View style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>RETURN TO OWNER DESK</Text>
              </View>
            </PressableScale>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  action: {
    marginTop: spacing.md,
    width: '100%',
  },
  body: {
    color: colors.silver,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 22,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
    width: '100%',
  },
  content: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    color: colors.silver,
    fontFamily: typography.body,
    fontSize: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 52,
    width: '100%',
  },
  primaryText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    width: '100%',
  },
  secondaryText: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 22,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
});
