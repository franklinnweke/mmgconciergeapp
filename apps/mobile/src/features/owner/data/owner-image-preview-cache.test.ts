import { describe, expect, it, vi } from 'vitest';
import { createOwnerImagePreviewCache } from './owner-image-preview-cache';
const url = 'https://storage.googleapis.com/test?X-Goog-Signature=keep-me';
function setup(onSessionChange?: (prev: string | null, next: string | null) => void) {
  let now = 0;
  const fetch = vi.fn(async () => ({ url, expiresAt: new Date(now + 300000).toISOString() }));
  const cache = createOwnerImagePreviewCache(fetch, () => now, onSessionChange);
  cache.setSession('owner');
  return { cache, fetch, advance: () => { now += 300000; } };
}
describe('owner preview memory cache', () => {
  it('resolves a private path and preserves the signed query; deduplicates concurrent screens', async () => {
    const { cache, fetch } = setup();
    expect(await Promise.all([cache.resolve('owner', 'v', 'private/path'), cache.resolve('owner', 'v', 'private/path')])).toEqual([url, url]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('leaves public HTTPS URLs unchanged', async () => {
    const { cache, fetch } = setup();
    expect(await cache.resolve('owner', 'v', url)).toBe(url);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns neutral missing-image state without fetching', async () => {
    const { cache, fetch } = setup();
    expect(await cache.resolve('owner', 'v', null)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('refreshes expired URLs and permits one explicit image-error refresh', async () => {
    const { cache, fetch, advance } = setup();
    await cache.resolve('owner', 'v', 'private/path'); advance();
    await cache.resolve('owner', 'v', 'private/path');
    await cache.resolve('owner', 'v', 'private/path', true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('does not return cached previews to a different or signed-out session and invokes session cleanup', async () => {
    const onSessionChange = vi.fn();
    const { cache } = setup(onSessionChange);
    await cache.resolve('owner', 'v', 'private/path');
    cache.setSession(null);
    expect(await cache.resolve('owner', 'v', 'private/path')).toBeNull();
    expect(onSessionChange).toHaveBeenCalledWith('owner', null);
  });
  it('propagates failure for a quiet UI fallback and permits retry', async () => {
    const { cache, fetch } = setup();
    fetch.mockRejectedValueOnce(new Error('unavailable'));
    await expect(cache.resolve('owner', 'v', 'private/path')).rejects.toThrow('unavailable');
    expect(await cache.resolve('owner', 'v', 'private/path', true)).toBe(url);
  });
});
