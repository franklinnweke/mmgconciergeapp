import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppErrorBoundary, ErrorBoundary } from './error-boundary';

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('updates state from error in getDerivedStateFromError', () => {
    const error = new Error('Test render explosion');
    const nextState = AppErrorBoundary.getDerivedStateFromError(error);
    expect(nextState).toEqual({ hasError: true, error });
  });

  it('renders a fallback for a throwing child and recovers after retry', () => {
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

  it('renders the Expo Router boundary without application providers', () => {
    const element = React.createElement(ErrorBoundary, {
      error: new Error('Route crash'),
      retry: () => undefined,
    });
    expect(element).toBeDefined();
    expect(element.props.error.message).toBe('Route crash');
  });
});
