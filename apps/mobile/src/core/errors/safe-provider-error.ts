type ProviderErrorShape = {
  code?: unknown;
  details?: { code?: unknown; reason?: unknown };
};

/** Maps provider failures to renter-safe copy; arbitrary exception text never crosses the UI boundary. */
export function safeProviderError(error: unknown, fallback: string): string {
  const value = (error && typeof error === 'object' ? error : {}) as ProviderErrorShape;
  const rawCode = String(value.code ?? value.details?.code ?? '');
  const code = rawCode.split('/').pop()?.toLowerCase() ?? '';
  const reason = String(value.details?.reason ?? '');

  if (code === 'network-request-failed' || code === 'unavailable') return 'The service is unavailable. Check your connection and try again.';
  if (code === 'permission-denied' || code === 'forbidden') return 'You do not have access to this information.';
  if (code === 'not-found' || code === 'not_found') return 'This information is no longer available.';
  if (reason === 'dates_overlap' || code === 'vehicle_unavailable') return 'This vehicle is not available for the selected dates.';
  if (code === 'failed-precondition' || code === 'failed_precondition') return 'This request is no longer current. Refresh and try again.';
  if (code === 'invalid-argument' || code === 'invalid_argument') return 'Check the request details and try again.';
  return fallback;
}
