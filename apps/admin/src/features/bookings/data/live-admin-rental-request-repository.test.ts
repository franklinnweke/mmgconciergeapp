import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireStaffCapability: vi.fn(), getAdminFirestore: vi.fn(), get: vi.fn(), getAll: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/features/auth/server/session', () => ({ requireStaffCapability: mocks.requireStaffCapability }));
vi.mock('@/features/auth/server/firebase-admin', () => ({ getAdminApp: () => ({ options: { projectId: 'mmg-concierge-dev' } }), getAdminFirestore: mocks.getAdminFirestore }));
import { loadDevelopmentRentalRequests } from './live-admin-rental-request-repository';

const pickup = { displayName: 'Gate', formattedAddress: 'Customer gate, Ikoyi', latitude: 6.45, longitude: 3.43, serviceAreaLabel: 'Ikoyi', note: 'Side gate' };
const price = { currency: 'NGN', chargedDays: 1, ownerDailyRateKobo: 10000, baseRentalKobo: 10000, deliveryFeeKobo: 0, serviceFeeBps: 800, serviceFeeFixedKobo: 0, serviceFeeKobo: 800, ownerCommissionBps: 1500, ownerCommissionKobo: 1500, ownerEarningsKobo: 8500, renterTotalKobo: 10800, configVersion: 'v1', termsVersion: 'v1', cancellationPolicyVersion: 'v1' };
const record = { requestId: 'request-one', renterId: 'private-renter', ownerId: 'private-owner', vehicleId: 'car-one', startDate: '2026-10-26', endDate: '2026-10-27', state: 'approved', version: 2, serviceAreaLabel: 'Ikoyi', estimatedPriceSnapshot: price, vehicleSnapshot: { displayName: 'Prado', areaLabel: 'Ikoyi', categoryLabel: 'Executive SUV' }, createdAt: Timestamp.now(), updatedAt: Timestamp.now(), pickupLocation: pickup, confirmedPickupTime: '10:30', internalNotes: 'must-not-leak' };

beforeEach(() => {
  vi.clearAllMocks(); mocks.requireStaffCapability.mockResolvedValue({ uid: 'staff-one', roles: ['support'] });
  const query = { orderBy: () => query, limit: () => query, get: mocks.get };
  mocks.getAdminFirestore.mockReturnValue({ collection: () => query, doc: (path: string) => path, getAll: mocks.getAll });
  mocks.get.mockResolvedValue({ empty: false, docs: [{ id: 'request-one', data: () => record }] });
  mocks.getAll.mockResolvedValue([{ id: 'request-one', exists: true, data: () => ({ requestId: 'request-one', renterId: 'private-renter', contactPhone: '+2348012345678' }) }]);
});
describe('authorized pickup dispatch projection', () => {
  it('checks dispatch capability and serializes only the validated pickup allowlist', async () => {
    const result = await loadDevelopmentRentalRequests();
    expect(mocks.requireStaffCapability).toHaveBeenCalledWith('bookings.manage_requests');
    expect(result.requests[0]).toMatchObject({ pickupLocation: pickup, confirmedPickupTime: '10:30' });
    expect(result.requests[0]).not.toHaveProperty('internalNotes');
    expect(result.requests[0]).not.toHaveProperty('renterId');
  });
  it('denies before any private Firestore read', async () => {
    mocks.requireStaffCapability.mockRejectedValueOnce(new Error('denied'));
    await expect(loadDevelopmentRentalRequests()).rejects.toThrow('denied');
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
  });
  it('does not invent a pickup for historical records or serialize malformed coordinates', async () => {
    mocks.get.mockResolvedValue({ empty: false, docs: [{ id: 'request-one', data: () => ({ ...record, pickupLocation: { ...pickup, latitude: 'wrong' }, confirmedPickupTime: '25:00' }) }] });
    const result = await loadDevelopmentRentalRequests();
    expect(result.requests[0]).not.toHaveProperty('pickupLocation');
    expect(result.requests[0]).not.toHaveProperty('confirmedPickupTime');
  });
});
