import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CallableContractError } from '../../../core/firebase/parse-callable-result';
import { NativeOwnerRentalRequestGateway } from './owner-rental-request-gateway';

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

const priceSnapshot = {
  currency: 'NGN' as const,
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
};

const vehicleSnapshot = {
  displayName: 'Toyota Land Cruiser Prado 250',
  areaLabel: 'Ikoyi' as const,
  categoryLabel: 'Prado Luxury',
  imageKey: 'hero-suv' as const,
};

describe('NativeOwnerRentalRequestGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls listOwnerRentalRequests callable and parses requests without renter PII', async () => {
    const validList = {
      requests: [
        {
          requestId: 'req-1',
          vehicleId: 'vehicle-prado-250',
          startDate: '2026-08-22',
          endDate: '2026-08-24',
          serviceAreaLabel: 'Ikoyi',
          state: 'requested',
          version: 1,
          estimatedPriceSnapshot: priceSnapshot,
          vehicleSnapshot,
          createdAt: '2026-08-20T15:00:00.000Z',
          updatedAt: '2026-08-20T15:00:00.000Z',
        },
      ],
    };
    mockCallable.mockResolvedValueOnce({ data: validList });

    const gateway = new NativeOwnerRentalRequestGateway();
    const result = await gateway.listRequests();

    expect(mockGetFunctions).toHaveBeenCalledWith(undefined, 'africa-south1');
    expect(mockHttpsCallable).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'africa-south1' }),
      'listOwnerRentalRequests',
    );
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]?.requestId).toBe('req-1');
  });

  it('calls approveRentalRequest callable', async () => {
    const validApprove = {
      requestId: 'req-1',
      result: {
        requestId: 'req-1',
        state: 'approved',
        version: 2,
        approvedAt: '2026-08-20T15:10:00.000Z',
      },
    };
    mockCallable.mockResolvedValueOnce({ data: validApprove });

    const gateway = new NativeOwnerRentalRequestGateway();
    const result = await gateway.approve('req-1', 1);

    expect(mockHttpsCallable).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'africa-south1' }),
      'approveRentalRequest',
    );
    expect(result.result.state).toBe('approved');
    expect(result.result.version).toBe(2);
  });

  it('calls declineRentalRequest callable', async () => {
    const validDecline = {
      requestId: 'req-1',
      result: {
        requestId: 'req-1',
        state: 'declined',
        version: 2,
        declinedAt: '2026-08-20T15:10:00.000Z',
      },
    };
    mockCallable.mockResolvedValueOnce({ data: validDecline });

    const gateway = new NativeOwnerRentalRequestGateway();
    const result = await gateway.decline('req-1', 1, 'Car unavailable');

    expect(mockHttpsCallable).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'africa-south1' }),
      'declineRentalRequest',
    );
    expect(result.result.state).toBe('declined');
  });

  it('fails closed when response does not match contract', async () => {
    mockCallable.mockResolvedValueOnce({ data: { corrupted: true } });

    const gateway = new NativeOwnerRentalRequestGateway();
    await expect(gateway.listRequests()).rejects.toBeInstanceOf(CallableContractError);
  });
});
