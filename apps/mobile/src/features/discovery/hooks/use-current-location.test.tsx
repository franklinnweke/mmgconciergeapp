import React, { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCurrentLocation } from './use-current-location';

const mocks = vi.hoisted(() => ({ getForegroundPermissionsAsync: vi.fn(), requestForegroundPermissionsAsync: vi.fn(), hasServicesEnabledAsync: vi.fn(), reverseGeocodeAsync: vi.fn(), acquirePickupFix: vi.fn() }));
vi.mock('expo-location', () => ({ ...mocks, PermissionStatus: { GRANTED: 'granted' } }));
vi.mock('../data/pickup-device-location', () => ({ acquirePickupFix: mocks.acquirePickupFix, PICKUP_PRECISE_ACCURACY_METERS: 50 }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let hook: ReturnType<typeof useCurrentLocation>;
let tree: ReactTestRenderer;
function Harness() {
  const value = useCurrentLocation();
  useEffect(() => { hook = value; }, [value]);
  return null;
}
beforeEach(async () => {
  vi.clearAllMocks(); mocks.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mocks.hasServicesEnabledAsync.mockResolvedValue(true); mocks.reverseGeocodeAsync.mockResolvedValue([]);
  mocks.acquirePickupFix.mockResolvedValue({ coords: { latitude: 6.45, longitude: 3.43, accuracy: 10 }, timestamp: Date.now() });
  await act(async () => { tree = create(<Harness />); });
});
afterEach(async () => { await act(async () => tree.unmount()); vi.useRealTimers(); });
describe('current pickup location UX', () => {
  it('keeps search available when permission is denied, without acquiring GPS', async () => {
    mocks.getForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    mocks.requestForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    await act(async () => { expect((await hook.requestCurrentLocation()).success).toBe(false); });
    expect(hook.status).toBe('denied'); expect(mocks.acquirePickupFix).not.toHaveBeenCalled();
  });
  it('returns real coordinates for confirmation and warns when accuracy is approximate', async () => {
    mocks.acquirePickupFix.mockResolvedValueOnce({ coords: { latitude: 6.45, longitude: 3.43, accuracy: 120 } });
    await act(async () => { expect(await hook.requestCurrentLocation()).toMatchObject({ success: true, location: { source: 'current_location', latitude: 6.45, longitude: 3.43 } }); });
    expect(hook.accuracyMessage).toContain('approximate');
  });
  it('directs the renter to manual search when no sufficiently accurate fix is available', async () => {
    mocks.acquirePickupFix.mockRejectedValueOnce(new Error('Location acquisition unavailable.'));
    await act(async () => { expect(await hook.requestCurrentLocation()).toMatchObject({ success: false, reason: 'error', message: expect.stringContaining('search') }); });
    expect(hook.status).toBe('error'); expect(hook.accuracyMessage).toBeNull();
    expect(mocks.reverseGeocodeAsync).not.toHaveBeenCalled();
  });
  it('does not silently substitute a Lagos pickup for an out-of-area fix', async () => {
    mocks.acquirePickupFix.mockResolvedValueOnce({ coords: { latitude: 43.65, longitude: -79.38, accuracy: 10 } });
    await act(async () => { expect(await hook.requestCurrentLocation()).toMatchObject({ success: false, reason: 'outside_lagos' }); });
    expect(hook.status).toBe('outside_lagos');
  });
  it('does not apply a late location result after the sheet is dismissed/reset', async () => {
    let resolve!: (v: unknown) => void;
    mocks.acquirePickupFix.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    let pending!: ReturnType<typeof hook.requestCurrentLocation>;
    await act(async () => { pending = hook.requestCurrentLocation(); });
    await act(async () => hook.reset());
    await act(async () => { resolve({ coords: { latitude: 6.45, longitude: 3.43, accuracy: 10 } }); await pending; });
    expect(hook.status).toBe('idle');
  });
});
