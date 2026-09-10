import {
  renterVisibleBookingIntentSchema,
  renterVisibleBookingSchema,
  type RenterVisibleBooking,
  type RenterVisibleBookingIntent,
} from '@mmg/contracts';

import {
  mapTrustedBooking,
  mapTrustedBookingIntent,
  type RenterTrip,
} from '../domain/renter-trip';

export type RenterTripSnapshot = {
  trips: readonly RenterTrip[];
  skippedInvalidCount: number;
};

export type RenterTripRepository = {
  subscribe(
    renterId: string,
    onSnapshot: (snapshot: RenterTripSnapshot) => void,
    onError: (error: Error) => void,
  ): () => void;
};

// Equality-only renterId queries use Firestore's automatic single-field indexes.
// No compound index is declared because updatedAt sorting happens on the client.
export const renterTripReadQuery = {
  collections: ['bookingIntents', 'bookings'] as const,
  equalityFilter: { field: 'renterId', operator: '==' } as const,
  serverOrderBy: null,
  clientSort: { field: 'updatedAt', direction: 'desc' } as const,
} as const;

export function createUnsubscribeBundle(...unsubscribe: (() => void)[]) {
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    for (const stop of unsubscribe) stop();
  };
}

export function normalizeFirestoreTimestamp(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (!value || typeof value !== 'object') return undefined;

  const withToDate = value as { toDate?: unknown };
  if (typeof withToDate.toDate === 'function') {
    try {
      const date = (withToDate.toDate as () => Date)();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
    } catch {
      return undefined;
    }
  }

  const secondsValue =
    'seconds' in value && typeof (value as { seconds: unknown }).seconds === 'number'
      ? (value as { seconds: number }).seconds
      : '_seconds' in value && typeof (value as { _seconds: unknown })._seconds === 'number'
        ? (value as { _seconds: number })._seconds
        : undefined;
  if (secondsValue === undefined) return undefined;
  const date = new Date(secondsValue * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeTrustedRecord(id: string, data: Record<string, unknown>) {
  return {
    ...data,
    id: typeof data.id === 'string' && data.id.trim() ? data.id : id,
    createdAt: normalizeFirestoreTimestamp(data.createdAt),
    updatedAt: normalizeFirestoreTimestamp(data.updatedAt) ?? normalizeFirestoreTimestamp(data.createdAt),
    expiresAt: data.expiresAt === undefined ? undefined : normalizeFirestoreTimestamp(data.expiresAt),
    vehicleSnapshot: data.vehicleSnapshot === undefined
      ? {
          displayName: 'Booked vehicle',
          areaLabel: 'Lagos',
          categoryLabel: 'Chauffeur-ready vehicle',
          imageKey: 'hero-suv',
        }
      : data.vehicleSnapshot,
  };
}

export function parseTrustedBookingIntent(id: string, data: unknown): RenterVisibleBookingIntent | null {
  if (!data || typeof data !== 'object') return null;
  const parsed = renterVisibleBookingIntentSchema.safeParse(
    normalizeTrustedRecord(id, data as Record<string, unknown>),
  );
  return parsed.success ? parsed.data : null;
}

export function parseTrustedBooking(id: string, data: unknown): RenterVisibleBooking | null {
  if (!data || typeof data !== 'object') return null;
  const parsed = renterVisibleBookingSchema.safeParse(
    normalizeTrustedRecord(id, data as Record<string, unknown>),
  );
  return parsed.success ? parsed.data : null;
}

export function journeyKey(trip: Pick<RenterTrip, 'vehicleId' | 'startDate' | 'endDate'>) {
  return `${trip.vehicleId}:${trip.startDate}:${trip.endDate}`;
}

export function mergeRenterTrips(
  authoritative: readonly RenterTrip[],
  legacy: readonly RenterTrip[] = [],
): RenterTrip[] {
  const superseded = new Set(
    authoritative.flatMap((trip) => (trip.supersedesId ? [trip.supersedesId] : [])),
  );
  const byId = new Map<string, RenterTrip>();
  const journeys = new Set<string>();
  const paidFirst = [...authoritative].sort(
    (left, right) => Number(Boolean(right.supersedesId)) - Number(Boolean(left.supersedesId)),
  );

  for (const trip of paidFirst) {
    if (superseded.has(trip.id) || byId.has(trip.id)) continue;
    byId.set(trip.id, trip);
    journeys.add(journeyKey(trip));
  }

  for (const trip of legacy) {
    if (byId.has(trip.id) || superseded.has(trip.id) || journeys.has(journeyKey(trip))) continue;
    byId.set(trip.id, trip);
    journeys.add(journeyKey(trip));
  }

  return [...byId.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function decodeTrustedTripDocuments(
  intents: readonly { id: string; data: unknown }[],
  bookings: readonly { id: string; data: unknown }[],
): RenterTripSnapshot {
  let skippedInvalidCount = 0;
  const parsedIntents: RenterTrip[] = [];
  const parsedBookings: RenterTrip[] = [];

  for (const document of intents) {
    const parsed = parseTrustedBookingIntent(document.id, document.data);
    if (parsed) parsedIntents.push(mapTrustedBookingIntent(parsed));
    else skippedInvalidCount += 1;
  }
  for (const document of bookings) {
    const parsed = parseTrustedBooking(document.id, document.data);
    if (parsed) parsedBookings.push(mapTrustedBooking(parsed));
    else skippedInvalidCount += 1;
  }

  return {
    skippedInvalidCount,
    trips: mergeRenterTrips([...parsedBookings, ...parsedIntents]),
  };
}

export function mergeRequestFirstTrips(
  requests: readonly RenterTrip[],
  authoritative: readonly RenterTrip[],
  legacy: readonly RenterTrip[] = [],
): RenterTrip[] {
  const hiddenIds = new Set<string>();
  for (const request of requests) {
    if (request.intentId) hiddenIds.add(request.intentId);
    if (request.bookingId) hiddenIds.add(request.bookingId);
  }
  const visibleAuthoritative = authoritative.filter((trip) => !hiddenIds.has(trip.id));
  return mergeRenterTrips([...requests, ...visibleAuthoritative], legacy);
}

export function resolveVisibleRenterTrips(input: {
  authoritative: readonly RenterTrip[];
  legacy: readonly RenterTrip[];
  preview: readonly RenterTrip[];
  allowPreview: boolean;
  requests?: readonly RenterTrip[];
}): RenterTrip[] {
  const merged = mergeRequestFirstTrips(input.requests ?? [], input.authoritative, input.legacy);
  if (merged.length) return merged;
  return input.allowPreview ? [...input.preview] : [];
}

export function scopeTripsToActiveUser(
  activeUserId: string | null | undefined,
  snapshotUserId: string | null,
  trips: readonly RenterTrip[],
): readonly RenterTrip[] {
  return activeUserId && activeUserId === snapshotUserId ? trips : [];
}
