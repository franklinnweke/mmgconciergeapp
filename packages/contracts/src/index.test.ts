import { describe, expect, it } from 'vitest';

import {
  createBookingIntentCommandSchema,
  dateOnlySchema,
  emailPasswordRegistrationSchema,
  emailPasswordSignInSchema,
  priceSnapshotSchema,
  renterVisibleBookingIntentSchema,
  renterVisibleBookingSchema,
} from './index';

describe('authentication contracts', () => {
  it('normalizes a valid email/password sign-in request', () => {
    expect(
      emailPasswordSignInSchema.parse({
        email: '  RENTER@Example.com ',
        password: 'private-passphrase',
      }),
    ).toEqual({
      email: 'renter@example.com',
      password: 'private-passphrase',
    });
  });

  it('rejects weak credentials and oversized names', () => {
    expect(() =>
      emailPasswordRegistrationSchema.parse({
        displayName: 'A'.repeat(81),
        email: 'not-an-email',
        password: 'short',
      }),
    ).toThrow();
  });
});

describe('booking command contracts', () => {
  it('accepts a strict versioned date-only booking command', () => {
    expect(createBookingIntentCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: 'booking_01JABCDEFGHIJK',
      data: {
        vehicleId: 'vehicle-one',
        startDate: '2026-09-01',
        endDate: '2026-09-04',
      },
    })).toMatchObject({ schemaVersion: 1 });
  });

  it('rejects impossible dates, extra client fields, and short idempotency keys', () => {
    expect(dateOnlySchema.safeParse('2026-02-29').success).toBe(false);
    expect(createBookingIntentCommandSchema.safeParse({
      schemaVersion: 1,
      idempotencyKey: 'short',
      data: {
        vehicleId: 'vehicle-one',
        startDate: '2026-09-01',
        endDate: '2026-09-04',
        totalKobo: 1,
      },
    }).success).toBe(false);
  });

  it('requires integer-kobo snapshots and bounded basis points', () => {
    expect(priceSnapshotSchema.safeParse({
      currency: 'NGN',
      chargedDays: 1,
      ownerDailyRateKobo: 10.5,
      baseRentalKobo: 10,
      deliveryFeeKobo: 0,
      serviceFeeBps: 10_001,
      serviceFeeFixedKobo: 0,
      serviceFeeKobo: 0,
      ownerCommissionBps: 0,
      ownerCommissionKobo: 0,
      ownerEarningsKobo: 10,
      renterTotalKobo: 10,
      configVersion: 'v1',
      termsVersion: 'v1',
      cancellationPolicyVersion: 'v1',
    }).success).toBe(false);
  });
});

const validPriceSnapshot = {
  currency: 'NGN',
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

const validVehicleSnapshot = {
  displayName: 'Pearl Executive SUV',
  areaLabel: 'Victoria Island',
  categoryLabel: 'Executive SUV',
  imageKey: 'pearl-suv',
};

describe('renter-visible trusted records', () => {
  it('accepts a normalized booking-intent document and ignores extra server fields', () => {
    expect(renterVisibleBookingIntentSchema.parse({
      id: 'intent-one',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-13',
      endDate: '2026-09-16',
      state: 'checkout_pending',
      priceSnapshot: validPriceSnapshot,
      vehicleSnapshot: validVehicleSnapshot,
      createdAt: '2026-08-13T12:00:00.000Z',
      updatedAt: '2026-08-13T12:14:00.000Z',
      expiresAt: '2026-08-13T12:15:00.000Z',
      paystackReference: 'server-only',
    })).toMatchObject({ id: 'intent-one', state: 'checkout_pending' });
  });

  it('accepts a normalized paid booking and rejects intent states on bookings', () => {
    expect(renterVisibleBookingSchema.parse({
      id: 'booking-one',
      intentId: 'intent-one',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-21',
      endDate: '2026-09-24',
      state: 'paid_pending_owner',
      priceSnapshot: validPriceSnapshot,
      vehicleSnapshot: validVehicleSnapshot,
      createdAt: '2026-08-13T12:00:00.000Z',
      updatedAt: '2026-08-13T12:14:00.000Z',
    }).intentId).toBe('intent-one');
    expect(renterVisibleBookingSchema.safeParse({
      id: 'booking-one',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-21',
      endDate: '2026-09-24',
      state: 'checkout_pending',
      priceSnapshot: validPriceSnapshot,
      vehicleSnapshot: validVehicleSnapshot,
      createdAt: '2026-08-13T12:00:00.000Z',
      updatedAt: '2026-08-13T12:14:00.000Z',
    }).success).toBe(false);
  });

  it('rejects raw timestamp objects and missing renter identity', () => {
    expect(renterVisibleBookingIntentSchema.safeParse({
      id: 'intent-one',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-13',
      endDate: '2026-09-16',
      state: 'intent_created',
      priceSnapshot: validPriceSnapshot,
      vehicleSnapshot: validVehicleSnapshot,
      createdAt: { seconds: 1_786_617_600, nanoseconds: 0 },
      updatedAt: '2026-08-13T12:14:00.000Z',
      expiresAt: '2026-08-13T12:15:00.000Z',
    }).success).toBe(false);
    expect(renterVisibleBookingSchema.safeParse({
      id: 'booking-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-21',
      endDate: '2026-09-24',
      state: 'confirmed',
      priceSnapshot: validPriceSnapshot,
      vehicleSnapshot: validVehicleSnapshot,
      createdAt: '2026-08-13T12:00:00.000Z',
      updatedAt: '2026-08-13T12:14:00.000Z',
    }).success).toBe(false);
  });
});
