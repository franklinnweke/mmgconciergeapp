import { describe, expect, it } from 'vitest';
import { pickupDirectionsUrl } from './index';

describe('pickup navigation', () => {
  it('uses the confirmed coordinate, without replacing an entrance with its Place ID', () => {
    const url = new URL(pickupDirectionsUrl({ latitude: 6.426901, longitude: 3.428501 })!);
    expect(url.origin).toBe('https://www.google.com');
    expect(url.searchParams.get('destination')).toBe('6.426901,3.428501');
    expect(url.searchParams.has('destination_place_id')).toBe(false);
  });
  it.each([NaN, Infinity, -Infinity, 90])('does not create directions for invalid latitude %s', (latitude) => {
    expect(pickupDirectionsUrl({ latitude, longitude: 3.42 })).toBeNull();
  });
});
