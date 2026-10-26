import * as Location from 'expo-location';
import { MAX_ARRIVAL_RADIUS_METERS } from '../domain/arrival-perimeter';

export const PICKUP_FIX_TIMEOUT_MS = 15_000;
export const PICKUP_FIX_MAX_AGE_MS = 30_000;
export const PICKUP_PRECISE_ACCURACY_METERS = 50;
// A fallback estimate must be correctable within the existing pickup map radius.
export const PICKUP_MAX_ACCURACY_METERS = MAX_ARRIVAL_RADIUS_METERS;

export function isUsablePickupFix(position: Location.LocationObject, now = Date.now()): boolean {
  const { latitude, longitude, accuracy } = position.coords;
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    && accuracy !== null && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= PICKUP_MAX_ACCURACY_METERS
    && Number.isFinite(position.timestamp) && position.timestamp <= now + 5_000
    && now - position.timestamp <= PICKUP_FIX_MAX_AGE_MS;
}

/** A bounded foreground acquisition, not live tracking. Every exit stops the watcher. */
export function acquirePickupFix(signal: AbortSignal): Promise<Location.LocationObject> {
  return new Promise((resolve, reject) => {
    let best: Location.LocationObject | null = null;
    let subscription: Location.LocationSubscription | undefined;
    let settled = false;
    const finish = (position?: Location.LocationObject) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      subscription?.remove();
      if (position && !signal.aborted && isUsablePickupFix(position)) resolve(position);
      else reject(new Error('Location acquisition unavailable.'));
    };
    const cancel = () => finish();
    const timer = setTimeout(() => finish(best ?? undefined), PICKUP_FIX_TIMEOUT_MS);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) { finish(); return; }
    void Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1_000, distanceInterval: 0 }, (position) => {
      if (settled || !isUsablePickupFix(position)) return;
      if (!best || position.coords.accuracy! < best.coords.accuracy!) best = position;
      if (position.coords.accuracy! <= PICKUP_PRECISE_ACCURACY_METERS) finish(position);
    }, () => finish(best ?? undefined)).then((watcher) => {
      subscription = watcher;
      // Native registration can finish after timeout/cancellation/first callback.
      if (settled) watcher.remove();
    }).catch(() => finish(best ?? undefined));
  });
}
