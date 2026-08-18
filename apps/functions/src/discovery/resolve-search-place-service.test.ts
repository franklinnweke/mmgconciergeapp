import { describe, expect, it } from 'vitest';

import { resolveSearchPlaceService } from './resolve-search-place-service';

describe('resolveSearchPlaceService', () => {
  it('resolves Ikoyi location accurately with Lagos coordinates', () => {
    const result = resolveSearchPlaceService({ query: 'Ikoyi' });
    expect(result.areaLabel).toBe('Ikoyi');
    expect(result.displayName).toContain('Ikoyi');
    expect(result.withinLagos).toBe(true);
    expect(result.approxLatitude).toBeCloseTo(6.45, 1);
  });

  it('resolves Victoria Island landmark', () => {
    const result = resolveSearchPlaceService({ query: 'Victoria Island' });
    expect(result.areaLabel).toBe('Victoria Island');
    expect(result.withinLagos).toBe(true);
  });

  it('resolves MMA Airport', () => {
    const result = resolveSearchPlaceService({ query: 'MMA Airport' });
    expect(result.areaLabel).toBe('Ikeja GRA');
    expect(result.displayName).toContain('Airport');
    expect(result.withinLagos).toBe(true);
  });

  it('rejects empty query string', () => {
    expect(() => resolveSearchPlaceService({ query: '   ' })).toThrow();
  });
});
