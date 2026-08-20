import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WebBookingIntentGateway } from './booking-intent-gateway.web';

const { mockCallable, mockGetFunctions, mockHttpsCallable } = vi.hoisted(() => {
  const callable = vi.fn();
  return {
    mockCallable: callable,
    mockGetFunctions: vi.fn((_app?: unknown, region?: string) => ({ region })),
    mockHttpsCallable: vi.fn((_functions: unknown, _name: string) => callable),
  };
});

vi.mock('firebase/functions', () => ({
  getFunctions: mockGetFunctions,
  httpsCallable: mockHttpsCallable,
}));

describe('WebBookingIntentGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the live africa-south1 callable and validates its response', async () => {
    mockCallable.mockResolvedValueOnce({
      data: {
        requestId: 'request-booking-1',
        result: {
          intentId: 'intent-booking-1',
          state: 'intent_created',
          startDate: '2026-08-22',
          endDate: '2026-08-24',
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
      },
    });

    const result = await new WebBookingIntentGateway().createIntent(
      {
        vehicleId: 'vehicle-prado-250',
        startDate: '2026-08-22',
        endDate: '2026-08-24',
      },
      'booking_intent_key_0001',
    );

    expect(mockGetFunctions).toHaveBeenCalledWith(undefined, 'africa-south1');
    expect(mockHttpsCallable).toHaveBeenCalledWith(
      { region: 'africa-south1' },
      'createBookingIntent',
    );
    expect(result.result.intentId).toBe('intent-booking-1');
  });
});
