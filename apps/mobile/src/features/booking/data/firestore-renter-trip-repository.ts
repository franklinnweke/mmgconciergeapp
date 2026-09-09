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

function docs(snapshot: { docs: QueryDocumentSnapshot<DocumentData, DocumentData>[] }) {
  return snapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
}

export function subscribeToTrustedRenterTrips(
  renterId: string,
  onSnapshotResult: (snapshot: RenterTripSnapshot) => void,
  onError: (error: Error) => void,
) {
  const database = getFirestore();
  const scoped = renterTripReadQuery.collections.map((name) => query(
    collection(database, name),
    where(renterTripReadQuery.equalityFilter.field, renterTripReadQuery.equalityFilter.operator, renterId),
  ));
  let intents: { id: string; data: unknown }[] | null = null;
  let bookings: { id: string; data: unknown }[] | null = null;
  let requests: { id: string; data: unknown }[] | null = null;

  function emit() {
    if (intents === null || bookings === null || requests === null) return;
    onSnapshotResult(decodeTrustedTripDocuments(intents, bookings, requests));
  }

  const stops = [
    onSnapshot(scoped[0]!, (snapshot) => { intents = docs(snapshot); emit(); }, onError),
    onSnapshot(scoped[1]!, (snapshot) => { bookings = docs(snapshot); emit(); }, onError),
    onSnapshot(scoped[2]!, (snapshot) => { requests = docs(snapshot); emit(); }, onError),
  ];
  return createUnsubscribeBundle(...stops);
}

export const firestoreRenterTripRepository: RenterTripRepository = { subscribe: subscribeToTrustedRenterTrips };
