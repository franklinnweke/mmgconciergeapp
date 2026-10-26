/** Crashlytics has no web SDK. Never import native view/module bindings here. */
export async function createNativeCrashReporter(): Promise<{ record(error: Error): void } | null> { return null; }
