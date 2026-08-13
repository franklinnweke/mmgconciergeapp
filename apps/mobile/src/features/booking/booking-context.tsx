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
  loadLocalBookingRequests,
  saveLocalBookingRequests,
} from './data/local-booking-request-store';

type BookingContextValue = {
  initializing: boolean;
  requests: readonly BookingRequest[];
  requestAvailability(input: CreateBookingRequestInput): Promise<BookingRequest>;
};

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [storedRequests, setStoredRequests] = useState<BookingRequest[]>([]);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!user) return;

    void loadLocalBookingRequests(user.uid).then((storedRequests) => {
      if (!active) return;
      setStoredRequests(storedRequests);
      setLoadedUserId(user.uid);
    });

    return () => {
      active = false;
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
      async requestAvailability(input) {
        if (!user) throw new Error('Sign in before requesting vehicle availability.');

        const request: BookingRequest = {
          ...input,
          createdAt: new Date().toISOString(),
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          status: 'availability_requested',
          userId: user.uid,
        };
        const nextRequests = [request, ...requests];
        await saveLocalBookingRequests(user.uid, nextRequests);
        setStoredRequests(nextRequests);
        setLoadedUserId(user.uid);
        return request;
      },
    }),
    [initializing, requests, user],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBookings() {
  const value = useContext(BookingContext);
  if (!value) throw new Error('useBookings must be used inside BookingProvider.');
  return value;
}
