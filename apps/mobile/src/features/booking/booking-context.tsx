import type { BookingRequest, CreateBookingRequestInput } from '@mmg/contracts';
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';

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
import { createRentalRequestGateway } from './data/rental-request-gateway';
import { mapRenterVisibleRentalRequest } from './domain/renter-rental-request';
import { mapLegacyBookingRequest, type RenterTrip } from './domain/renter-trip';

type BookingSyncState = 'local-only' | 'syncing' | 'synced' | 'offline';

type BookingContextValue = {
  initializing: boolean;
  requests: readonly BookingRequest[];
  requestAvailability(input: CreateBookingRequestInput): Promise<BookingRequest>;
  refreshRentalRequests(): Promise<void>;
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
  const [rentalRequestTrips, setRentalRequestTrips] = useState<RenterTrip[]>([]);
  const [rentalRequestUserId, setRentalRequestUserId] = useState<string | null>(null);
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
      setRentalRequestTrips([]);
      setRentalRequestUserId(null);
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

  useEffect(() => {
    if (!user) return undefined;
    const gateway = createRentalRequestGateway();
    let active = true;

    const load = async () => {
      try {
        const listed = await gateway.listRenterRequests();
        if (!active) return;
        setRentalRequestTrips(listed.requests.map(mapRenterVisibleRentalRequest));
        setRentalRequestUserId(user.uid);
      } catch {
        if (active) {
          setSyncError((current) => current ?? 'Rental requests could not be refreshed.');
        }
      }
    };

    void load();
    const interval = setInterval(() => {
      void load();
    }, 15_000);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void load();
    });

    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
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
      requests: scopeTripsToActiveUser(user?.uid, rentalRequestUserId, rentalRequestTrips),
    }),
    [rentalRequestTrips, rentalRequestUserId, requests, trustedTrips, trustedTripsUserId, user],
  );

  const value = useMemo<BookingContextValue>(
    () => ({
      initializing,
      requests,
      syncError,
      syncState,
      trips,
      async refreshRentalRequests() {
        if (!user) return;
        const listed = await createRentalRequestGateway().listRenterRequests();
        setRentalRequestTrips(listed.requests.map(mapRenterVisibleRentalRequest));
        setRentalRequestUserId(user.uid);
      },
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
            .catch(() => {
              // The write failed permanently (e.g. rules rejected it). Say so:
              // "offline" alone lets the live read listener flip the pill back
              // to LIVE UPDATES while the request never reached the server.
              setSyncState('offline');
              setSyncError(
                'This availability request could not be delivered to MMG. It is saved on this device only — no request was created.',
              );
            });
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
