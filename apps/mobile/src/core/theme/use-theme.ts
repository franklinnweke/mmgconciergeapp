import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import type { ThemeColors } from '@mmg/brand';
import { useTheme, type ThemeContextValue } from './theme-context';

export { useTheme, type ThemeContextValue };

export type ThemeStyleFactory<T> = (theme: {
  colors: ThemeColors;
  isDark: boolean;
  theme: 'light' | 'dark';
}) => T;

export function useThemeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<unknown>>(
  factory: ThemeStyleFactory<T>,
): T {
  const { colors, isDark, theme } = useTheme();
  return useMemo(() => factory({ colors, isDark, theme }), [colors, isDark, theme, factory]);
}
