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
    expect(result.areaLabel).toBe('Ikeja');
    expect(result.displayName).toContain('Airport');
    expect(result.withinLagos).toBe(true);
  });

  it('resolves Wheatbaker landmark with exact coordinates', () => {
    const result = resolveSearchPlaceService({ query: 'Wheatbaker' });
    expect(result.areaLabel).toBe('Ikoyi');
    expect(result.displayName).toContain('Wheatbaker');
    expect(result.withinLagos).toBe(true);
    expect(result.approxLatitude).toBeCloseTo(6.4485, 2);
  });

  it('resolves ExecuJet Private Terminal', () => {
    const result = resolveSearchPlaceService({ query: 'ExecuJet' });
    expect(result.areaLabel).toBe('Ikeja');
    expect(result.displayName).toContain('ExecuJet');
    expect(result.withinLagos).toBe(true);
  });

  it('rejects empty query string', () => {
    expect(() => resolveSearchPlaceService({ query: '   ' })).toThrow();
  });

  it('fails closed and throws NOT_FOUND for unknown locations without synthesizing fake address', () => {
    expect(() => resolveSearchPlaceService({ query: 'unknown non-existent location xyz 12345' })).toThrow(
      'Could not resolve a Lagos landmark for this search query.',
    );
  });

  it('correctly prioritizes Lekki Phase 1 over Lekki when searching Lekki Phase 1', () => {
    const result = resolveSearchPlaceService({ query: 'Lekki Phase 1' });
    expect(result.areaLabel).toBe('Lekki Phase 1');
    expect(result.displayName).toBe('Lekki Phase 1, Lagos');
    expect(result.approxLongitude).toBeCloseTo(3.4738, 3);
  });

  it('resolves Lekki when searching Lekki', () => {
    const result = resolveSearchPlaceService({ query: 'Lekki' });
    expect(result.areaLabel).toBe('Lekki');
  });

  it('rejects airport abuja and other out-of-area non-Lagos queries fail-closed', () => {
    expect(() => resolveSearchPlaceService({ query: 'airport abuja' })).toThrow(
      "Location 'airport abuja' is outside the MMG Lagos service area.",
    );
    expect(() => resolveSearchPlaceService({ query: 'Abuja' })).toThrow(
      "outside the MMG Lagos service area.",
    );
    expect(() => resolveSearchPlaceService({ query: 'London' })).toThrow(
      "outside the MMG Lagos service area.",
    );
    expect(() => resolveSearchPlaceService({ query: 'Ibadan' })).toThrow(
      "outside the MMG Lagos service area.",
    );
  });
});
