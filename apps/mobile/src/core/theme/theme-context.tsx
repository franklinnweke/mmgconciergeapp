import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  darkThemeColors,
  lightThemeColors,
  type ThemeColors,
  type ThemeMode,
} from '@mmg/brand';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';

export const THEME_STORAGE_KEY = 'mmg_theme_mode';

export type ResolvedTheme = 'light' | 'dark';

export type ThemeContextValue = {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
  theme: ResolvedTheme;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export type ThemeProviderProps = PropsWithChildren<{
  initialMode?: ThemeMode;
}>;

export function ThemeProvider({
  children,
  initialMode,
}: ThemeProviderProps) {
  // Dark remains the unchanged default to avoid startup flash and visual disruption.
  const [mode, setModeState] = useState<ThemeMode>(() => initialMode ?? 'dark');
  const systemColorScheme = useColorScheme();

  // Restore stored preference asynchronously if available.
  useEffect(() => {
    let isMounted = true;
    if (initialMode) return;

    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (!isMounted || !stored) return;
        if (stored === 'system' || stored === 'light' || stored === 'dark') {
          setModeState(stored);
        }
      })
      .catch(() => {
        // Fall back gracefully to dark mode on storage error.
      });

    return () => {
      isMounted = false;
    };
  }, [initialMode]);

  const setMode = useCallback(async (newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
    } catch {
      // Non-fatal if storage fails.
    }
  }, []);

  const theme: ResolvedTheme = useMemo(() => {
    if (mode === 'system') {
      return systemColorScheme === 'light' ? 'light' : 'dark';
    }
    return mode;
  }, [mode, systemColorScheme]);

  const isDark = theme === 'dark';
  const colors = isDark ? darkThemeColors : lightThemeColors;

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors,
      isDark,
      mode,
      setMode,
      theme,
    }),
    [colors, isDark, mode, setMode, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    // Graceful fallback for components rendered outside the provider (e.g. isolated tests)
    return {
      colors: darkThemeColors,
      isDark: true,
      mode: 'dark',
      setMode: async () => {},
      theme: 'dark',
    };
  }
  return context;
}
