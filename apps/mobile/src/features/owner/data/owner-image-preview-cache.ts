import type { OwnerVehicleImagePreview } from '@mmg/contracts';

/** Session-scoped, memory-only URLs. Private image bytes must not use disk cache. */
export function createOwnerImagePreviewCache(fetchPreview: (vehicleId: string) => Promise<OwnerVehicleImagePreview>, now = Date.now) {
  let session: string | null = null;
  const cache = new Map<string, Promise<OwnerVehicleImagePreview>>();
  return {
    setSession(uid: string | null) {
      if (session !== uid) { session = uid; cache.clear(); }
    },
    async resolve(uid: string, vehicleId: string, path: string | null, refresh = false): Promise<string | null> {
      if (session !== uid || !path) return null;
      if (/^https?:\/\//.test(path)) return path;
      const key = `${vehicleId}:${path}`;
      if (refresh) cache.delete(key);
      let pending = cache.get(key);
      if (pending) {
        const value = await pending;
        if (Date.parse(value.expiresAt) <= now() + 30_000) { cache.delete(key); pending = undefined; }
      }
      if (!pending) {
        pending = fetchPreview(vehicleId);
        cache.set(key, pending);
      }
      try {
        const value = await pending;
        return session === uid && Date.parse(value.expiresAt) > now() ? value.url : null;
      } catch (error) {
        if (cache.get(key) === pending) cache.delete(key);
        throw error;
      }
    },
  };
}
