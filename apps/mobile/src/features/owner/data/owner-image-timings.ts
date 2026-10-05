import { recordBreadcrumb } from '../../../core/diagnostics/diagnostic-tracker';

export type OwnerImageTimingEntry = {
  identity: string;
  vehicleId: string;
  isRepeat: boolean;
  startMs: number;
  resolveMs: number;
  imageMs: number;
  totalMs: number;
};

export function createOwnerImageTimings(
  now = Date.now,
  log: (message: string) => void = console.info,
) {
  const inFlight = new Map<string, { startMs: number; resolveMs?: number }>();
  const seenIdentities = new Set<string>();
  const recent: OwnerImageTimingEntry[] = [];

  return {
    start(identity: string) {
      if (!inFlight.has(identity)) {
        inFlight.set(identity, { startMs: now() });
      }
    },
    markResolved(identity: string) {
      const entry = inFlight.get(identity);
      if (entry && entry.resolveMs === undefined) {
        entry.resolveMs = Math.max(0, now() - entry.startMs);
      }
    },
    markLoaded(identity: string, vehicleId: string): OwnerImageTimingEntry | null {
      const entry = inFlight.get(identity);
      const startMs = entry?.startMs ?? now();
      const totalMs = Math.max(0, now() - startMs);
      const resolveMs = entry?.resolveMs ?? totalMs;
      const imageMs = Math.max(0, totalMs - resolveMs);
      const isRepeat = seenIdentities.has(identity);
      seenIdentities.add(identity);
      inFlight.delete(identity);

      const timing: OwnerImageTimingEntry = {
        identity,
        vehicleId,
        isRepeat,
        startMs,
        resolveMs,
        imageMs,
        totalMs,
      };

      recent.push(timing);
      if (recent.length > 30) recent.shift();

      log(
        `[OwnerVehicleImage] ${vehicleId} (${isRepeat ? 'repeat-load' : 'first-load'}): total=${totalMs}ms url=${resolveMs}ms img=${imageMs}ms`,
      );
      recordBreadcrumb(
        'owner_image',
        `${vehicleId} (${isRepeat ? 'repeat' : 'first'}) total=${totalMs}ms url=${resolveMs}ms img=${imageMs}ms`,
        { vehicleId, isRepeat, totalMs, resolveMs, imageMs },
      );

      return timing;
    },
    clear() {
      inFlight.clear();
      seenIdentities.clear();
      recent.length = 0;
    },
    getRecent(): readonly OwnerImageTimingEntry[] {
      return [...recent];
    },
    isRepeat(identity: string): boolean {
      return seenIdentities.has(identity);
    },
  };
}

export const ownerImageTimings = createOwnerImageTimings();
