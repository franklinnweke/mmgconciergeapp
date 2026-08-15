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
  renterTripRemoteEnabled,
  subscribeToTrustedRenterTrips,
} from './data/firestore-renter-trip-repository';
import {
  loadLocalBookingRequests,
  saveLocalBookingRequests,
} from './data/local-booking-request-store';
import {
  createUnsubscribeBundle,
  resolveVisibleRenterTrips,
  scopeTripsToActiveUser,
} from './data/renter-trip-repository';
import { mapLegacyBookingRequest, type RenterTrip } from './domain/renter-trip';

type BookingSyncState = 'local-only' | 'syncing' | 'synced' | 'offline';

type BookingContextValue = {
  initializing: boolean;
  requests: readonly BookingRequest[];
  requestAvailability(input: CreateBookingRequestInput): Promise<BookingRequest>;
  syncError: string | null;
  syncState: BookingSyncState;
  trips: readonly RenterTrip[];
};

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [storedRequests, setStoredRequests] = useState<BookingRequest[]>([]);
  const [trustedTrips, setTrustedTrips] = useState<RenterTrip[]>([]);
  const [trustedTripsUserId, setTrustedTripsUserId] = useState<string | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<BookingSyncState>(
    bookingRemoteEnabled || renterTripRemoteEnabled ? 'syncing' : 'local-only',
  );

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (!active) return;
      setStoredRequests([]);
      setTrustedTrips([]);
      setTrustedTripsUserId(null);
      setLoadedUserId(null);
      setSyncError(null);
      if (!user) {
        setSyncState(bookingRemoteEnabled || renterTripRemoteEnabled ? 'syncing' : 'local-only');
      }
    });

    if (!user) {
      return () => { active = false; };
    }

    const stops: (() => void)[] = [];
    void loadLocalBookingRequests(user.uid).then((cachedRequests) => {
      if (!active) return;
      setStoredRequests(cachedRequests);
      setLoadedUserId(user.uid);

      if (bookingRemoteEnabled) {
        setSyncState('syncing');
        stops.push(subscribeToRemoteBookingRequests(
          user.uid,
          (remoteRequests) => {
            if (!active) return;
            setStoredRequests((currentRequests) => {
              const requestMap = new Map(currentRequests.map((request) => [request.id, request]));
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
        ));
      }

      if (renterTripRemoteEnabled) {
        setSyncState('syncing');
        stops.push(subscribeToTrustedRenterTrips(
          user.uid,
          (snapshot) => {
            if (!active) return;
            setTrustedTrips([...snapshot.trips]);
            setTrustedTripsUserId(user.uid);
            setSyncError(
              snapshot.skippedInvalidCount
                ? 'Some trip records could not be shown because they were incomplete.'
                : null,
            );
            setSyncState('synced');
          },
          () => {
            if (active) {
              setSyncState('offline');
              setSyncError('Live trip updates are unavailable. Showing any cached journeys.');
            }
          },
        ));
      }
    });

    return () => {
      active = false;
      createUnsubscribeBundle(...stops)();
    };
  }, [user]);

  const requests = useMemo(
    () => (user && loadedUserId === user.uid ? storedRequests : []),
    [loadedUserId, storedRequests, user],
  );
  const initializing = Boolean(user && loadedUserId !== user.uid);
  const trips = useMemo(
    () => resolveVisibleRenterTrips({
      authoritative: scopeTripsToActiveUser(user?.uid, trustedTripsUserId, trustedTrips),
      legacy: requests.map(mapLegacyBookingRequest),
      preview: [],
      allowPreview: false,
    }),
    [requests, trustedTrips, trustedTripsUserId, user],
  );

  const value = useMemo<BookingContextValue>(
    () => ({
      initializing,
      requests,
      syncError,
      syncState,
      trips,
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
    [initializing, requests, syncError, syncState, trips, user],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBookings() {
  const value = useContext(BookingContext);
  if (!value) throw new Error('useBookings must be used inside BookingProvider.');
  return value;
}
