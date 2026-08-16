export type AppCheckProviderConfig = {
  android: { provider: 'debug' | 'playIntegrity' };
  apple: { provider: 'debug' | 'appAttest' };
};

/** Provider selection is pure so release builds cannot accidentally use debug App Check. */
export function getAppCheckProviderConfig(isDevelopment: boolean): AppCheckProviderConfig {
  return {
    android: { provider: isDevelopment ? 'debug' : 'playIntegrity' },
    apple: { provider: isDevelopment ? 'debug' : 'appAttest' },
  };
}
