/** Web preview deliberately uses fixture gateways and never initializes native App Check. */
export { getAppCheckProviderConfig } from './app-check-config';

export function initializeNativeAppCheck(_isDevelopment = true): Promise<void> {
  return Promise.resolve();
}
