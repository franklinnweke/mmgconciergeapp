export type MobileFailureSource = 'render' | 'javascript' | 'request_refresh' | 'payment_reconcile' | 'payment_initialize' | 'smoke';

export function developmentCrashReportingAllowed(environment: unknown, enabled: unknown, projectId: unknown): boolean {
  return environment === 'development' && enabled === true && projectId === 'mmg-concierge-dev';
}

/** Never transmit arbitrary exception messages, URLs, paths or command data. */
export function safeCrashError(error: unknown, source: MobileFailureSource): Error {
  const safe = new Error(`MMG ${source} failure`);
  safe.name = `MMG_${source}`;
  let stack: string | undefined;
  try { if (error instanceof Error && typeof error.stack === 'string') stack = error.stack; } catch { /* Untrusted exceptions can have throwing getters. */ }
  const frames = stack?.split('\n').slice(1, 25).flatMap((line) => {
    // Keep only line/column positions. Symbol/location text can contain URLs,
    // user paths, request data or signed tokens; none crosses this boundary.
    const position = line.match(/:(\d+):(\d+)\)?\s*$/);
    return position ? [`    at mobile (main.jsbundle:${position[1]}:${position[2]})`] : [];
  }) ?? [];
  safe.stack = `${safe.name}: ${safe.message}${frames.length ? `\n${frames.join('\n')}` : ''}`;
  return safe;
}
