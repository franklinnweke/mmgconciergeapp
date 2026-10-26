import { describe, expect, it, vi } from 'vitest';
import type { ListRenterRentalRequestsResult } from '@mmg/contracts/rental-request';
import { createRentalRequestRefresh } from './rental-request-refresh';

const result: ListRenterRentalRequestsResult = { requests: [] };
function deferred() {
  let resolve!: (value: ListRenterRentalRequestsResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ListRenterRentalRequestsResult>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
describe('session-scoped rental request refresh', () => {
  it('deduplicates overlapping poll/foreground reads', async () => {
    const read = deferred(); const load = vi.fn(() => read.promise); const apply = vi.fn();
    const reader = createRentalRequestRefresh({ load, apply, failed: vi.fn() });
    const first = reader.refresh(); const second = reader.refresh();
    expect(first).toBe(second); expect(load).toHaveBeenCalledOnce();
    read.resolve(result); await first; expect(apply).toHaveBeenCalledExactlyOnceWith(result);
  });
  it('queues one fresh read after a mutation and waits for that authoritative result', async () => {
    const old = deferred(); const current = deferred(); const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const apply = vi.fn(); const reader = createRentalRequestRefresh({ load, apply, failed: vi.fn() });
    const initial = reader.refresh(); const mutation = reader.refresh(true); reader.refresh(true);
    old.resolve(result); await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
    const latest = { requests: [...result.requests] }; current.resolve(latest);
    await Promise.all([initial, mutation]); expect(apply.mock.calls.at(-1)?.[0]).toBe(latest);
  });
  it('ignores a late response after sign-out, user change or unmount', async () => {
    const read = deferred(); const apply = vi.fn(); const failed = vi.fn();
    const reader = createRentalRequestRefresh({ load: () => read.promise, apply, failed });
    const promise = reader.refresh(); reader.dispose(); read.resolve(result); await promise;
    expect(apply).not.toHaveBeenCalled(); expect(failed).not.toHaveBeenCalled();
  });
  it('surfaces failure, permits retry and applies the next success', async () => {
    const error = new Error('offline'); const load = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(result);
    const apply = vi.fn(); const failed = vi.fn(); const reader = createRentalRequestRefresh({ load, apply, failed });
    await expect(reader.refresh()).rejects.toBe(error); expect(failed).toHaveBeenCalledExactlyOnceWith(error);
    await reader.refresh(); expect(apply).toHaveBeenCalledExactlyOnceWith(result);
  });
  it('does not restart disposed readers or apply late failures', async () => {
    const read = deferred(); const load = vi.fn(() => read.promise); const failed = vi.fn();
    const reader = createRentalRequestRefresh({ load, failed, apply: vi.fn() });
    const promise = reader.refresh(); reader.dispose(); read.reject(new Error('late failure')); await promise;
    await reader.refresh(true); expect(load).toHaveBeenCalledOnce(); expect(failed).not.toHaveBeenCalled();
  });
});
