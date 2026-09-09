import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CallableContractError } from '../../../core/firebase/parse-callable-result';

import { NativeRentalRequestGateway } from './rental-request-gateway';
import { RentalRequestSubmissionKey } from './rental-request-gateway-core';

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

const createData = {
  vehicleId: 'vehicle-prado-250',
  startDate: '2026-09-18',
  endDate: '2026-09-20',
  contactPhone: '+2348012345678',
  serviceAreaLabel: 'Ikoyi' as const,
};

const priceSnapshot = {
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
};

const vehicleSnapshot = {
  displayName: 'Toyota Land Cruiser Prado 250',
  areaLabel: 'Ikoyi',
  categoryLabel: 'Prado Luxury',
  imageKey: 'prado-graphite',
};

describe('RentalRequestSubmissionKey', () => {
  it('reuses a key for an unchanged retry and rotates when contact details change', () => {
    const keys = ['rental_request_key_0001', 'rental_request_key_0002'];
    const manager = new RentalRequestSubmissionKey(() => keys.shift()!);
    expect(manager.forData(createData)).toBe('rental_request_key_0001');
    expect(manager.forData({ ...createData })).toBe('rental_request_key_0001');
    expect(manager.forData({ ...createData, contactPhone: '+2348098765432' })).toBe('rental_request_key_0002');
  });
});

describe('NativeRentalRequestGateway', () => {
  beforeEach(() => {
    mockCallable.mockReset();
    mockGetFunctions.mockClear();
    mockHttpsCallable.mockClear();
  });

  it('creates a request through the redacted callable and never a Firestore collection write', async () => {
    mockCallable.mockResolvedValue({
      data: {
        requestId: 'request-one',
        result: {
          requestId: 'request-one',
          state: 'requested',
          startDate: createData.startDate,
          endDate: createData.endDate,
          serviceAreaLabel: 'Ikoyi',
          estimatedPriceSnapshot: priceSnapshot,
          vehicleSnapshot,
          version: 1,
          createdAt: '2026-09-09T12:00:00.000Z',
        },
      },
    });

    const result = await new NativeRentalRequestGateway().createRequest(createData, 'create-key-000001');
    expect(mockGetFunctions).toHaveBeenCalledWith(undefined, 'africa-south1');
    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'createRentalRequest');
    expect(result.result.state).toBe('requested');
    expect(mockCallable).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 1,
      idempotencyKey: 'create-key-000001',
      data: createData,
    }));
  });

  it('lists renter requests through listRenterRentalRequests', async () => {
    mockCallable.mockResolvedValue({ data: { requests: [] } });
    await new NativeRentalRequestGateway().listRenterRequests();
    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'listRenterRentalRequests');
  });

  it('lists owner requests through listOwnerRentalRequests', async () => {
    mockCallable.mockResolvedValue({ data: { requests: [] } });
    await new NativeRentalRequestGateway().listOwnerRequests();
    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'listOwnerRentalRequests');
  });

  it('approves and declines through the server-redacted decision callables', async () => {
    mockCallable.mockResolvedValueOnce({
      data: {
        requestId: 'request-one',
        result: {
          requestId: 'request-one',
          state: 'approved',
          version: 2,
          approvedAt: '2026-09-09T12:01:00.000Z',
        },
      },
    });
    await new NativeRentalRequestGateway().approveRequest('request-one', 1, 'approve-key-000001');
    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'approveRentalRequest');

    mockCallable.mockResolvedValueOnce({
      data: {
        requestId: 'request-one',
        result: {
          requestId: 'request-one',
          state: 'declined',
          version: 3,
          declinedAt: '2026-09-09T12:02:00.000Z',
        },
      },
    });
    await new NativeRentalRequestGateway().declineRequest('request-one', 2, 'decline-key-000001', 'Vehicle is already committed.');
    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'declineRentalRequest');
  });

  it('rejects a malformed create response instead of claiming success', async () => {
    mockCallable.mockResolvedValue({ data: { requestId: 'request-one' } });
    await expect(new NativeRentalRequestGateway().createRequest(createData, 'create-key-000001'))
      .rejects.toBeInstanceOf(CallableContractError);
  });
});

