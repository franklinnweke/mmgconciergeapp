export type SessionMode = 'renter' | 'owner';

export function sessionModeStorageKey(uid: string): string {
  return `@mmg/session-mode/v1/${uid}`;
}

export function parseStoredSessionMode(value: string | null): SessionMode | null {
  return value === 'owner' || value === 'renter' ? value : null;
}
