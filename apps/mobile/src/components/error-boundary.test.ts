import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as diagnosticTracker from '../core/diagnostics/diagnostic-tracker';
import { AppErrorBoundary, ErrorBoundary } from './error-boundary';

const mockShare = vi.fn().mockResolvedValue({ action: 'sharedAction' });

(globalThis as typeof globalThis & { __DEV__?: boolean; IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as typeof globalThis & { __DEV__?: boolean; IS_REACT_ACT_ENVIRONMENT?: boolean }).__DEV__ = true;

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        firebaseEnvironment: 'development',
      },
      ios: {
        buildNumber: '37',
      },
      version: '1.0.0',
    },
  },
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  SafeAreaView: 'SafeAreaView',
  ScrollView: 'ScrollView',
  Share: {
    share: (...args: unknown[]) => mockShare(...args),
  },
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
}));

beforeEach(() => {
  mockShare.mockClear();
  diagnosticTracker.clearDiagnosticState();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('updates state from error in getDerivedStateFromError', () => {
    const error = new Error('Test render explosion');
    const nextState = AppErrorBoundary.getDerivedStateFromError(error);
    expect(nextState).toEqual({ hasError: true, error });
  });

  it('renders a custom fallback for a throwing child and recovers after retry', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let shouldThrow = true;
    let renderer: ReactTestRenderer;

    function RecoverableChild() {
      if (shouldThrow) throw new Error('Expected render failure');
      return React.createElement(RecoveredChild);
    }

    function RecoveredChild() {
      return React.createElement('RecoveredChild');
    }

    function RetryButton({ onPress }: { onPress: () => void }) {
      return React.createElement('RetryButton', { onPress });
    }

    function Fallback({ retry }: { retry: () => void }) {
      return React.createElement(RetryButton, {
        onPress: () => {
          shouldThrow = false;
          retry();
        },
      });
    }

    act(() => {
      renderer = create(
        React.createElement(
          AppErrorBoundary,
          {
            fallback: (_error, retry) => React.createElement(Fallback, { retry }),
          },
          React.createElement(RecoverableChild),
        ),
      );
    });

    expect(renderer!.root.findAllByType(RetryButton)).toHaveLength(1);

    act(() => {
      renderer!.root.findByType(RetryButton).props.onPress();
    });

    expect(renderer!.root.findAllByType(RecoveredChild)).toHaveLength(1);
    expect(consoleError).toHaveBeenCalled();
  });

  it('renders production recovery screen without diagnostic card when diagnostic mode is disabled', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(diagnosticTracker, 'isDiagnosticModeEnabled').mockReturnValue(false);

    let renderer: ReactTestRenderer;
    function ThrowingChild(): React.ReactNode {
      throw new Error('Explosion');
    }

    act(() => {
      renderer = create(
        React.createElement(AppErrorBoundary, null, React.createElement(ThrowingChild)),
      );
    });

    const texts = renderer!.root.findAll((node) => (node.type as unknown) === 'Text').map((t) => t.props.children);
    const joinedText = JSON.stringify(texts);
    expect(joinedText).toContain("We couldn't display this screen.");
    expect(joinedText).not.toContain('DIAGNOSTIC BUILD');
    expect(joinedText).not.toContain('Incident ID');
  });

  it('renders diagnostic card with incident details in development mode', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(diagnosticTracker, 'isDiagnosticModeEnabled').mockReturnValue(true);
    diagnosticTracker.recordNavigation('/(owner)', ['(owner)', 'index']);
    diagnosticTracker.recordAuthPhase('signing_out');

    let renderer: ReactTestRenderer;
    function ThrowingChild(): React.ReactNode {
      throw new Error('Test crash in OwnerDesk');
    }

    act(() => {
      renderer = create(
        React.createElement(AppErrorBoundary, null, React.createElement(ThrowingChild)),
      );
    });

    const texts = renderer!.root.findAll((node) => (node.type as unknown) === 'Text').map((t) => t.props.children);
    const joinedText = JSON.stringify(texts);
    expect(joinedText).toContain('DIAGNOSTIC BUILD · DEV ONLY');
    expect(joinedText).toContain('Test crash in OwnerDesk');
    expect(joinedText).toContain('/(owner)');
  });

  it('renders the Expo Router route-level error boundary with diagnostic details when enabled', () => {
    vi.spyOn(diagnosticTracker, 'isDiagnosticModeEnabled').mockReturnValue(true);
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        React.createElement(ErrorBoundary, {
          error: new Error('Route crash'),
          retry: () => undefined,
        }),
      );
    });

    const texts = renderer!.root.findAll((node) => (node.type as unknown) === 'Text').map((t) => t.props.children);
    const joinedText = JSON.stringify(texts);
    expect(joinedText).toContain('DIAGNOSTIC BUILD · DEV ONLY');
    expect(joinedText).toContain('Route crash');
  });

  it('logs only the sanitized diagnostic report string to console.error without raw Error or component stack objects', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(diagnosticTracker, 'isDiagnosticModeEnabled').mockReturnValue(true);

    function ThrowingChild(): React.ReactNode {
      throw new Error(
        'Fatal error for user test.owner@example.com at users/usr_1234567890 with uid=user_999888',
      );
    }

    act(() => {
      create(
        React.createElement(AppErrorBoundary, null, React.createElement(ThrowingChild)),
      );
    });

    const boundaryCall = consoleError.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('[AppErrorBoundary] Unhandled render error'),
    );
    expect(boundaryCall).toBeDefined();

    // Exactly one string argument logged to console.error by AppErrorBoundary (no raw objects passed)
    expect(boundaryCall).toHaveLength(1);
    const loggedMessage = boundaryCall![0] as string;
    expect(typeof loggedMessage).toBe('string');

    // Header and report formatting present
    expect(loggedMessage).toContain('[AppErrorBoundary] Unhandled render error');
    expect(loggedMessage).toContain('=== MMG CONCIERGE DIAGNOSTIC REPORT ===');

    // Sensitive values are properly sanitized in the logged string
    expect(loggedMessage).toContain('[REDACTED_EMAIL]');
    expect(loggedMessage).toContain('users/[REDACTED_ID]');
    expect(loggedMessage).toContain('uid=[REDACTED_ID]');
    expect(loggedMessage).not.toContain('test.owner@example.com');
    expect(loggedMessage).not.toContain('usr_1234567890');
    expect(loggedMessage).not.toContain('user_999888');
  });
});
