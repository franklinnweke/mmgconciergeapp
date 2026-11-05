import { darkThemeColors, lightThemeColors } from '@mmg/brand';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  THEME_STORAGE_KEY,
  ThemeProvider,
  useTheme,
} from './theme-context';
import { useThemeStyles } from './use-theme';

const mocks = vi.hoisted(() => {
  let scheme: 'light' | 'dark' | null = 'dark';
  const store = new Map<string, string>();
  return {
    clear: () => store.clear(),
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    getScheme: () => scheme,
    setItem: vi.fn(async (key: string, val: string) => {
      store.set(key, val);
    }),
    setScheme: (val: 'light' | 'dark' | null) => {
      scheme = val;
    },
  };
});

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
  useColorScheme: () => mocks.getScheme(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => mocks.getItem(key),
    setItem: (key: string, val: string) => mocks.setItem(key, val),
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ThemeProvider and useTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setScheme('dark');
    mocks.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to dark mode with darkThemeColors when no preference is saved', async () => {
    let captured: ReturnType<typeof useTheme> | null = null;

    function TestComponent() {
      captured = useTheme();
      return React.createElement('View', null);
    }

    await act(async () => {
      create(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>,
      );
    });

    expect(captured).not.toBeNull();
    expect(captured!.mode).toBe('dark');
    expect(captured!.theme).toBe('dark');
    expect(captured!.isDark).toBe(true);
    expect(captured!.colors).toEqual(darkThemeColors);
  });

  it('respects initialMode="light" and provides lightThemeColors', async () => {
    let captured: ReturnType<typeof useTheme> | null = null;

    function TestComponent() {
      captured = useTheme();
      return React.createElement('View', null);
    }

    await act(async () => {
      create(
        <ThemeProvider initialMode="light">
          <TestComponent />
        </ThemeProvider>,
      );
    });

    expect(captured).not.toBeNull();
    expect(captured!.mode).toBe('light');
    expect(captured!.theme).toBe('light');
    expect(captured!.isDark).toBe(false);
    expect(captured!.colors).toEqual(lightThemeColors);
  });

  it('resolves system mode based on system color scheme', async () => {
    mocks.setScheme('light');
    let captured: ReturnType<typeof useTheme> | null = null;

    function TestComponent() {
      captured = useTheme();
      return React.createElement('View', null);
    }

    await act(async () => {
      create(
        <ThemeProvider initialMode="system">
          <TestComponent />
        </ThemeProvider>,
      );
    });

    expect(captured).not.toBeNull();
    expect(captured!.mode).toBe('system');
    expect(captured!.theme).toBe('light');
    expect(captured!.isDark).toBe(false);
    expect(captured!.colors).toEqual(lightThemeColors);
  });

  it('persists mode changes to AsyncStorage when setMode is called', async () => {
    let captured: ReturnType<typeof useTheme> | null = null;

    function TestComponent() {
      captured = useTheme();
      return React.createElement('View', null);
    }

    await act(async () => {
      create(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>,
      );
    });

    expect(captured!.theme).toBe('dark');

    await act(async () => {
      await captured!.setMode('light');
    });

    expect(captured!.mode).toBe('light');
    expect(captured!.theme).toBe('light');
    expect(captured!.isDark).toBe(false);
    expect(captured!.colors).toEqual(lightThemeColors);
    expect(mocks.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light');
  });

  it('provides safe fallback when useTheme is called outside ThemeProvider', async () => {
    let captured: ReturnType<typeof useTheme> | null = null;

    function TestComponent() {
      captured = useTheme();
      return React.createElement('View', null);
    }

    await act(async () => {
      create(<TestComponent />);
    });

    expect(captured).not.toBeNull();
    expect(captured!.theme).toBe('dark');
    expect(captured!.isDark).toBe(true);
    expect(captured!.colors).toEqual(darkThemeColors);
  });

  it('useThemeStyles creates styles derived from the active theme', async () => {
    let capturedStyles: { background: string; text: string } | null = null;
    let themeValue: ReturnType<typeof useTheme> | null = null;

    function TestComponent() {
      themeValue = useTheme();
      capturedStyles = useThemeStyles(({ colors }) => ({
        background: colors.canvas,
        text: colors.textPrimary,
      }));
      return React.createElement('View', null);
    }

    await act(async () => {
      create(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>,
      );
    });

    expect(capturedStyles).toEqual({
      background: darkThemeColors.canvas,
      text: darkThemeColors.textPrimary,
    });

    await act(async () => {
      await themeValue!.setMode('light');
    });

    expect(capturedStyles).toEqual({
      background: lightThemeColors.canvas,
      text: lightThemeColors.textPrimary,
    });
  });
});
