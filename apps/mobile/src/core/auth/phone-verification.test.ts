import { describe, expect, it } from 'vitest';

import { isNigerianE164, normalizeNigerianPhone } from './phone-verification';

describe('renter phone verification helpers', () => {
  it('normalizes common Nigerian mobile formats to E.164', () => {
    expect(normalizeNigerianPhone('0801 234 5678')).toBe('+2348012345678');
    expect(normalizeNigerianPhone('8012345678')).toBe('+2348012345678');
    expect(normalizeNigerianPhone('+234 801 234 5678')).toBe('+2348012345678');
  });

  it('rejects malformed or unsupported numbers', () => {
    expect(normalizeNigerianPhone('12345')).toBeNull();
    expect(normalizeNigerianPhone('+1 416 555 0100')).toBeNull();
  });

  it('recognizes only normalized Nigerian E.164 values as verified candidates', () => {
    expect(isNigerianE164('+2348012345678')).toBe(true);
    expect(isNigerianE164('08012345678')).toBe(false);
    expect(isNigerianE164(null)).toBe(false);
  });
});
