import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
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

import { BrandWordmark } from '@/components/brand-wordmark';
import { PressableScale } from '@/components/pressable-scale';
import { useReducedMotion } from '@/components/use-reduced-motion';
import { useAuth } from '@/core/auth/auth-context';

type Mode = 'sign-in' | 'register';

const heroImage = require('../../../../assets/images/fleet/lagos-arrival-hero.png');

export function AuthEntryScreen() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [entranceOpacity] = useState(() => new Animated.Value(0));
  const [entranceTranslate] = useState(() => new Animated.Value(20));
  const [formOpacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduceMotion) {
      entranceOpacity.setValue(1);
      entranceTranslate.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(entranceOpacity, {
        duration: 560,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.spring(entranceTranslate, {
        damping: 18,
        stiffness: 90,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [entranceOpacity, entranceTranslate, reduceMotion]);

  function changeMode(nextMode: Mode) {
    if (nextMode === mode || busy) return;
    setError(null);
    setNotice(null);

    if (reduceMotion) {
      setMode(nextMode);
      formOpacity.setValue(1);
      return;
    }

    Animated.timing(formOpacity, {
      duration: 120,
      toValue: 0,
      useNativeDriver: true,
    }).start(() => {
      setMode(nextMode);
      Animated.timing(formOpacity, {
        duration: 220,
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
        await auth.register({ displayName, email, password });
        return;
      }
      await auth.signIn({ email, password });
    });
  }

  async function handleGoogleSignIn() {
    await run(async () => {
      await auth.signInGoogle();
    });
  }

  async function handlePasswordReset() {
    await run(async () => {
      await auth.requestReset(email);
      setNotice('Password reset instructions are on the way.');
    });
  }

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
          <Image contentFit="cover" source={heroImage} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(4,4,4,0.25)', 'rgba(4,4,4,0.15)', colors.black]}
            locations={[0, 0.52, 1]}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            style={[
              styles.heroContent,
              {
                opacity: entranceOpacity,
                paddingTop: insets.top + spacing.md,
                transform: [{ translateY: entranceTranslate }],
              },
            ]}
          >
            <View style={styles.topBar}>
              <BrandWordmark />
              <View style={styles.marketPill}>
                <View style={styles.marketDot} />
                <Text style={styles.marketText}>LAGOS</Text>
              </View>
            </View>
            <View>
              <Text style={styles.eyebrow}>PRIVATE CHAUFFEURED SERVICE</Text>
              <Text style={styles.heroTitle}>Your arrival starts here.</Text>
            </View>
          </Animated.View>
        </View>

        <Animated.View style={[styles.formSection, { opacity: formOpacity }]}>
          <View style={styles.modeRail}>
            <ModeButton
              active={mode === 'sign-in'}
              label="Sign in"
              onPress={() => changeMode('sign-in')}
            />
            <ModeButton
              active={mode === 'register'}
              label="Create account"
              onPress={() => changeMode('register')}
            />
          </View>

          <View style={styles.headingBlock}>
            <Text style={styles.formTitle}>
              {mode === 'sign-in' ? 'Welcome back.' : 'Join the guest list.'}
            </Text>
            <Text style={styles.formBody}>
              {mode === 'sign-in'
                ? 'Access your journeys and concierge support.'
                : 'Create your identity first. Profile and phone verification follow securely.'}
            </Text>
          </View>

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
                <>
                  <Text style={styles.primaryButtonText}>
                    {mode === 'sign-in' ? 'Continue securely' : 'Create account'}
                  </Text>
                  <Ionicons color={colors.black} name="arrow-forward" size={18} />
                </>
              )}
            </View>
          </PressableScale>

          {mode === 'sign-in' ? (
            <PressableScale
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void handlePasswordReset()}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
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

          <Text style={styles.termsText}>
            By continuing, you agree to MMG Concierge’s Terms and acknowledge the Privacy Notice.
          </Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type ModeButtonProps = { active: boolean; label: string; onPress(): void };

function ModeButton({ active, label, onPress }: ModeButtonProps) {
  return (
    <PressableScale accessibilityRole="tab" onPress={onPress} style={styles.modeButtonShell}>
      <View style={[styles.modeButton, active && styles.modeButtonActive]}>
        <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

type AuthFieldProps = React.ComponentProps<typeof TextInput> & {
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
    fontSize: 9,
    letterSpacing: 1.8,
  },
  eyebrow: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: 9,
    letterSpacing: 2.1,
    marginBottom: spacing.xs,
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
    fontSize: 9,
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
  forgotText: {
    color: colors.gold,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    paddingVertical: spacing.xs,
    textAlign: 'center',
  },
  formBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  formSection: {
    backgroundColor: colors.black,
    gap: spacing.lg,
    paddingBottom: 52,
    paddingHorizontal: spacing.lg,
  },
  formTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 32,
    letterSpacing: -0.6,
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
  headingBlock: { marginTop: spacing.xs },
  hero: { backgroundColor: colors.black, height: 310 },
  heroContent: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 42,
    paddingHorizontal: spacing.lg,
  },
  heroTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 42,
    letterSpacing: -1.1,
    lineHeight: 45,
    maxWidth: 330,
  },
  marketDot: { backgroundColor: colors.success, borderRadius: radii.pill, height: 5, width: 5 },
  marketPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,4,4,0.34)',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  marketText: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1.4,
  },
  modeButton: { alignItems: 'center', borderRadius: radii.pill, justifyContent: 'center', minHeight: 40 },
  modeButtonActive: { backgroundColor: colors.ivory },
  modeButtonShell: { flex: 1 },
  modeButtonText: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 12 },
  modeButtonTextActive: { color: colors.black, fontFamily: typography.bodySemiBold },
  modeRail: {
    backgroundColor: colors.graphite,
    borderRadius: radii.pill,
    flexDirection: 'row',
    marginTop: -20,
    padding: 4,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryButtonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 14 },
  screen: { backgroundColor: colors.black, flex: 1 },
  scrollContent: { backgroundColor: colors.black, flexGrow: 1 },
  termsText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 10,
    lineHeight: 16,
    paddingHorizontal: spacing.md,
    textAlign: 'center',
  },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
});
