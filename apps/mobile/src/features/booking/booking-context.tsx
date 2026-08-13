import type { BookingRequest, CreateBookingRequestInput } from '@mmg/contracts';
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useAuth } from '@/core/auth/auth-context';

import {
  bookingRemoteEnabled,
  createRemoteBookingRequest,
  subscribeToRemoteBookingRequests,
} from './data/firestore-booking-request-store';
import {
  loadLocalBookingRequests,
  saveLocalBookingRequests,
} from './data/local-booking-request-store';

type BookingSyncState = 'local-only' | 'syncing' | 'synced' | 'offline';

type BookingContextValue = {
  initializing: boolean;
  requests: readonly BookingRequest[];
  requestAvailability(input: CreateBookingRequestInput): Promise<BookingRequest>;
  syncState: BookingSyncState;
};

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [storedRequests, setStoredRequests] = useState<BookingRequest[]>([]);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<BookingSyncState>(
    bookingRemoteEnabled ? 'syncing' : 'local-only',
  );

  useEffect(() => {
    let active = true;

    if (!user) return;

    let unsubscribe = () => {};
    void loadLocalBookingRequests(user.uid).then((cachedRequests) => {
      if (!active) return;
      setStoredRequests(cachedRequests);
      setLoadedUserId(user.uid);

      if (!bookingRemoteEnabled) return;
      setSyncState('syncing');
      unsubscribe = subscribeToRemoteBookingRequests(
        user.uid,
        (remoteRequests) => {
          if (!active) return;
          setStoredRequests((currentRequests) => {
            const requestMap = new Map(
              currentRequests.map((request) => [request.id, request]),
            );
            remoteRequests.forEach((request) => requestMap.set(request.id, request));
            const mergedRequests = [...requestMap.values()].sort((left, right) =>
              right.createdAt.localeCompare(left.createdAt),
            );
            void saveLocalBookingRequests(user.uid, mergedRequests);
            return mergedRequests;
          });
          setSyncState('synced');
        },
        () => {
          if (active) setSyncState('offline');
        },
      );
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [user]);

  const requests = useMemo(
    () => user && loadedUserId === user.uid ? storedRequests : [],
    [loadedUserId, storedRequests, user],
  );
  const initializing = Boolean(user && loadedUserId !== user.uid);

  const value = useMemo<BookingContextValue>(
    () => ({
      initializing,
      requests,
      syncState,
      async requestAvailability(input) {
        if (!user) throw new Error('Sign in before requesting vehicle availability.');

        const now = new Date().toISOString();
        const request: BookingRequest = {
          ...input,
          createdAt: now,
          id: `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          status: 'availability_requested',
          updatedAt: now,
          userId: user.uid,
        };
        const nextRequests = [request, ...requests];
        await saveLocalBookingRequests(user.uid, nextRequests);
        setStoredRequests(nextRequests);
        setLoadedUserId(user.uid);

        if (bookingRemoteEnabled) {
          setSyncState('syncing');
          void createRemoteBookingRequest(request)
            .then(() => setSyncState('synced'))
            .catch(() => setSyncState('offline'));
        }
        return request;
      },
    }),
    [initializing, requests, syncState, user],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBookings() {
  const value = useContext(BookingContext);
  if (!value) throw new Error('useBookings must be used inside BookingProvider.');
  return value;
}
