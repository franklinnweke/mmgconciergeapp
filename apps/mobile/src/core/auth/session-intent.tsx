import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSegments } from 'expo-router';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { recordNavigation } from '../diagnostics/diagnostic-tracker';
import { useAuth } from './auth-context';
import {
  parseStoredSessionMode,
  sessionModeFromSegments,
  sessionModeStorageKey,
  type SessionMode,
} from './session-intent-domain';

export type { SessionMode } from './session-intent-domain';

type SessionIntentContextValue = {
  loading: boolean;
  mode: SessionMode | null;
  setMode(mode: SessionMode): Promise<void>;
};

const SessionIntentContext = createContext<SessionIntentContextValue | null>(null);

export function SessionIntentProvider({ children }: PropsWithChildren) {
  const { signingOut, user } = useAuth();
  const segments = useSegments();
  const uid = user && !signingOut ? user.uid : null;
  const [loadedUid, setLoadedUid] = useState<string | null>(null);
  const [storedMode, setStoredMode] = useState<SessionMode | null>(null);

  useEffect(() => {
    recordNavigation(segments.join('/') || '/', segments);
  }, [segments]);

  const loading = Boolean(uid && loadedUid !== uid);
  const routeMode = sessionModeFromSegments(segments);
  const mode = uid ? (routeMode ?? (loadedUid === uid ? storedMode : null)) : null;

  useEffect(() => {
    if (!uid) return undefined;

    let active = true;
    void AsyncStorage.getItem(sessionModeStorageKey(uid))
      .then((value) => {
        if (!active) return;
        setStoredMode(parseStoredSessionMode(value));
        setLoadedUid(uid);
      })
      .catch(() => {
        if (!active) return;
        setStoredMode(null);
        setLoadedUid(uid);
      });

    return () => {
      active = false;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid || loading || signingOut || !routeMode) return;
    void AsyncStorage.setItem(sessionModeStorageKey(uid), routeMode).catch(() => {
      // Navigation continues even if the preference cannot be persisted.
    });
  }, [loading, routeMode, signingOut, uid]);

  const value = useMemo<SessionIntentContextValue>(() => ({
    loading,
    mode,
    async setMode(nextMode) {
      setStoredMode(nextMode);
      if (!uid) return;
      try {
        await AsyncStorage.setItem(sessionModeStorageKey(uid), nextMode);
      } catch {
        // This preference is not an authorization source, so a local storage
        // failure should not prevent an explicit renter/owner navigation.
      }
    },
  }), [loading, mode, uid]);

  return <SessionIntentContext.Provider value={value}>{children}</SessionIntentContext.Provider>;
}

export function useSessionIntent(): SessionIntentContextValue {
  const value = useContext(SessionIntentContext);
  if (!value) throw new Error('useSessionIntent must be used inside SessionIntentProvider.');
  return value;
}
