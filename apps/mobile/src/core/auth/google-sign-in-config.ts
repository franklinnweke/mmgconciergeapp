export function readGoogleWebClientId(extra: unknown): string {
  if (!extra || typeof extra !== 'object' || !('googleWebClientId' in extra)) {
    throw new Error('Google Sign-In is not configured for this build.');
  }

  const clientId = (extra as { googleWebClientId?: unknown }).googleWebClientId;
  if (
    typeof clientId !== 'string'
    || !/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId)
  ) {
    throw new Error('Google Sign-In is not configured for this build.');
  }

  return clientId;
}
