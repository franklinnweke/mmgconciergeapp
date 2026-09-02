import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import type { AccountType } from '@mmg/contracts';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { useReducedMotion } from '@/components/use-reduced-motion';
import { useAuth } from '@/core/auth/auth-context';

type Mode = 'sign-in' | 'register';

type AuthEntryScreenProps = {
  accountType: AccountType | null;
  initialMode: Mode;
  onBack(): void;
};

const heroImage = require('../../../../assets/images/auth-prado-arrival.png');

export function AuthEntryScreen({ accountType, initialMode, onBack }: AuthEntryScreenProps) {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [entranceOpacity] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const [entranceTranslate] = useState(() => new Animated.Value(reduceMotion ? 0 : 16));
  const [formOpacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduceMotion) return;
    Animated.parallel([
      Animated.timing(entranceOpacity, {
        duration: 480,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.spring(entranceTranslate, {
        damping: 20,
        stiffness: 95,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [entranceOpacity, entranceTranslate, reduceMotion]);

  function showSignIn() {
    if (mode === 'sign-in' || busy) return;
    setError(null);
    setNotice(null);

    if (reduceMotion) {
      setMode('sign-in');
      return;
    }

    Animated.timing(formOpacity, {
      duration: 120,
      toValue: 0,
      useNativeDriver: true,
    }).start(() => {
      setMode('sign-in');
      Animated.timing(formOpacity, {
        duration: 200,
        toValue: 1,
        useNativeDriver: true,
      }).start();
    });
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caught) {
      setError(auth.errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handlePrimaryAction() {
    await run(async () => {
      if (mode === 'register') {
        if (!accountType) throw new Error('Choose how you will use MMG before registering.');
        await auth.register({ displayName, email, password }, accountType);
        onBack();
        return;
      }
      await auth.signIn({ email, password });
      onBack();
    });
  }

  async function handleGoogleSignIn() {
    await run(async () => {
      const result = await auth.signInGoogle(
        mode === 'register' ? accountType ?? undefined : undefined,
      );
      if (result === 'signed-in') onBack();
    });
  }

  async function handlePasswordReset() {
    await run(async () => {
      await auth.requestReset(email);
      setNotice('Password reset instructions are on the way.');
    });
  }

  const title = mode === 'sign-in'
    ? 'Welcome back.'
    : accountType === 'owner'
      ? 'Create an owner account.'
      : 'Create a renter account.';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image
            accessibilityLabel="A dark executive SUV at a Lagos residence"
            contentFit="cover"
            source={heroImage}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(4,4,4,0.18)', 'rgba(4,4,4,0.08)', colors.black]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            style={[
              styles.heroContent,
              {
                opacity: entranceOpacity,
                paddingTop: insets.top + spacing.sm,
                transform: [{ translateY: entranceTranslate }],
              },
            ]}
          >
            <ScreenHeader onBack={onBack} />
          </Animated.View>
        </View>

        <Animated.View style={[styles.formSection, { opacity: formOpacity }]}>
          <Text accessibilityRole="header" style={styles.formTitle}>{title}</Text>

          <View style={styles.fields}>
            {mode === 'register' ? (
              <AuthField
                autoCapitalize="words"
                autoComplete="name"
                icon="person-outline"
                label="FULL NAME"
                onChangeText={setDisplayName}
                placeholder="Your full name"
                value={displayName}
              />
            ) : null}
            <AuthField
              autoCapitalize="none"
              autoComplete="email"
              icon="mail-outline"
              keyboardType="email-address"
              label="EMAIL"
              onChangeText={setEmail}
              placeholder="you@example.com"
              value={email}
            />
            <AuthField
              autoCapitalize="none"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              icon="lock-closed-outline"
              label="PASSWORD"
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              secureTextEntry
              value={password}
            />
          </View>

          {error ? <FeedbackMessage kind="error" message={error} /> : null}
          {notice ? <FeedbackMessage kind="notice" message={notice} /> : null}

          <PressableScale
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void handlePrimaryAction()}
          >
            <View style={[styles.primaryButton, busy && styles.disabledButton]}>
              {busy ? (
                <ActivityIndicator color={colors.black} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode === 'sign-in' ? 'Sign in' : 'Create account'}
                </Text>
              )}
            </View>
          </PressableScale>

          {mode === 'sign-in' ? (
            <PressableScale
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void handlePasswordReset()}
              style={styles.textAction}
            >
              <Text style={styles.textActionLabel}>Forgot password?</Text>
            </PressableScale>
          ) : null}

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>

          <PressableScale
            accessibilityLabel="Continue with Google"
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void handleGoogleSignIn()}
          >
            <View style={styles.googleButton}>
              <Ionicons color={colors.ivory} name="logo-google" size={18} />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </View>
          </PressableScale>

          <PressableScale
            accessibilityRole="button"
            disabled={busy}
            onPress={mode === 'register' ? showSignIn : onBack}
            style={styles.textAction}
          >
            <Text style={styles.textActionLabel}>
              {mode === 'register'
                ? 'Already have an account? Sign in'
                : 'New to MMG? Choose account type'}
            </Text>
          </PressableScale>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type AuthFieldProps = ComponentProps<typeof TextInput> & {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
};

function AuthField({ icon, label, ...inputProps }: AuthFieldProps) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldShell}>
        <Ionicons color={colors.muted} name={icon} size={18} />
        <TextInput
          placeholderTextColor="rgba(180,174,164,0.62)"
          selectionColor={colors.gold}
          style={styles.fieldInput}
          {...inputProps}
        />
      </View>
    </View>
  );
}

function FeedbackMessage({ kind, message }: { kind: 'error' | 'notice'; message: string }) {
  return (
    <View style={styles.feedbackRow}>
      <Ionicons
        color={kind === 'error' ? colors.danger : colors.success}
        name={kind === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
        size={17}
      />
      <Text style={styles.feedbackText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disabledButton: { opacity: 0.66 },
  divider: { backgroundColor: colors.line, flex: 1, height: StyleSheet.hairlineWidth },
  dividerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  dividerText: {
    color: colors.muted,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.8,
  },
  feedbackRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  feedbackText: {
    color: colors.silver,
    flex: 1,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  fieldInput: {
    color: colors.ivory,
    flex: 1,
    fontFamily: typography.body,
    fontSize: 15,
    paddingVertical: 0,
  },
  fieldLabel: {
    color: colors.muted,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    marginBottom: spacing.xs,
  },
  fieldShell: {
    alignItems: 'center',
    borderBottomColor: colors.lineStrong,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 50,
  },
  fields: { gap: spacing.lg },
  formSection: {
    backgroundColor: colors.black,
    gap: spacing.lg,
    paddingBottom: 44,
    paddingHorizontal: spacing.lg,
  },
  formTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 34,
    letterSpacing: -0.7,
    lineHeight: 40,
  },
  googleButton: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 54,
  },
  googleButtonText: { color: colors.ivory, fontFamily: typography.bodySemiBold, fontSize: 14 },
  hero: { backgroundColor: colors.black, height: 260 },
  heroContent: { paddingHorizontal: spacing.lg },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryButtonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  screen: { backgroundColor: colors.black, flex: 1 },
  scrollContent: { backgroundColor: colors.black, flexGrow: 1 },
  textAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  textActionLabel: {
    color: colors.gold,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    paddingVertical: spacing.xs,
    textAlign: 'center',
  },
});
