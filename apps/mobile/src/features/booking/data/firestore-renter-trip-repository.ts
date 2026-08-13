import {
  collection,
  getFirestore,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from '@react-native-firebase/firestore';

import {
  createUnsubscribeBundle,
  decodeTrustedTripDocuments,
  renterTripReadQuery,
  type RenterTripRepository,
  type RenterTripSnapshot,
} from './renter-trip-repository';

export const renterTripRemoteEnabled = true;

function snapshotDocuments(snapshot: { docs: QueryDocumentSnapshot<DocumentData, DocumentData>[] }) {
  return snapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
}

export function subscribeToTrustedRenterTrips(
  renterId: string,
  onSnapshotResult: (snapshot: RenterTripSnapshot) => void,
  onError: (error: Error) => void,
) {
  const database = getFirestore();
  const intentsQuery = query(
    collection(database, renterTripReadQuery.collections[0]),
    where(renterTripReadQuery.equalityFilter.field, renterTripReadQuery.equalityFilter.operator, renterId),
  );
  const bookingsQuery = query(
    collection(database, renterTripReadQuery.collections[1]),
    where(renterTripReadQuery.equalityFilter.field, renterTripReadQuery.equalityFilter.operator, renterId),
  );

  let intents: { id: string; data: unknown }[] | null = null;
  let bookings: { id: string; data: unknown }[] | null = null;

  function emitIfReady() {
    if (intents === null || bookings === null) return;
    onSnapshotResult(decodeTrustedTripDocuments(intents, bookings));
  }

  const stopIntents = onSnapshot(
    intentsQuery,
    (snapshot) => {
      intents = snapshotDocuments(snapshot);
      emitIfReady();
    },
    onError,
  );

  const stopBookings = onSnapshot(
    bookingsQuery,
    (snapshot) => {
      bookings = snapshotDocuments(snapshot);
      emitIfReady();
    },
    onError,
  );

  return createUnsubscribeBundle(stopIntents, stopBookings);
}

export const firestoreRenterTripRepository: RenterTripRepository = {
  subscribe: subscribeToTrustedRenterTrips,
};
