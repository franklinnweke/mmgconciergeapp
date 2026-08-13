import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BookingRequest, BookingRequestStatus } from '@mmg/contracts';

const storageKeyPrefix = '@mmg/booking-requests/v1/';

function getStorageKey(userId: string) {
  return `${storageKeyPrefix}${userId}`;
}

const bookingStatuses: readonly BookingRequestStatus[] = [
  'availability_requested',
  'confirmed',
  'payment_required',
  'booked',
];

function decodeBookingRequest(value: unknown): BookingRequest | null {
  if (!value || typeof value !== 'object') return null;
  const request = value as Partial<BookingRequest>;

  const isValid =
    typeof request.id === 'string' &&
    typeof request.userId === 'string' &&
    typeof request.vehicleId === 'string' &&
    Number.isSafeInteger(request.durationDays) &&
    typeof request.pickupAt === 'string' &&
    typeof request.returnAt === 'string' &&
    Number.isSafeInteger(request.dailyRateKobo) &&
    Number.isSafeInteger(request.totalKobo) &&
    bookingStatuses.includes(request.status as BookingRequestStatus) &&
    typeof request.createdAt === 'string'
  ;

  if (!isValid) return null;
  return {
    ...(request as BookingRequest),
    updatedAt: typeof request.updatedAt === 'string' ? request.updatedAt : request.createdAt!,
  };
}

export async function loadLocalBookingRequests(userId: string): Promise<BookingRequest[]> {
  const storedValue = await AsyncStorage.getItem(getStorageKey(userId));
  if (!storedValue) return [];

  try {
    const parsed: unknown = JSON.parse(storedValue);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(decodeBookingRequest)
      .filter((request): request is BookingRequest => request !== null);
  } catch {
    return [];
  }
}

export async function saveLocalBookingRequests(
  userId: string,
  requests: readonly BookingRequest[],
) {
  await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(requests));
}
