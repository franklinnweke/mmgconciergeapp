import {
  renterVisibleBookingIntentSchema,
  renterVisibleBookingSchema,
  type RenterVisibleBooking,
  type RenterVisibleBookingIntent,
} from '@mmg/contracts';
import {
  renterVisibleRentalRequestSchema,
  type RenterVisibleRentalRequest,
} from '@mmg/contracts/rental-request';

import {
  mapTrustedBooking,
  mapTrustedBookingIntent,
  type RenterTrip,
  type RenterTripState,
} from '../domain/renter-trip';

export type RenterTripSnapshot = { trips: readonly RenterTrip[]; skippedInvalidCount: number };
export type RenterTripRepository = {
  subscribe(renterId: string, onSnapshot: (snapshot: RenterTripSnapshot) => void, onError: (error: Error) => void): () => void;
};

export const renterTripReadQuery = {
  collections: ['bookingIntents', 'bookings', 'rentalRequests'] as const,
  equalityFilter: { field: 'renterId', operator: '==' } as const,
  serverOrderBy: null,
  clientSort: { field: 'updatedAt', direction: 'desc' } as const,
} as const;

export function createUnsubscribeBundle(...unsubscribe: (() => void)[]) {
  let closed = false;
  return () => { if (closed) return; closed = true; for (const stop of unsubscribe) stop(); };
}

export function normalizeFirestoreTimestamp(value: unknown): string | undefined {
  if (typeof value === 'string') { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString(); }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (!value || typeof value !== 'object') return undefined;
  const withToDate = value as { toDate?: unknown };
  if (typeof withToDate.toDate === 'function') {
    try { const date = (withToDate.toDate as () => Date)(); return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined; } catch { return undefined; }
  }
  const seconds = 'seconds' in value && typeof (value as { seconds: unknown }).seconds === 'number'
    ? (value as { seconds: number }).seconds
    : '_seconds' in value && typeof (value as { _seconds: unknown })._seconds === 'number'
      ? (value as { _seconds: number })._seconds : undefined;
  if (seconds === undefined) return undefined;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeTrustedRecord(id: string, data: Record<string, unknown>) {
  return {
    ...data,
    id: typeof data.id === 'string' && data.id.trim() ? data.id : id,
    createdAt: normalizeFirestoreTimestamp(data.createdAt),
    updatedAt: normalizeFirestoreTimestamp(data.updatedAt) ?? normalizeFirestoreTimestamp(data.createdAt),
    expiresAt: data.expiresAt === undefined ? undefined : normalizeFirestoreTimestamp(data.expiresAt),
    vehicleSnapshot: data.vehicleSnapshot === undefined ? {
      displayName: 'Booked vehicle', areaLabel: 'Lagos', categoryLabel: 'Chauffeur-ready vehicle', imageKey: 'hero-suv',
    } : data.vehicleSnapshot,
  };
}

export function parseTrustedBookingIntent(id: string, data: unknown): RenterVisibleBookingIntent | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  // Request-first intents are technical payment holds. The renter-facing record
  // is the rentalRequest, so suppress the duplicate backend intent from Trips.
  if (typeof raw.rentalRequestId === 'string' && raw.rentalRequestId) return null;
  const parsed = renterVisibleBookingIntentSchema.safeParse(normalizeTrustedRecord(id, raw));
  return parsed.success ? parsed.data : null;
}

export function parseTrustedBooking(id: string, data: unknown): RenterVisibleBooking | null {
  if (!data || typeof data !== 'object') return null;
  const parsed = renterVisibleBookingSchema.safeParse(normalizeTrustedRecord(id, data as Record<string, unknown>));
  return parsed.success ? parsed.data : null;
}

export function parseRentalRequest(id: string, data: unknown): RenterVisibleRentalRequest | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  const parsed = renterVisibleRentalRequestSchema.safeParse({
    ...raw,
    requestId: typeof raw.requestId === 'string' ? raw.requestId : id,
    createdAt: normalizeFirestoreTimestamp(raw.createdAt),
    updatedAt: normalizeFirestoreTimestamp(raw.updatedAt) ?? normalizeFirestoreTimestamp(raw.createdAt),
    ...(raw.holdExpiresAt === undefined ? {} : { holdExpiresAt: normalizeFirestoreTimestamp(raw.holdExpiresAt) }),
  });
  return parsed.success ? parsed.data : null;
}

function requestState(state: RenterVisibleRentalRequest['state']): RenterTripState {
  if (state === 'requested') return 'legacy_availability_requested';
  if (state === 'ready_for_payment') return 'checkout_pending';
  if (state === 'declined') return 'cancelled';
  if (state === 'payment_window_expired') return 'expired';
  if (state === 'needs_attention') return 'intervention_required';
  return 'confirmed';
}

export function mapRentalRequest(record: RenterVisibleRentalRequest): RenterTrip {
  const state = requestState(record.state);
  return {
    id: record.requestId,
    vehicleId: record.vehicleId,
    startDate: record.startDate,
    endDate: record.endDate,
    state,
    priceSnapshot: record.authoritativePriceSnapshot ?? record.estimatedPriceSnapshot,
    group: state === 'confirmed' ? 'upcoming' : state === 'intervention_required' ? 'intervention' :
      (state === 'cancelled' || state === 'expired') ? 'past' : 'active',
    updatedAt: record.updatedAt,
    source: 'trusted',
    vehicleSnapshot: record.vehicleSnapshot,
  };
}

export function journeyKey(trip: Pick<RenterTrip, 'vehicleId' | 'startDate' | 'endDate'>) { return `${trip.vehicleId}:${trip.startDate}:${trip.endDate}`; }

export function mergeRenterTrips(authoritative: readonly RenterTrip[], secondary: readonly RenterTrip[] = []): RenterTrip[] {
  const superseded = new Set(authoritative.flatMap((trip) => (trip.supersedesId ? [trip.supersedesId] : [])));
  const byId = new Map<string, RenterTrip>();
  const journeys = new Set<string>();
  const paidFirst = [...authoritative].sort((left, right) => Number(Boolean(right.supersedesId)) - Number(Boolean(left.supersedesId)));
  for (const trip of paidFirst) { if (superseded.has(trip.id) || byId.has(trip.id)) continue; byId.set(trip.id, trip); journeys.add(journeyKey(trip)); }
  for (const trip of secondary) { if (byId.has(trip.id) || superseded.has(trip.id) || journeys.has(journeyKey(trip))) continue; byId.set(trip.id, trip); journeys.add(journeyKey(trip)); }
  return [...byId.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function decodeTrustedTripDocuments(
  intents: readonly { id: string; data: unknown }[],
  bookings: readonly { id: string; data: unknown }[],
  requests: readonly { id: string; data: unknown }[] = [],
): RenterTripSnapshot {
  let skippedInvalidCount = 0;
  const parsedIntents: RenterTrip[] = [];
  const parsedBookings: RenterTrip[] = [];
  const parsedRequests: RenterTrip[] = [];
  for (const document of intents) {
    const raw = document.data as Record<string, unknown> | null;
    if (raw && typeof raw.rentalRequestId === 'string') continue;
    const parsed = parseTrustedBookingIntent(document.id, document.data);
    if (parsed) parsedIntents.push(mapTrustedBookingIntent(parsed)); else skippedInvalidCount += 1;
  }
  for (const document of bookings) { const parsed = parseTrustedBooking(document.id, document.data); if (parsed) parsedBookings.push(mapTrustedBooking(parsed)); else skippedInvalidCount += 1; }
  for (const document of requests) { const parsed = parseRentalRequest(document.id, document.data); if (parsed) parsedRequests.push(mapRentalRequest(parsed)); else skippedInvalidCount += 1; }
  return { skippedInvalidCount, trips: mergeRenterTrips([...parsedBookings, ...parsedIntents], parsedRequests) };
}

export function resolveVisibleRenterTrips(input: { authoritative: readonly RenterTrip[]; legacy: readonly RenterTrip[]; preview: readonly RenterTrip[]; allowPreview: boolean }): RenterTrip[] {
  const merged = mergeRenterTrips(input.authoritative, input.legacy);
  if (merged.length) return merged;
  return input.allowPreview ? [...input.preview] : [];
}

export function scopeTripsToActiveUser(activeUserId: string | null | undefined, snapshotUserId: string | null, trips: readonly RenterTrip[]): readonly RenterTrip[] {
  return activeUserId && activeUserId === snapshotUserId ? trips : [];
}
