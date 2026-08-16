import { getApp } from '@react-native-firebase/app';
import {
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';
import { getAppCheckProviderConfig } from './app-check-config';
export { getAppCheckProviderConfig } from './app-check-config';

let initialization: Promise<void> | null = null;

/**
 * Initialize before any callable is invoked. RNFirebase Functions attaches
 * the resulting App Check token automatically; backend enforcement remains
 * `enforceAppCheck: true`.
 */
export function initializeNativeAppCheck(isDevelopment = __DEV__): Promise<void> {
  if (initialization) return initialization;

  initialization = Promise.resolve().then(async () => {
    const provider = new ReactNativeFirebaseAppCheckProvider();
    provider.configure(getAppCheckProviderConfig(isDevelopment));
    await initializeAppCheck(getApp(), {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  });

  return initialization;
}
