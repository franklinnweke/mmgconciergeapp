import { colors, radii, spacing, typography } from '@mmg/brand';
import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type ErrorBoundaryProps = {
  children?: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class AppErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('AppErrorBoundary caught an unhandled render error:', error, errorInfo);
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback && this.state.error) {
        return this.props.fallback(this.state.error, this.reset);
      }

      return <RecoveryFallback retry={this.reset} />;
    }

    return this.props.children;
  }
}

export function ErrorBoundary({ retry }: { error: Error; retry: () => void }) {
  return <RecoveryFallback retry={retry} />;
}

function RecoveryFallback({ retry }: { retry: () => void }) {
  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>We couldn&apos;t display this screen.</Text>
          <Text style={styles.body}>
            Try again. If this keeps happening, contact MMG Concierge.
          </Text>
          <Pressable accessibilityLabel="Try again" accessibilityRole="button" onPress={retry} style={{ marginTop: spacing.xl, width: '100%' }}>
            <View style={styles.primaryButton}>
              <Text style={styles.primaryText}>TRY AGAIN</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
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
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 22,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
});
