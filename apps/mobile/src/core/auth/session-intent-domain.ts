export type SessionMode = 'renter' | 'owner';

export type SessionAuthIntent = SessionMode | 'sign-in' | null;

export function sessionModeStorageKey(uid: string): string {
  return `@mmg/session-mode/v1/${uid}`;
}

export function sessionModeFromSegments(segments: readonly string[]): SessionMode | null {
  if (segments[0] === '(owner)') return 'owner';
  if (segments[0] === '(renter)') return 'renter';
  return null;
}

export function parseStoredSessionMode(value: string | null): SessionMode | null {
  return value === 'owner' || value === 'renter' ? value : null;
}

export function resolveAuthenticatedSessionMode(
  authIntent: SessionAuthIntent,
  restoredMode: SessionMode | null,
): SessionMode {
  if (authIntent === 'owner' || authIntent === 'renter') return authIntent;
  return restoredMode ?? 'renter';
}
