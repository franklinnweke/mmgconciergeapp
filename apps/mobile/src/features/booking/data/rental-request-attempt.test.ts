import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeRentalRequestAttempt, prepareRentalRequestAttempt } from './rental-request-attempt';

const mocks = vi.hoisted(() => ({ values: new Map<string, string>(), write: vi.fn(), count: 0 }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => mocks.values.get(key) ?? null,
  setItem: async (key: string, value: string) => { mocks.write(key, value); mocks.values.set(key, value); },
  removeItem: async (key: string) => { mocks.values.delete(key); },
} }));
vi.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'sha256' },
  digestStringAsync: async (_algorithm: string, value: string) => createHash('sha256').update(value).digest('hex'),
  randomUUID: () => `test_uuid_0000000000_${++mocks.count}`,
}));
const data = { vehicleId: 'vehicle-one', startDate: '2026-11-01', endDate: '2026-11-02', contactPhone: '+2348012345678', serviceAreaLabel: 'Ikoyi' as const,
  pickupLocation: { displayName: 'Gate', formattedAddress: 'Private pickup address', latitude: 6.45, longitude: 3.43, serviceAreaLabel: 'Ikoyi' as const, note: 'Private entrance note' } };
beforeEach(() => { mocks.values.clear(); mocks.write.mockClear(); });
describe('durable soft-request retry identity', () => {
  it('recovers the same key on a later screen/process attempt without storing PII', async () => {
    const key = await prepareRentalRequestAttempt('renter-one', data);
    expect(await prepareRentalRequestAttempt('renter-one', { ...data })).toBe(key);
    const stored = [...mocks.values.values()].join();
    expect(stored).not.toContain(data.contactPhone); expect(stored).not.toContain('Private'); expect(stored).not.toContain('6.45');
    expect(Object.keys(JSON.parse([...mocks.values.values()][0]))).toEqual(['hash', 'key']);
  });
  it('isolates identities and rotates for a changed pickup', async () => {
    const first = await prepareRentalRequestAttempt('renter-one', data);
    expect(await prepareRentalRequestAttempt('renter-two', data)).not.toBe(first);
    expect(await prepareRentalRequestAttempt('renter-one', { ...data, pickupLocation: { ...data.pickupLocation, note: 'New entrance' } })).not.toBe(first);
  });
  it('serializes simultaneous identical preparations into one durable key', async () => {
    const keys = await Promise.all([1, 2].map(() => prepareRentalRequestAttempt('renter-one', data)));
    expect(keys[0]).toBe(keys[1]); expect(mocks.write).toHaveBeenCalledOnce();
  });
  it('clears only the successful attempt and never removes a newer edit', async () => {
    const first = await prepareRentalRequestAttempt('renter-one', data);
    const edited = { ...data, pickupLocation: { ...data.pickupLocation, note: 'New entrance' } };
    const second = await prepareRentalRequestAttempt('renter-one', edited);
    await completeRentalRequestAttempt('renter-one', first);
    expect(await prepareRentalRequestAttempt('renter-one', edited)).toBe(second);
    await completeRentalRequestAttempt('renter-one', second);
    expect(await prepareRentalRequestAttempt('renter-one', edited)).not.toBe(second);
  });
});
