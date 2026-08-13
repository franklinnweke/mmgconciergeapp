import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BookingRequest } from '@mmg/contracts';

const storageKeyPrefix = '@mmg/booking-requests/v1/';

function getStorageKey(userId: string) {
  return `${storageKeyPrefix}${userId}`;
}

function isBookingRequest(value: unknown): value is BookingRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Partial<BookingRequest>;

  return (
    typeof request.id === 'string' &&
    typeof request.userId === 'string' &&
    typeof request.vehicleId === 'string' &&
    Number.isSafeInteger(request.durationDays) &&
    typeof request.pickupAt === 'string' &&
    typeof request.returnAt === 'string' &&
    Number.isSafeInteger(request.dailyRateKobo) &&
    Number.isSafeInteger(request.totalKobo) &&
    request.status === 'availability_requested' &&
    typeof request.createdAt === 'string'
  );
}

export async function loadLocalBookingRequests(userId: string): Promise<BookingRequest[]> {
  const storedValue = await AsyncStorage.getItem(getStorageKey(userId));
  if (!storedValue) return [];

  try {
    const parsed: unknown = JSON.parse(storedValue);
    return Array.isArray(parsed) ? parsed.filter(isBookingRequest) : [];
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
