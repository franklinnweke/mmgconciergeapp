import { describe, expect, it, vi } from 'vitest';
import { createOwnerImageTimings } from './owner-image-timings';

describe('owner image timings', () => {
  it('measures first-load vs repeat-load duration and url vs image download time', () => {
    let now = 1000;
    const log = vi.fn();
    const timings = createOwnerImageTimings(() => now, log);

    const identity = 'owner-1:veh-1:private/path';

    // Start loading
    timings.start(identity);

    // URL resolved after 300ms
    now += 300;
    timings.markResolved(identity);

    // Image rendered after another 400ms (700ms total)
    now += 400;
    const firstMetric = timings.markLoaded(identity, 'veh-1');

    expect(firstMetric).toEqual({
      identity,
      vehicleId: 'veh-1',
      isRepeat: false,
      startMs: 1000,
      resolveMs: 300,
      imageMs: 400,
      totalMs: 700,
    });
    expect(log).toHaveBeenCalledWith(
      '[OwnerVehicleImage] veh-1 (first-load): total=700ms url=300ms img=400ms',
    );

    // Second load of the same identity (repeat-load)
    now += 5000;
    timings.start(identity);
    now += 10;
    timings.markResolved(identity);
    now += 15;
    const repeatMetric = timings.markLoaded(identity, 'veh-1');

    expect(repeatMetric).toEqual({
      identity,
      vehicleId: 'veh-1',
      isRepeat: true,
      startMs: 6700,
      resolveMs: 10,
      imageMs: 15,
      totalMs: 25,
    });
    expect(log).toHaveBeenCalledWith(
      '[OwnerVehicleImage] veh-1 (repeat-load): total=25ms url=10ms img=15ms',
    );
  });

  it('clears in-flight and seen identities on clear()', () => {
    let now = 1000;
    const log = vi.fn();
    const timings = createOwnerImageTimings(() => now, log);
    const identity = 'owner-1:veh-1:private/path';

    timings.start(identity);
    timings.markLoaded(identity, 'veh-1');
    expect(timings.isRepeat(identity)).toBe(true);

    timings.clear();
    expect(timings.isRepeat(identity)).toBe(false);
    expect(timings.getRecent()).toHaveLength(0);
  });
});
