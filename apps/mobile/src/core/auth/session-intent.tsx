import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSegments } from 'expo-router';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { recordNavigation } from '../diagnostics/diagnostic-tracker';
import { useAuth } from './auth-context';
import {
  parseStoredSessionMode,
  sessionModeStorageKey,
  type SessionMode,
} from './session-intent-domain';

export type { SessionMode } from './session-intent-domain';

type SessionIntentContextValue = {
  loading: boolean;
  mode: SessionMode | null;
  prepareSignIn(mode: SessionMode): void;
};

const SessionIntentContext = createContext<SessionIntentContextValue | null>(null);

export function SessionIntentProvider({ children }: PropsWithChildren) {
  const { initializing, signingOut, user } = useAuth();
  const segments = useSegments();
  const uid = user?.uid ?? null;
  const pendingMode = useRef<SessionMode | null>(null);
  const [session, setSession] = useState<{ uid: string; mode: SessionMode } | null>(null);

  useEffect(() => {
    recordNavigation(segments.join('/') || '/', segments);
  }, [segments]);

  const loading = Boolean(uid && session?.uid !== uid);
  const mode = uid && !signingOut && session?.uid === uid ? session.mode : null;

  useEffect(() => {
    let active = true;
    const chosen = pendingMode.current;
    const restore = async () => {
      if (!uid) {
        await Promise.resolve();
        if (active) setSession(null);
        return;
      }
      const key = sessionModeStorageKey(uid);
      const saved = chosen ? null : await AsyncStorage.getItem(key).catch(() => null);
      // Defer committing the choice so an abandoned effect cannot consume it.
      await Promise.resolve();
      if (!active) return;
      pendingMode.current = null;
      setSession({ uid, mode: chosen ?? parseStoredSessionMode(saved) ?? 'renter' });
      if (chosen) void AsyncStorage.setItem(key, chosen).catch(() => {});
    };
    void restore();

    return () => {
      active = false;
    };
  }, [uid]);

  const value = useMemo<SessionIntentContextValue>(() => ({
    loading,
    mode,
    prepareSignIn(nextMode) {
      // Only signed-out login can select the next session's view.
      if (!uid && !initializing && !signingOut) pendingMode.current = nextMode;
    },
  }), [initializing, loading, mode, signingOut, uid]);

  return <SessionIntentContext.Provider value={value}>{children}</SessionIntentContext.Provider>;
}

export function useSessionIntent(): SessionIntentContextValue {
  const value = useContext(SessionIntentContext);
  if (!value) throw new Error('useSessionIntent must be used inside SessionIntentProvider.');
  return value;
}
