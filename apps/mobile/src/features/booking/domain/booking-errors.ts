export function bookingCommandErrorMessage(error: unknown): string {
  const details = error && typeof error === 'object' && 'details' in error
    ? (error as { details?: Record<string, unknown> }).details
    : undefined;
  const code = details?.code ? String(details.code) : error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  const reason = details?.reason ? String(details.reason) : '';
  if (reason === 'dates_overlap' || code === 'VEHICLE_UNAVAILABLE') {
    return 'Those dates are no longer available. Choose different dates.';
  }
  if (code.includes('network') || code === 'unavailable') {
    return 'The booking service is unavailable. Check your connection and try again.';
  }
  if (code === 'INVALID_ARGUMENT') return 'Check your dates, phone number and Lagos area, then try again.';
  if (code === 'PROFILE_INCOMPLETE') {
    return 'Add your renter profile details before continuing. No payment was taken.';
  }
  return 'The request could not be sent. No dates were locked and no charge was attempted.';
}
