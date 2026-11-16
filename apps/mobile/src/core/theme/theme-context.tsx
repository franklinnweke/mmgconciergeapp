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
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';

export const THEME_STORAGE_KEY = 'mmg_theme_mode';

/**
 * Upper bound on how long the first frame may wait for the stored preference.
 * If storage stalls past this, the app reveals in dark (the unchanged default)
 * rather than holding the splash screen indefinitely.
 */
export const THEME_HYDRATION_TIMEOUT_MS = 1500;

export type ResolvedTheme = 'light' | 'dark';

export type ThemeContextValue = {
  colors: ThemeColors;
  isDark: boolean;
  /** True once the persisted preference has been read (or failed/timed out to dark). */
  isHydrated: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
  theme: ResolvedTheme;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export type ThemeProviderProps = PropsWithChildren<{
  initialMode?: ThemeMode;
}>;

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeProvider({
  children,
  initialMode,
}: ThemeProviderProps) {
  // Dark remains the unchanged default and the fallback when storage fails.
  const [mode, setModeState] = useState<ThemeMode>(() => initialMode ?? 'dark');
  const [isHydrated, setIsHydrated] = useState(() => Boolean(initialMode));
  const userChoseModeRef = useRef(false);
  const systemColorScheme = useColorScheme();

  // Restore the stored preference before the root layout reveals the first frame.
  useEffect(() => {
    if (initialMode) return undefined;
    let isMounted = true;
    const finish = () => {
      if (isMounted) setIsHydrated(true);
    };
    const timeout = setTimeout(finish, THEME_HYDRATION_TIMEOUT_MS);

    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        // A choice made during hydration wins over the older stored value.
        if (isMounted && !userChoseModeRef.current && isThemeMode(stored)) {
          setModeState(stored);
        }
      })
      .catch(() => {
        // Fall back to dark on storage error.
      })
      .finally(() => {
        clearTimeout(timeout);
        finish();
      });

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [initialMode]);

  const setMode = useCallback(async (newMode: ThemeMode) => {
    userChoseModeRef.current = true;
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
      isHydrated,
      mode,
      setMode,
      theme,
    }),
    [colors, isDark, isHydrated, mode, setMode, theme],
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
      isHydrated: true,
      mode: 'dark',
      setMode: async () => {},
      theme: 'dark',
    };
  }
  return context;
}
