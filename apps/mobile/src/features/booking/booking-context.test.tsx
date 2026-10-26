import React, { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingProvider, useBookings } from './booking-context';
import TripsScreen from './screens/trips-screen';
import { previewRenterTrips } from './data/preview-renter-trips';
import type { RenterVisibleRentalRequest } from '@mmg/contracts/rental-request';

const mocks = vi.hoisted(() => ({
  auth: { user: { uid: 'renter-one' } as { uid: string } | null, signingOut: false },
  list: vi.fn(), vehicle: vi.fn(), listeners: new Set<(state: string) => void>(),
  appState: { currentState: 'active' },
}));
vi.mock('@/core/auth/auth-context', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/features/discovery/data/firestore-discovery-gateway', () => ({ createDiscoveryGateway: () => ({ getVehicleById: mocks.vehicle }) }));
vi.mock('./data/rental-request-gateway', () => ({ createRentalRequestGateway: () => ({ listRenterRequests: mocks.list }) }));
vi.mock('./data/firestore-booking-request-store', () => ({ bookingRemoteEnabled: false }));
vi.mock('./data/firestore-renter-trip-repository', () => ({ renterTripRemoteEnabled: false }));
vi.mock('./data/local-booking-request-store', () => ({ loadLocalBookingRequests: async () => [], saveLocalBookingRequests: vi.fn() }));
vi.mock('react-native', () => ({
  AppState: { get currentState() { return mocks.appState.currentState; }, addEventListener: (_event: string, listener: (state: string) => void) => { mocks.listeners.add(listener); return { remove: () => mocks.listeners.delete(listener) }; } },
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('expo-image', () => ({ Image: 'Image' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
vi.mock('@/components/screen-header', () => ({ ScreenHeader: 'ScreenHeader' }));
vi.mock('@/components/pressable-scale', () => ({ PressableScale: 'PressableScale' }));
vi.mock('@/features/discovery/data/vehicle-images', () => ({ resolveVehicleImageSource: (value: { imageUrl?: string }) => ({ uri: value.imageUrl }) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const seed = previewRenterTrips[0];
const request: RenterVisibleRentalRequest = {
  requestId: 'request-one', vehicleId: seed.vehicleId, startDate: seed.startDate, endDate: seed.endDate,
  serviceAreaLabel: 'Ikoyi', state: 'requested', version: 1,
  estimatedPriceSnapshot: seed.priceSnapshot, vehicleSnapshot: { ...seed.vehicleSnapshot, imageUrl: undefined },
  createdAt: '2026-10-26T10:00:00Z', updatedAt: '2026-10-26T10:00:00Z',
};
let value: ReturnType<typeof useBookings>;
let tree: ReactTestRenderer | undefined;
function Probe() { const current = useBookings(); useEffect(() => { value = current; }, [current]); return null; }
async function mount(showTrips = false) {
  await act(async () => { tree = create(<BookingProvider><Probe />{showTrips ? <TripsScreen /> : null}</BookingProvider>); });
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mocks.listeners.clear();
  mocks.auth.user = { uid: 'renter-one' }; mocks.auth.signingOut = false; mocks.appState.currentState = 'active';
  mocks.list.mockResolvedValue({ requests: [] }); mocks.vehicle.mockResolvedValue(null);
});
afterEach(async () => { if (tree) await act(async () => tree!.unmount()); tree = undefined; vi.useRealTimers(); });
describe('booking provider lifecycle and image ownership', () => {
  it('pauses background polling and refreshes on foreground return', async () => {
    await mount(); expect(mocks.list).toHaveBeenCalledOnce();
    await act(async () => { mocks.appState.currentState = 'background'; mocks.listeners.forEach((fn) => fn('background')); await vi.advanceTimersByTimeAsync(45_000); });
    expect(mocks.list).toHaveBeenCalledOnce();
    await act(async () => { mocks.appState.currentState = 'active'; mocks.listeners.forEach((fn) => fn('active')); });
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });
  it('clears only its request-refresh error after a successful retry', async () => {
    mocks.list.mockRejectedValueOnce(new Error('offline')); await mount(); expect(value.syncError).toContain('could not be refreshed');
    await act(async () => { await value.refreshRentalRequests(); }); expect(value.syncError).toBeNull();
  });
  it('does not apply a response from a signed-out account', async () => {
    let resolve!: (value: { requests: RenterVisibleRentalRequest[] }) => void;
    mocks.list.mockReturnValueOnce(new Promise((done) => { resolve = done; })); await mount();
    await act(async () => { mocks.auth.user = null; tree!.update(<BookingProvider><Probe /></BookingProvider>); });
    await act(async () => { resolve({ requests: [request] }); }); expect(value.trips).toEqual([]);
  });
  it('resolves a missing historical image in the provider only, not again in Trips', async () => {
    mocks.list.mockResolvedValue({ requests: [request] }); await mount(true);
    expect(mocks.vehicle).toHaveBeenCalledExactlyOnceWith(request.vehicleId);
    await act(async () => { await value.refreshRentalRequests(); });
    expect(mocks.vehicle).toHaveBeenCalledOnce();
    expect(JSON.stringify(tree!.toJSON())).toContain('image unavailable');
  });
});
