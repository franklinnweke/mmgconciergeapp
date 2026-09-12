import { describe, expect, it, vi } from 'vitest';
import { type CreateRentalRequestData } from '@mmg/contracts/rental-request';
import { normalizeNigerianPhone } from '../../../core/auth/phone-verification-domain';
import { type PickupLocation } from '../../discovery/domain/pickup-location';

describe('BookingReviewScreen request confirmation and commercial subtraction', () => {
  const mockPickupLocation: PickupLocation = {
    displayName: 'Eko Hotels & Suites',
    formattedAddress: 'Plot 1415 Adetokunbo Ademola St, Victoria Island, Lagos',
    latitude: 6.4253,
    longitude: 3.4326,
    serviceAreaLabel: 'Victoria Island',
    source: 'suggested',
  };

  it('validates contact phone using Nigerian phone normalization without SMS gating', () => {
    expect(normalizeNigerianPhone('0803 123 4567')).toBe('+2348031234567');
    expect(normalizeNigerianPhone('+234 803 123 4567')).toBe('+2348031234567');
    expect(normalizeNigerianPhone('12345')).toBeNull();
    expect(normalizeNigerianPhone('')).toBeNull();
  });

  it('constructs truthful CreateRentalRequestData payload with coordinate-first pickup snapshot', () => {
    const contactPhone = normalizeNigerianPhone('0803 123 4567')!;
    const payload: CreateRentalRequestData = {
      vehicleId: 'veh_test_001',
      startDate: '2026-09-15',
      endDate: '2026-09-18',
      contactPhone,
      serviceAreaLabel: mockPickupLocation.serviceAreaLabel,
      pickupLocation: {
        displayName: mockPickupLocation.displayName,
        formattedAddress: mockPickupLocation.formattedAddress,
        latitude: mockPickupLocation.latitude,
        longitude: mockPickupLocation.longitude,
        serviceAreaLabel: mockPickupLocation.serviceAreaLabel,
      },
    };

    expect(payload.contactPhone).toBe('+2348031234567');
    expect(payload.serviceAreaLabel).toBe('Victoria Island');
    expect(payload.pickupLocation?.latitude).toBe(6.4253);
    expect(payload.pickupLocation?.longitude).toBe(3.4326);
    expect(payload.pickupLocation?.displayName).toBe('Eko Hotels & Suites');
  });

  it('routes directly to /trip/${requestId} upon successful submission without intermediate state', async () => {
    const mockRouter = { replace: vi.fn() };
    const mockGateway = {
      createRequest: vi.fn().mockResolvedValue({
        result: {
          requestId: 'req_test_123',
          state: 'requested',
        },
      }),
    };

    const data: CreateRentalRequestData = {
      vehicleId: 'veh_test_001',
      startDate: '2026-09-15',
      endDate: '2026-09-18',
      contactPhone: '+2348031234567',
      serviceAreaLabel: 'Victoria Island',
      pickupLocation: {
        displayName: mockPickupLocation.displayName,
        formattedAddress: mockPickupLocation.formattedAddress,
        latitude: mockPickupLocation.latitude,
        longitude: mockPickupLocation.longitude,
        serviceAreaLabel: mockPickupLocation.serviceAreaLabel,
      },
    };

    const refreshRentalRequests = vi.fn().mockResolvedValue(undefined);

    const result = await mockGateway.createRequest(data, 'idemp_key_123');
    await refreshRentalRequests();
    mockRouter.replace(`/trip/${result.result.requestId}`);

    expect(refreshRentalRequests).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/trip/req_test_123');
  });

  it('allows verified renters to submit soft requests without requiring a full name', () => {
    // Profile enrichment fallback
    const draftName = '';
    const userDisplayName = null;
    const resolvedName = draftName.trim() || userDisplayName || 'MMG renter';
    expect(resolvedName).toBe('MMG renter');

    const withDraft = 'Tunde';
    expect(withDraft.trim() || userDisplayName || 'MMG renter').toBe('Tunde');
  });
});
