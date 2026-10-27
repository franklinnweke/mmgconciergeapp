import { safeCrashError, type MobileFailureSource } from './crash-reporting-policy';

let reporter: { record(error: Error): void } | null = null;
let initialization: Promise<void> | null = null;
const reportedSources = new Set<MobileFailureSource>();
type GlobalHandler = (error: Error, isFatal?: boolean) => void;
type ErrorUtilities = { getGlobalHandler(): GlobalHandler; setGlobalHandler(handler: GlobalHandler): void };

export function reportUnexpectedMobileError(error: unknown, source: MobileFailureSource): void {
  if (!reporter || reportedSources.has(source)) return;
  try {
    reporter.record(safeCrashError(error, source));
    reportedSources.add(source);
  } catch { /* Diagnostics must not break the product. */ }
}

export function initializeCrashReporting(): Promise<void> {
  if (initialization) return initialization;
  initialization = import('./native-crashlytics').then(async ({ createNativeCrashReporter }) => {
    reporter = await createNativeCrashReporter();
    if (!reporter) return;
    const utilities = (globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilities }).ErrorUtils;
    if (!utilities) return;
    const previous = utilities.getGlobalHandler();
    if (typeof previous !== 'function') return;
    utilities.setGlobalHandler((error, isFatal) => {
      const safe = safeCrashError(error, 'javascript');
      reportUnexpectedMobileError(safe, 'javascript');
      // Preserve React Native's normal fatal/nonfatal handling, but don't pass
      // the original sensitive exception into the native crash machinery.
      previous(safe, isFatal);
    });
  }).catch(() => { reporter = null; });
  return initialization;
}
