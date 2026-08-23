import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ComponentProps } from 'react';
import {
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
import {
  FieldLabel,
  InlineNotice,
  PrimaryAction,
} from '@/components/ui/mobile-primitives';
import { useAuth } from '@/core/auth/auth-context';

type Mode = 'sign-in' | 'register';
const heroImage = require('../../../../assets/images/fleet/prado-250-obsidian-hero.png');

export function AuthEntryScreen() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function changeMode(nextMode: Mode) {
    if (busy) return;
    setError(null);
    setNotice(null);
    setMode(nextMode);
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
      } else {
        await auth.signIn({ email, password });
      }
    });
  }

  async function handleGoogleSignIn() {
    await run(() => auth.signInGoogle());
  }

  async function handlePasswordReset() {
    await run(async () => {
      await auth.requestReset(email);
      setNotice('Password reset instructions have been sent.');
    });
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image contentFit="cover" source={heroImage} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(4,4,4,.22)', 'rgba(4,4,4,.18)', colors.black]}
            locations={[0, 0.48, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroContent, { paddingTop: insets.top + spacing.md }]}>
            <BrandWordmark withLogo />
            <Text style={styles.heroTitle}>Lagos, handled in a Prado.</Text>
          </View>
        </View>

        <View style={styles.formSection}>
          <View style={styles.modeRow}>
            <ModeButton active={mode === 'sign-in'} label="Sign in" onPress={() => changeMode('sign-in')} />
            <ModeButton active={mode === 'register'} label="Create account" onPress={() => changeMode('register')} />
          </View>

          <View style={styles.headingBlock}>
            <Text accessibilityRole="header" style={styles.formTitle}>
              {mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
            </Text>
            <Text style={styles.formBody}>
              {mode === 'sign-in'
                ? 'Sign in to manage journeys, bookings and your account.'
                : 'Start with your name, email and password.'}
            </Text>
          </View>

          <View style={styles.fields}>
            {mode === 'register' ? (
              <AuthField
                autoCapitalize="words"
                autoComplete="name"
                label="Full name"
                onChangeText={setDisplayName}
                placeholder="Your full name"
                value={displayName}
              />
            ) : null}
            <AuthField
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              label="Email"
              onChangeText={setEmail}
              placeholder="you@example.com"
              value={email}
            />
            <AuthField
              autoCapitalize="none"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              label="Password"
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              secureTextEntry
              value={password}
            />
          </View>

          {error ? <InlineNotice icon="alert-circle-outline" tone="danger">{error}</InlineNotice> : null}
          {notice ? <InlineNotice icon="checkmark-circle-outline" tone="success">{notice}</InlineNotice> : null}

          <PrimaryAction
            icon="arrow-forward"
            label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
            loading={busy}
            onPress={() => void handlePrimaryAction()}
          />

          {mode === 'sign-in' ? (
            <PressableScale
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void handlePasswordReset()}
              style={styles.forgotTarget}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </PressableScale>
          ) : null}

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
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

          <Text style={styles.termsText}>By continuing, you agree to MMG Concierge’s Terms and acknowledge the Privacy Notice.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ModeButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={styles.modeButtonShell}>
      <View style={[styles.modeButton, active && styles.modeButtonActive]}>
        <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

type AuthFieldProps = ComponentProps<typeof TextInput> & { label: string };

function AuthField({ label, ...inputProps }: AuthFieldProps) {
  return (
    <View>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        placeholderTextColor="rgba(180,174,164,.62)"
        selectionColor={colors.goldStrong}
        style={styles.fieldInput}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    backgroundColor: colors.line,
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  dividerText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  fieldInput: {
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  fields: { gap: spacing.md },
  forgotTarget: {
    alignSelf: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  forgotText: {
    color: colors.goldStrong,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  formBody: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  formSection: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  formTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 30,
    letterSpacing: -0.5,
  },
  googleButton: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
  },
  googleButtonText: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
  },
  headingBlock: {},
  hero: { height: 310 },
  heroContent: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  heroTitle: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 32,
    letterSpacing: -0.6,
    lineHeight: 38,
    maxWidth: 285,
  },
  modeButton: {
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
    justifyContent: 'center',
    minHeight: 46,
  },
  modeButtonActive: { borderBottomColor: colors.goldStrong },
  modeButtonShell: { flex: 1 },
  modeButtonText: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    textAlign: 'center',
  },
  modeButtonTextActive: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
  },
  modeRow: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
  },
  screen: { backgroundColor: colors.black, flex: 1 },
  scrollContent: { flexGrow: 1 },
  termsText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
});
