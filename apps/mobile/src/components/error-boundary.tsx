import { colors, radii, spacing, typography } from '@mmg/brand';
import React, { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  formatDiagnosticReport,
  getBuildInfo,
  getDiagnosticSnapshot,
  isDiagnosticModeEnabled,
  sanitizeDiagnosticText,
  type DiagnosticSnapshot,
} from '../core/diagnostics/diagnostic-tracker';
import { reportUnexpectedMobileError } from '../core/diagnostics/crash-reporting';

export type ErrorBoundaryProps = {
  children?: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
};

type State = {
  diagnosticSnapshot: DiagnosticSnapshot | null;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  hasError: boolean;
};

export class AppErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = {
    diagnosticSnapshot: null,
    error: null,
    errorInfo: null,
    hasError: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportUnexpectedMobileError(error, 'render');
    const snapshot = getDiagnosticSnapshot();
    this.setState({
      diagnosticSnapshot: snapshot,
      errorInfo,
    });

    if (isDiagnosticModeEnabled()) {
      const buildInfo = getBuildInfo();
      const sanitizedReport = formatDiagnosticReport(
        error,
        errorInfo.componentStack,
        snapshot,
        buildInfo,
      );
      console.error(
        `[AppErrorBoundary] Unhandled render error (${snapshot.incidentId}):\n${sanitizedReport}`,
      );
    }
  }

  reset = () => {
    this.setState({
      diagnosticSnapshot: null,
      error: null,
      errorInfo: null,
      hasError: false,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback && this.state.error) {
        return this.props.fallback(this.state.error, this.reset);
      }

      return (
        <RecoveryFallback
          diagnosticSnapshot={this.state.diagnosticSnapshot}
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          retry={this.reset}
        />
      );
    }

    return this.props.children;
  }
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const snapshot = getDiagnosticSnapshot();
  return (
    <RecoveryFallback
      diagnosticSnapshot={snapshot}
      error={error}
      errorInfo={null}
      retry={retry}
    />
  );
}

function RecoveryFallback({
  diagnosticSnapshot,
  error,
  errorInfo,
  retry,
}: {
  diagnosticSnapshot?: DiagnosticSnapshot | null;
  error?: Error | null;
  errorInfo?: ErrorInfo | null;
  retry: () => void;
}) {
  const diagnosticEnabled = isDiagnosticModeEnabled();
  const [shareStatus, setShareStatus] = useState<'idle' | 'shared'>('idle');

  if (!diagnosticEnabled || !error) {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>
              We couldn&apos;t display this screen.
            </Text>
            <Text style={styles.body}>
              Try again. If this keeps happening, contact MMG Concierge.
            </Text>
            <Pressable
              accessibilityLabel="Try again"
              accessibilityRole="button"
              onPress={retry}
              style={{ marginTop: spacing.xl, width: '100%' }}
            >
              <View style={styles.primaryButton}>
                <Text style={styles.primaryText}>TRY AGAIN</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const snapshot = diagnosticSnapshot ?? getDiagnosticSnapshot();
  const buildInfo = getBuildInfo();
  const reportText = formatDiagnosticReport(
    error,
    errorInfo?.componentStack,
    snapshot,
    buildInfo,
  );

  async function handleShare() {
    try {
      await Share.share({
        message: reportText,
        title: `MMG Diagnostic Report (${snapshot.incidentId})`,
      });
      setShareStatus('shared');
    } catch {
      // User dismissed share sheet or share failed
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>
            We couldn&apos;t display this screen.
          </Text>
          <Text style={styles.body}>
            Try again. If this keeps happening, contact MMG Concierge.
          </Text>
          <Pressable
            accessibilityLabel="Try again"
            accessibilityRole="button"
            onPress={retry}
            style={{ marginTop: spacing.lg, width: '100%' }}
          >
            <View style={styles.primaryButton}>
              <Text style={styles.primaryText}>TRY AGAIN</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.diagnosticCard}>
          <View style={styles.diagnosticHeader}>
            <View style={styles.diagnosticBadge}>
              <Text style={styles.diagnosticBadgeText}>DIAGNOSTIC BUILD · DEV ONLY</Text>
            </View>
          </View>

          <Text style={styles.diagnosticIncidentId}>ID: {snapshot.incidentId}</Text>
          <Text style={styles.diagnosticMeta}>
            Route: {snapshot.currentRoute} · Auth: {snapshot.authPhase}
          </Text>
          <Text style={styles.diagnosticMeta}>
            Version: {buildInfo.version} ({buildInfo.buildNumber}) · {buildInfo.env}
          </Text>

          <View style={styles.errorSection}>
            <Text style={styles.errorTitle}>
              {error.name}: {sanitizeDiagnosticText(error.message)}
            </Text>
          </View>

          {errorInfo?.componentStack ? (
            <View style={styles.stackSection}>
              <Text style={styles.sectionLabel}>React Component Stack</Text>
              <ScrollView horizontal style={styles.stackScrollView}>
                <Text selectable style={styles.codeText}>
                  {sanitizeDiagnosticText(errorInfo.componentStack.trim())}
                </Text>
              </ScrollView>
            </View>
          ) : null}

          {error.stack ? (
            <View style={styles.stackSection}>
              <Text style={styles.sectionLabel}>JavaScript Stack</Text>
              <ScrollView horizontal style={styles.stackScrollView}>
                <Text selectable style={styles.codeText}>
                  {sanitizeDiagnosticText(error.stack.trim())}
                </Text>
              </ScrollView>
            </View>
          ) : null}

          <Pressable
            accessibilityLabel="Share diagnostic report"
            accessibilityRole="button"
            onPress={handleShare}
            style={{ marginTop: spacing.md, width: '100%' }}
          >
            <View style={styles.secondaryDiagnosticButton}>
              <Text style={styles.secondaryDiagnosticText}>
                {shareStatus === 'shared' ? 'REPORT SHARED / COPIED' : 'SHARE / COPY DIAGNOSTIC REPORT'}
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const monospaceFont = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

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
  codeText: {
    color: colors.silver,
    fontFamily: monospaceFont,
    fontSize: 11,
    lineHeight: 16,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  diagnosticBadge: {
    backgroundColor: '#7F1D1D',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  diagnosticBadgeText: {
    color: '#FCA5A5',
    fontFamily: typography.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  diagnosticCard: {
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.lg,
    width: '100%',
  },
  diagnosticHeader: {
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  diagnosticIncidentId: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  diagnosticMeta: {
    color: colors.silver,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: 2,
  },
  errorSection: {
    backgroundColor: colors.black,
    borderColor: '#991B1B',
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  errorTitle: {
    color: '#F87171',
    fontFamily: monospaceFont,
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.button,
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
  scrollContent: {
    padding: spacing.lg,
  },
  secondaryDiagnosticButton: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.button,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    width: '100%',
  },
  secondaryDiagnosticText: {
    color: colors.gold,
    fontFamily: typography.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  sectionLabel: {
    color: colors.silver,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  stackScrollView: {
    backgroundColor: colors.black,
    borderRadius: radii.sm,
    maxHeight: 160,
    padding: spacing.sm,
  },
  stackSection: {
    marginTop: spacing.md,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: 22,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
});
