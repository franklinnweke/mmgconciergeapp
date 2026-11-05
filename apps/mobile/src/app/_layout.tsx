import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts as useInterFonts,
} from '@expo-google-fonts/inter';
import {
  PlayfairDisplay_500Medium,
  PlayfairDisplay_500Medium_Italic,
  useFonts as usePlayfairFonts,
} from '@expo-google-fonts/playfair-display';
import { darkThemeColors, lightThemeColors } from '@mmg/brand';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider } from '@/core/auth/auth-context';
import { SessionIntentProvider } from '@/core/auth/session-intent';
import { initializeNativeAppCheck } from '@/core/firebase/app-check';
import { initializeCrashReporting } from '@/core/diagnostics/crash-reporting';
import { AppErrorBoundary, ErrorBoundary } from '@/components/error-boundary';
import { BookingProvider } from '@/features/booking/booking-context';
import { ThemeProvider as AppThemeProvider, useTheme } from '../core/theme';

import 'react-native-reanimated';

export { ErrorBoundary };

void SplashScreen.preventAutoHideAsync();
void initializeCrashReporting();
void initializeNativeAppCheck().catch(() => {
  // Callable requests will surface the platform error; do not silently
  // downgrade or bypass App Check when native initialization fails.
});

const mmgDarkNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: darkThemeColors.canvas,
    border: darkThemeColors.border,
    card: darkThemeColors.surface,
    notification: darkThemeColors.primaryStrong,
    primary: darkThemeColors.primary,
    text: darkThemeColors.textPrimary,
  },
};

const mmgLightNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: lightThemeColors.canvas,
    border: lightThemeColors.border,
    card: lightThemeColors.surface,
    notification: lightThemeColors.primaryStrong,
    primary: lightThemeColors.primary,
    text: lightThemeColors.textPrimary,
  },
};

function RootLayoutContent() {
  const { colors, isDark } = useTheme();
  const navigationTheme = isDark ? mmgDarkNavigationTheme : mmgLightNavigationTheme;

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <AppErrorBoundary>
        <AuthProvider>
          <SessionIntentProvider>
            <BookingProvider>
              <StatusBar style={isDark ? 'light' : 'dark'} />
              <Stack screenOptions={{ contentStyle: { backgroundColor: colors.canvas }, headerShown: false }} />
            </BookingProvider>
          </SessionIntentProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [interLoaded, interError] = useInterFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const [playfairLoaded, playfairError] = usePlayfairFonts({
    PlayfairDisplay_500Medium,
    PlayfairDisplay_500Medium_Italic,
  });

  const fontsLoaded = interLoaded && playfairLoaded;

  useEffect(() => {
    if (fontsLoaded || interError || playfairError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, interError, playfairError]);

  if (!fontsLoaded && !interError && !playfairError) {
    return null;
  }

  return (
    <AppThemeProvider>
      <RootLayoutContent />
    </AppThemeProvider>
  );
}
