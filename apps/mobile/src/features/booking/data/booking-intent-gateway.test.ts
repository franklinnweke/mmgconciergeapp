import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CallableContractError } from '../../../core/firebase/parse-callable-result';

import { BookingIntentSubmissionKey } from './booking-intent-gateway-core';
import { NativeBookingIntentGateway } from './booking-intent-gateway';

const {
  mockCallable,
  mockGetFunctions,
  mockHttpsCallable,
} = vi.hoisted(() => {
  const callable = vi.fn();
  return {
    mockCallable: callable,
    mockGetFunctions: vi.fn((_app?: unknown, region?: string) => ({ region })),
    mockHttpsCallable: vi.fn((_functions: unknown, _name: string) => callable),
  };
});

vi.mock('@react-native-firebase/functions', () => ({
  getFunctions: mockGetFunctions,
  httpsCallable: mockHttpsCallable,
}));

const data = {
  vehicleId: 'vehicle-prado-250',
  startDate: '2026-08-22',
  endDate: '2026-08-24',
} as const;

const validResponse = {
  requestId: 'request-booking-1',
  result: {
    intentId: 'intent-booking-1',
    state: 'intent_created',
    startDate: data.startDate,
    endDate: data.endDate,
    expiresAt: '2026-08-20T15:15:00.000Z',
    priceSnapshot: {
      currency: 'NGN',
      chargedDays: 2,
      ownerDailyRateKobo: 38_500_000,
      baseRentalKobo: 77_000_000,
      deliveryFeeKobo: 0,
      serviceFeeBps: 800,
      serviceFeeFixedKobo: 0,
      serviceFeeKobo: 6_160_000,
      ownerCommissionBps: 1_500,
      ownerCommissionKobo: 11_550_000,
      ownerEarningsKobo: 65_450_000,
      renterTotalKobo: 83_160_000,
      configVersion: 'pricing-2026-08-01',
      termsVersion: 'renter-terms-2026-08-01',
      cancellationPolicyVersion: 'cancellation-2026-08-01',
    },
    vehicleSnapshot: {
      displayName: 'Toyota Land Cruiser Prado 250',
      areaLabel: 'Ikoyi',
      categoryLabel: 'Prado Luxury',
      imageKey: 'prado-graphite',
    },
  },
};

describe('BookingIntentSubmissionKey', () => {
  it('reuses a key for an unchanged retry and rotates when the journey changes', () => {
    const keys = ['booking_intent_key_0001', 'booking_intent_key_0002'];
    const manager = new BookingIntentSubmissionKey(() => keys.shift()!);

    expect(manager.forData(data)).toBe('booking_intent_key_0001');
    expect(manager.forData({ ...data })).toBe('booking_intent_key_0001');
    expect(manager.forData({ ...data, endDate: '2026-08-25' })).toBe('booking_intent_key_0002');
  });

  it('rotates after a successful operation', () => {
    const keys = ['booking_intent_key_0001', 'booking_intent_key_0002'];
    const manager = new BookingIntentSubmissionKey(() => keys.shift()!);

    expect(manager.forData(data)).toBe('booking_intent_key_0001');
    manager.markSucceeded();
    expect(manager.forData(data)).toBe('booking_intent_key_0002');
  });
});

describe('NativeBookingIntentGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the africa-south1 callable with IDs, dates, and no client price', async () => {
    mockCallable.mockResolvedValueOnce({ data: validResponse });

    const result = await new NativeBookingIntentGateway().createIntent(
      data,
      'booking_intent_key_0001',
    );

    expect(mockGetFunctions).toHaveBeenCalledWith(undefined, 'africa-south1');
    expect(mockHttpsCallable).toHaveBeenCalledWith(
      { region: 'africa-south1' },
      'createBookingIntent',
    );
    expect(mockCallable).toHaveBeenCalledWith({
      schemaVersion: 1,
      idempotencyKey: 'booking_intent_key_0001',
      data,
    });
    expect(mockCallable.mock.calls[0]?.[0]).not.toHaveProperty('data.totalKobo');
    expect(result.result.priceSnapshot.renterTotalKobo).toBe(83_160_000);
  });

  it('fails closed when the callable response does not match the contract', async () => {
    mockCallable.mockResolvedValueOnce({
      data: { requestId: 'request-booking-1', result: { state: 'intent_created' } },
    });

    await expect(
      new NativeBookingIntentGateway().createIntent(data, 'booking_intent_key_0001'),
    ).rejects.toBeInstanceOf(CallableContractError);
  });
});
