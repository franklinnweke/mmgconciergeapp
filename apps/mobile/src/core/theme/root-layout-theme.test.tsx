import { darkThemeColors, lightThemeColors } from '@mmg/brand';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let scheme: 'light' | 'dark' | null = 'dark';
  let fontsReady = false;
  return {
    fontsReady: () => fontsReady,
    getItem: vi.fn<() => Promise<string | null>>(async () => null),
    getScheme: () => scheme,
    hideAsync: vi.fn(async () => {}),
    preventAutoHideAsync: vi.fn(async () => {}),
    setFontsReady: (next: boolean) => {
      fontsReady = next;
    },
    setItem: vi.fn(async () => {}),
    setScheme: (next: 'light' | 'dark' | null) => {
      scheme = next;
    },
  };
});

vi.mock('@expo-google-fonts/inter', () => ({
  Inter_400Regular: 'Inter_400Regular',
  Inter_500Medium: 'Inter_500Medium',
  Inter_600SemiBold: 'Inter_600SemiBold',
  useFonts: () => [mocks.fontsReady(), null],
}));

vi.mock('@expo-google-fonts/playfair-display', () => ({
  PlayfairDisplay_500Medium: 'PlayfairDisplay_500Medium',
  PlayfairDisplay_500Medium_Italic: 'PlayfairDisplay_500Medium_Italic',
  useFonts: () => [mocks.fontsReady(), null],
}));

vi.mock('expo-router', () => ({
  DarkTheme: { dark: true, colors: { primary: '', background: '', card: '', text: '', border: '', notification: '' } },
  DefaultTheme: { dark: false, colors: { primary: '', background: '', card: '', text: '', border: '', notification: '' } },
  Stack: 'Stack',
  ThemeProvider: ({ value, children }: { value: unknown; children: React.ReactNode }) =>
    React.createElement('NavigationThemeProvider', { value }, children),
}));

vi.mock('expo-splash-screen', () => ({
  hideAsync: () => mocks.hideAsync(),
  preventAutoHideAsync: () => mocks.preventAutoHideAsync(),
}));

vi.mock('expo-status-bar', () => ({
  StatusBar: 'StatusBar',
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  StyleSheet: { create: <T,>(s: T) => s },
  useColorScheme: () => mocks.getScheme(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: () => mocks.getItem(),
    setItem: () => mocks.setItem(),
  },
}));

vi.mock('../auth/auth-context', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../auth/session-intent', () => ({
  SessionIntentProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../firebase/app-check', () => ({
  initializeNativeAppCheck: async () => {},
}));

vi.mock('../diagnostics/crash-reporting', () => ({
  initializeCrashReporting: async () => {},
}));

vi.mock('../../components/error-boundary', () => ({
  AppErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ErrorBoundary: () => null,
}));

vi.mock('../../features/booking/booking-context', () => ({
  BookingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('react-native-reanimated', () => ({}));

import RootLayout from '../../app/_layout';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let tree: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setScheme('dark');
  mocks.setFontsReady(true);
});

afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
});

describe('RootLayout cold-launch theme hydration and splash gating', () => {
  it('keeps splash up until saved Light mode finishes loading, then paints Light on frame 1', async () => {
    let resolveStorage!: (value: string | null) => void;
    mocks.getItem.mockImplementationOnce(
      () => new Promise<string | null>((resolve) => {
        resolveStorage = resolve;
      }),
    );

    await act(async () => {
      tree = create(<RootLayout />);
    });

    // Fonts are ready, yet theme storage is still pending: splash must remain up
    // and no dark frame may be revealed.
    expect(mocks.hideAsync).not.toHaveBeenCalled();
    expect(tree!.toJSON()).toBeNull();

    await act(async () => {
      resolveStorage('light');
      await Promise.resolve();
    });

    expect(mocks.hideAsync).toHaveBeenCalledTimes(1);
    const nav = tree!.root.findByType('NavigationThemeProvider' as never);
    const stack = tree!.root.findByType('Stack' as never);
    const statusBar = tree!.root.findByType('StatusBar' as never);
    expect(nav.props.value.colors.background).toBe(lightThemeColors.canvas);
    expect(stack.props.screenOptions.contentStyle.backgroundColor).toBe(lightThemeColors.canvas);
    expect(statusBar.props.style).toBe('dark');
  });

  it('reveals System mode matching the device light scheme on the first painted frame', async () => {
    mocks.setScheme('light');
    mocks.getItem.mockResolvedValueOnce('system');

    await act(async () => {
      tree = create(<RootLayout />);
    });

    expect(mocks.hideAsync).toHaveBeenCalledTimes(1);
    const stack = tree!.root.findByType('Stack' as never);
    const statusBar = tree!.root.findByType('StatusBar' as never);
    expect(stack.props.screenOptions.contentStyle.backgroundColor).toBe(lightThemeColors.canvas);
    expect(statusBar.props.style).toBe('dark');
  });

  it('falls back to dark mode and still dismisses splash when storage fails', async () => {
    mocks.getItem.mockRejectedValueOnce(new Error('disk error'));

    await act(async () => {
      tree = create(<RootLayout />);
    });

    expect(mocks.hideAsync).toHaveBeenCalledTimes(1);
    const stack = tree!.root.findByType('Stack' as never);
    const statusBar = tree!.root.findByType('StatusBar' as never);
    expect(stack.props.screenOptions.contentStyle.backgroundColor).toBe(darkThemeColors.canvas);
    expect(statusBar.props.style).toBe('light');
  });
});
