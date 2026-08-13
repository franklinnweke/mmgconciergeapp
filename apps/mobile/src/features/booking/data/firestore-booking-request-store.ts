import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from '@react-native-firebase/firestore';
import type { BookingRequest, BookingRequestStatus } from '@mmg/contracts';

export const bookingRemoteEnabled = true;

const bookingStatuses: readonly BookingRequestStatus[] = [
  'availability_requested',
  'confirmed',
  'payment_required',
  'booked',
];

function toIsoString(value: unknown, fallback: string) {
  return value instanceof Timestamp ? value.toDate().toISOString() : fallback;
}

function decodeRemoteRequest(
  snapshot: QueryDocumentSnapshot<DocumentData, DocumentData>,
): BookingRequest | null {
  const data = snapshot.data();
  const now = new Date().toISOString();

  if (
    typeof data.userId !== 'string' ||
    typeof data.vehicleId !== 'string' ||
    !Number.isSafeInteger(data.durationDays) ||
    !(data.pickupAt instanceof Timestamp) ||
    !(data.returnAt instanceof Timestamp) ||
    !Number.isSafeInteger(data.dailyRateKobo) ||
    !Number.isSafeInteger(data.totalKobo) ||
    !bookingStatuses.includes(data.status as BookingRequestStatus)
  ) {
    return null;
  }

  const createdAt = toIsoString(data.createdAt, now);
  return {
    createdAt,
    dailyRateKobo: data.dailyRateKobo,
    durationDays: data.durationDays,
    id: snapshot.id,
    pickupAt: data.pickupAt.toDate().toISOString(),
    returnAt: data.returnAt.toDate().toISOString(),
    status: data.status,
    totalKobo: data.totalKobo,
    updatedAt: toIsoString(data.updatedAt, createdAt),
    userId: data.userId,
    vehicleId: data.vehicleId,
  };
}

export function subscribeToRemoteBookingRequests(
  userId: string,
  onRequests: (requests: BookingRequest[]) => void,
  onError: (error: Error) => void,
) {
  const database = getFirestore();
  const requestCollection = collection(database, 'users', userId, 'bookingRequests');

  return onSnapshot(
    requestCollection,
    (snapshot) => {
      const requests = snapshot.docs
        .map(decodeRemoteRequest)
        .filter((request): request is BookingRequest => request !== null)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      onRequests(requests);
    },
    (error) => onError(error),
  );
}

export async function createRemoteBookingRequest(request: BookingRequest) {
  const database = getFirestore();
  const requestReference = doc(
    database,
    'users',
    request.userId,
    'bookingRequests',
    request.id,
  );

  await setDoc(requestReference, {
    createdAt: serverTimestamp(),
    dailyRateKobo: request.dailyRateKobo,
    durationDays: request.durationDays,
    pickupAt: Timestamp.fromDate(new Date(request.pickupAt)),
    returnAt: Timestamp.fromDate(new Date(request.returnAt)),
    status: 'availability_requested',
    totalKobo: request.totalKobo,
    updatedAt: serverTimestamp(),
    userId: request.userId,
    vehicleId: request.vehicleId,
  });
}
