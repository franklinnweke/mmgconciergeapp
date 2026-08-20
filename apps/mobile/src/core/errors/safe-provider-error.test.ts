import { describe, expect, it } from 'vitest';

import { safeProviderError } from './safe-provider-error';

describe('safeProviderError', () => {
  it('maps known provider codes', () => {
    expect(safeProviderError({ code: 'firestore/unavailable', message: 'SECRET' }, 'fallback')).toContain('unavailable');
    expect(safeProviderError({ code: 'functions/permission-denied' }, 'fallback')).toContain('access');
    expect(safeProviderError({ code: 'NOT_FOUND' }, 'fallback')).toContain('no longer available');
  });

  it('does not treat unrelated code text as a known network error', () => {
    expect(safeProviderError({ code: 'not-networking' }, 'fallback')).toBe('fallback');
  });

  it('does not expose arbitrary provider exception text', () => {
    expect(safeProviderError(new Error('INTERNAL_FIRESTORE_TRACE'), 'Safe fallback')).toBe('Safe fallback');
  });
});
