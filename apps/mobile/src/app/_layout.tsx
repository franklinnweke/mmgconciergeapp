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
import { colors } from '@mmg/brand';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider } from '@/core/auth/auth-context';
import { SessionIntentProvider } from '@/core/auth/session-intent';
import { initializeNativeAppCheck } from '@/core/firebase/app-check';
import { AppErrorBoundary, ErrorBoundary } from '@/components/error-boundary';
import { BookingProvider } from '@/features/booking/booking-context';

import 'react-native-reanimated';

export { ErrorBoundary };

void SplashScreen.preventAutoHideAsync();
void initializeNativeAppCheck().catch(() => {
  // Callable requests will surface the platform error; do not silently
  // downgrade or bypass App Check when native initialization fails.
});

const mmgNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.black,
    border: colors.line,
    card: colors.graphite,
    notification: colors.goldStrong,
    primary: colors.gold,
    text: colors.ivory,
  },
};

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
    <ThemeProvider value={mmgNavigationTheme}>
      <AppErrorBoundary>
        <AuthProvider>
          <SessionIntentProvider>
            <BookingProvider>
              <StatusBar style="light" />
              <Stack screenOptions={{ contentStyle: { backgroundColor: colors.black }, headerShown: false }} />
            </BookingProvider>
          </SessionIntentProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </ThemeProvider>
  );
}
