import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSegments } from 'expo-router';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

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
  const uid = user?.uid ?? null;
  const [loadedUid, setLoadedUid] = useState<string | null>(null);
  const [mode, setModeState] = useState<SessionMode | null>(null);
  const loading = Boolean(uid && loadedUid !== uid);

  useEffect(() => {
    let active = true;

    if (!uid) {
      queueMicrotask(() => {
        if (!active) return;
        setLoadedUid(null);
        setModeState(null);
      });
      return () => {
        active = false;
      };
    }

    void AsyncStorage.getItem(sessionModeStorageKey(uid))
      .then((value) => {
        if (!active) return;
        setModeState(parseStoredSessionMode(value));
        setLoadedUid(uid);
      })
      .catch(() => {
        if (!active) return;
        // Session mode is only a navigation preference. Storage failure must
        // never block authentication or fabricate owner authorization.
        setModeState(null);
        setLoadedUid(uid);
      });

    return () => {
      active = false;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid || loading || signingOut) return undefined;
    const routeMode = sessionModeFromSegments(segments);
    if (!routeMode || routeMode === mode) return undefined;

    let active = true;
    queueMicrotask(() => {
      if (active) setModeState(routeMode);
    });
    void AsyncStorage.setItem(sessionModeStorageKey(uid), routeMode).catch(() => {
      // Navigation continues even if the preference cannot be persisted.
    });

    return () => {
      active = false;
    };
  }, [loading, mode, segments, signingOut, uid]);

  const value = useMemo<SessionIntentContextValue>(() => ({
    loading,
    mode,
    async setMode(nextMode) {
      setModeState(nextMode);
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
