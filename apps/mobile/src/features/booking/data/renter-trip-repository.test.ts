import { describe, expect, it, vi } from 'vitest';

import { mapTrustedBookingIntent, stateGroup, type RenterTrip } from '../domain/renter-trip';
import {
  createUnsubscribeBundle,
  decodeTrustedTripDocuments,
  mergeRenterTrips,
  mergeRequestFirstTrips,
  normalizeFirestoreTimestamp,
  parseTrustedBooking,
  parseTrustedBookingIntent,
  recoverRenterTripVehicle,
  resolveVisibleRenterTrips,
  renterTripReadQuery,
  scopeTripsToActiveUser,
} from './renter-trip-repository';

const priceSnapshot = {
  currency: 'NGN' as const,
  chargedDays: 3,
  ownerDailyRateKobo: 38_500_000,
  baseRentalKobo: 115_500_000,
  deliveryFeeKobo: 0,
  serviceFeeBps: 800,
  serviceFeeFixedKobo: 0,
  serviceFeeKobo: 9_240_000,
  ownerCommissionBps: 1_500,
  ownerCommissionKobo: 17_325_000,
  ownerEarningsKobo: 98_175_000,
  renterTotalKobo: 124_740_000,
  configVersion: 'pricing-2026-08',
  termsVersion: 'terms-2026-08',
  cancellationPolicyVersion: 'cancellation-2026-08',
};

function trip(overrides: Partial<RenterTrip>): RenterTrip {
  const state = overrides.state ?? 'checkout_pending';
  return {
    id: 'trip-one',
    vehicleId: 'vehicle-one',
    startDate: '2026-09-13',
    endDate: '2026-09-16',
    state,
    priceSnapshot,
    group: stateGroup(state),
    updatedAt: '2026-08-13T12:14:00.000Z',
    source: 'trusted',
    vehicleSnapshot: {
      displayName: 'Pearl Executive SUV',
      areaLabel: 'Victoria Island',
      categoryLabel: 'Executive SUV',
      imageKey: 'pearl-suv',
    },
    ...overrides,
  };
}

const validIntent = {
  renterId: 'renter-one',
  ownerId: 'owner-one',
  vehicleId: 'vehicle-one',
  startDate: '2026-09-13',
  endDate: '2026-09-16',
  state: 'checkout_pending',
  priceSnapshot,
  vehicleSnapshot: {
    displayName: 'Pearl Executive SUV',
    areaLabel: 'Victoria Island',
    categoryLabel: 'Executive SUV',
    imageKey: 'pearl-suv',
  },
  createdAt: { seconds: 1_786_617_600, nanoseconds: 0 },
  updatedAt: { toDate: () => new Date('2026-08-13T12:14:00.000Z') },
  expiresAt: '2026-08-13T12:29:00.000Z',
};

const validBooking = {
  intentId: 'intent-one',
  renterId: 'renter-one',
  ownerId: 'owner-one',
  vehicleId: 'vehicle-one',
  startDate: '2026-09-13',
  endDate: '2026-09-16',
  state: 'paid_pending_owner',
  priceSnapshot,
  vehicleSnapshot: {
    displayName: 'Pearl Executive SUV',
    areaLabel: 'Victoria Island',
    categoryLabel: 'Executive SUV',
    imageKey: 'pearl-suv',
  },
  createdAt: '2026-08-13T12:00:00.000Z',
  updatedAt: '2026-08-13T13:00:00.000Z',
};

describe('cancelled historical held-date presentation', () => {
  it('moves cancelled unpaid holds to Past without hiding their history', () => {
    const result = parseTrustedBookingIntent('intent-one', {
      ...validIntent, state: 'expired', cancelledByRenterAt: { seconds: 1_786_617_600 },
    });
    expect(result).not.toBeNull();
    const trip = mapTrustedBookingIntent(result!);
    expect(trip.state).toBe('cancelled_by_renter');
    expect(trip.group).toBe('past');
  });

  it('does not relabel ordinary hold expiry as renter cancellation', () => {
    expect(parseTrustedBookingIntent('intent-one', { ...validIntent, state: 'expired' })?.state).toBe('expired');
  });

  it('preserves Firestore Timestamp receiver context', () => {
    const timestamp = { seconds: 1_786_617_600, toDate() { return new Date(this.seconds * 1000); } };
    expect(normalizeFirestoreTimestamp(timestamp)).toBe(new Date(timestamp.seconds * 1000).toISOString());
  });
});

describe('renter trip repository', () => {
  it('uses renter-scoped equality queries and client-side updatedAt ordering', () => {
    expect(renterTripReadQuery.collections).toEqual(['bookingIntents', 'bookings']);
    expect(renterTripReadQuery.collections).not.toContain('rentalRequests');
    expect(renterTripReadQuery.collections).not.toContain('rentalRequestContacts');
    expect(renterTripReadQuery.equalityFilter).toEqual({ field: 'renterId', operator: '==' });
    expect(renterTripReadQuery.serverOrderBy).toBeNull();
    expect(renterTripReadQuery.clientSort).toEqual({ field: 'updatedAt', direction: 'desc' });
  });

  it('normalizes Firestore timestamps before schema parse', () => {
    expect(normalizeFirestoreTimestamp({
      seconds: Math.floor(Date.parse('2026-08-13T12:00:00.000Z') / 1000),
      nanoseconds: 0,
    })).toBe('2026-08-13T12:00:00.000Z');
    expect(normalizeFirestoreTimestamp({ toDate: () => new Date('2026-08-13T12:14:00.000Z') }))
      .toBe('2026-08-13T12:14:00.000Z');
    expect(normalizeFirestoreTimestamp('2026-08-13T12:14:00.000Z')).toBe('2026-08-13T12:14:00.000Z');
    expect(normalizeFirestoreTimestamp('not-a-date')).toBeUndefined();
    expect(parseTrustedBookingIntent('intent-one', validIntent)?.updatedAt).toBe('2026-08-13T12:14:00.000Z');
    expect(parseTrustedBooking('booking-one', validBooking)?.intentId).toBe('intent-one');
  });

  it('keeps older trusted trips visible when they predate vehicle snapshots', () => {
    const { vehicleSnapshot: _snapshot, ...legacyIntent } = validIntent;
    const parsed = parseTrustedBookingIntent('intent-before-snapshots', legacyIntent);
    expect(parsed?.vehicleId).toBe('vehicle-one');
    expect(parsed?.vehicleSnapshot).toMatchObject({
      displayName: 'Booked vehicle',
      areaLabel: 'Lagos',
    });
  });

  it('recovers the real published vehicle image for historical trip snapshots', () => {
    const historical = trip({
      vehicleSnapshot: {
        displayName: 'Booked vehicle',
        areaLabel: 'Lagos',
        categoryLabel: 'Executive SUV',
        imageKey: 'hero-suv',
      },
    });
    const liveVehicle = {
      id: 'vehicle-one',
      displayName: '2023 Toyota Land Cruiser Prado 150 VX',
      category: 'executive_suv' as const,
      areaLabel: 'Victoria Island',
      seats: 7,
      dailyRateKobo: 38_500_000,
      distanceKm: 0,
      chauffeurPolicy: 'included' as const,
      deliveryPolicy: 'included' as const,
      imageUrl: 'https://media.example/public/vehicles/vehicle-one/approved/front/card',
    };

    const recovered = recoverRenterTripVehicle(historical, liveVehicle);
    expect(recovered.vehicleSnapshot).toEqual({
      displayName: '2023 Toyota Land Cruiser Prado 150 VX',
      areaLabel: 'Victoria Island',
      categoryLabel: 'Executive SUV',
      imageUrl: 'https://media.example/public/vehicles/vehicle-one/approved/front/card',
    });

    const immutableSnapshot = trip({
      vehicleSnapshot: {
        displayName: 'Original booked Prado',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
        imageUrl: 'https://media.example/original-booking-image',
      },
    });
    expect(recoverRenterTripVehicle(immutableSnapshot, liveVehicle)).toBe(immutableSnapshot);
  });

  it('skips invalid documents without exposing raw payloads', () => {
    const snapshot = decodeTrustedTripDocuments(
      [
        { id: 'intent-one', data: validIntent },
        { id: 'intent-bad', data: { renterId: 'renter-one', state: 'invented', secret: 'do-not-leak' } },
      ],
      [{ id: 'booking-bad', data: null }],
    );

    expect(snapshot.skippedInvalidCount).toBe(2);
    expect(snapshot.trips).toHaveLength(1);
    expect(snapshot.trips[0]?.id).toBe('intent-one');
    expect(JSON.stringify(snapshot)).not.toContain('do-not-leak');
  });

  it('prefers authoritative bookings over matching intents and legacy requests', () => {
    const merged = mergeRenterTrips(
      [
        trip({
          id: 'booking-one',
          state: 'paid_pending_owner',
          supersedesId: 'intent-one',
          updatedAt: '2026-08-13T13:00:00.000Z',
        }),
        trip({ id: 'intent-one', state: 'checkout_pending', updatedAt: '2026-08-13T12:00:00.000Z' }),
      ],
      [
        trip({
          id: 'legacy-one',
          source: 'legacy',
          state: 'legacy_availability_requested',
          updatedAt: '2026-08-13T11:00:00.000Z',
        }),
      ],
    );

    expect(merged.map((item) => item.id)).toEqual(['booking-one']);
  });

  it('keeps a distinct legacy request and sorts by updatedAt', () => {
    const merged = mergeRenterTrips(
      [trip({ id: 'intent-two', vehicleId: 'vehicle-two', startDate: '2026-10-01', endDate: '2026-10-04', updatedAt: '2026-08-13T10:00:00.000Z' })],
      [trip({ id: 'legacy-two', source: 'legacy', vehicleId: 'vehicle-three', startDate: '2026-11-01', endDate: '2026-11-03', updatedAt: '2026-08-13T14:00:00.000Z' })],
    );
    expect(merged.map((item) => item.id)).toEqual(['legacy-two', 'intent-two']);
  });

  it('keeps the request as truth before payment and hides its matching intent', () => {
    const merged = mergeRequestFirstTrips(
      [
        trip({
          id: 'request-one',
          source: 'request',
          state: 'ready_for_payment',
          intentId: 'intent-one',
          updatedAt: '2026-08-13T13:30:00.000Z',
        }),
      ],
      [trip({ id: 'intent-one', state: 'intent_created', updatedAt: '2026-08-13T13:00:00.000Z' })],
    );
    expect(merged.map((item) => item.id)).toEqual(['request-one']);
  });

  it('hands the journey to the authoritative booking after payment so refund states remain visible', () => {
    const merged = mergeRequestFirstTrips(
      [
        trip({
          id: 'request-one',
          source: 'request',
          state: 'confirmed',
          intentId: 'intent-one',
          bookingId: 'booking-one',
          pickupLocation: { displayName: 'Gate', formattedAddress: 'Ikoyi gate', latitude: 6.45, longitude: 3.43, serviceAreaLabel: 'Ikoyi', note: 'Side entrance' },
          confirmedPickupTime: '09:30',
          updatedAt: '2026-08-13T13:30:00.000Z',
        }),
      ],
      [
        trip({ id: 'intent-one', state: 'paid', updatedAt: '2026-08-13T13:00:00.000Z' }),
        trip({ id: 'booking-one', state: 'refund_pending', supersedesId: 'intent-one', updatedAt: '2026-08-13T13:40:00.000Z' }),
      ],
    );
    expect(merged.map((item) => item.id)).toEqual(['booking-one']);
    expect(merged[0]?.state).toBe('refund_pending');
    expect(merged[0]?.pickupLocation?.note).toBe('Side entrance');
    expect(merged[0]?.confirmedPickupTime).toBe('09:30');
  });

  it('uses preview trips only when no authoritative or leftover legacy records exist', () => {
    const preview = [trip({ id: 'preview-one', source: 'preview' })];
    expect(resolveVisibleRenterTrips({
      authoritative: [trip({ id: 'intent-one' })],
      legacy: [],
      preview,
      allowPreview: true,
    })[0]?.id).toBe('intent-one');
    expect(resolveVisibleRenterTrips({
      authoritative: [],
      legacy: [],
      preview,
      allowPreview: true,
    })[0]?.source).toBe('preview');
    expect(resolveVisibleRenterTrips({
      authoritative: [],
      legacy: [],
      preview,
      allowPreview: false,
    })).toEqual([]);
  });

  it('never exposes a previous renter snapshot after sign-out or account switch', () => {
    const previousTrips = [trip({ id: 'renter-one-trip' })];
    expect(scopeTripsToActiveUser(undefined, 'renter-one', previousTrips)).toEqual([]);
    expect(scopeTripsToActiveUser('renter-two', 'renter-one', previousTrips)).toEqual([]);
    expect(scopeTripsToActiveUser('renter-one', 'renter-one', previousTrips)).toEqual(previousTrips);
  });

  it('unsubscribes once and ignores later stops', () => {
    const first = vi.fn();
    const second = vi.fn();
    const stop = createUnsubscribeBundle(first, second);
    stop();
    stop();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
