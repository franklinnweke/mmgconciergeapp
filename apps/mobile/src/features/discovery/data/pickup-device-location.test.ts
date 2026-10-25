import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocationObject } from 'expo-location';
import { acquirePickupFix, isUsablePickupFix, PICKUP_FIX_TIMEOUT_MS } from './pickup-device-location';

const mocks = vi.hoisted(() => ({ watchPositionAsync: vi.fn() }));
vi.mock('expo-location', () => ({ ...mocks, Accuracy: { High: 4 } }));
let callback: (position: LocationObject) => void;
const remove = vi.fn();
const fix = (accuracy = 10, timestamp = Date.now()): LocationObject => ({
  timestamp, coords: { latitude: 6.45, longitude: 3.43, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
});
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  mocks.watchPositionAsync.mockImplementation(async (_options, cb) => { callback = cb; return { remove }; });
});
afterEach(() => vi.useRealTimers());

describe('bounded foreground pickup acquisition', () => {
  it('requests high accuracy and stops once a fresh precise fix arrives', async () => {
    const promise = acquirePickupFix(new AbortController().signal);
    await Promise.resolve(); callback(fix());
    expect((await promise).coords.accuracy).toBe(10);
    expect(mocks.watchPositionAsync).toHaveBeenCalledWith(expect.objectContaining({ accuracy: 4 }), expect.any(Function), expect.any(Function));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('returns the best fresh approximate fix at timeout instead of claiming precision', async () => {
    const promise = acquirePickupFix(new AbortController().signal);
    await Promise.resolve(); callback(fix(300)); callback(fix(120)); callback(fix(200));
    await vi.advanceTimersByTimeAsync(PICKUP_FIX_TIMEOUT_MS);
    expect((await promise).coords.accuracy).toBe(120);
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it('rejects stale, malformed and future fixes', () => {
    expect(isUsablePickupFix(fix(10, Date.now() - 31_000))).toBe(false);
    expect(isUsablePickupFix(fix(10, Date.now() + 60_000))).toBe(false);
    expect(isUsablePickupFix(fix(NaN))).toBe(false);
    expect(isUsablePickupFix({ ...fix(), coords: { ...fix().coords, latitude: NaN } })).toBe(false);
  });
  it('times out without a usable fix and unregisters the watcher', async () => {
    const result = acquirePickupFix(new AbortController().signal).catch(() => null);
    await Promise.resolve(); callback(fix(10, Date.now() - 60_000));
    await vi.advanceTimersByTimeAsync(PICKUP_FIX_TIMEOUT_MS);
    expect(await result).toBeNull(); expect(remove).toHaveBeenCalledTimes(1);
  });
  it('removes a subscription that registers after cancellation', async () => {
    let register!: (value: { remove: typeof remove }) => void;
    mocks.watchPositionAsync.mockImplementationOnce(() => new Promise((resolve) => { register = resolve; }));
    const controller = new AbortController();
    const result = acquirePickupFix(controller.signal).catch(() => null);
    controller.abort(); register({ remove }); await Promise.resolve();
    expect(await result).toBeNull(); expect(remove).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not start native acquisition when already cancelled', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(acquirePickupFix(controller.signal)).rejects.toThrow();
    expect(mocks.watchPositionAsync).not.toHaveBeenCalled();
  });
});
