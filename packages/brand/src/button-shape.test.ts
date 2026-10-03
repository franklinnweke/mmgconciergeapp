import { describe, expect, it } from 'vitest';
import { layout, radii } from './index';

describe('mobile action button shape', () => {
  it('uses softly rounded rectangular action buttons, not pills', () => {
    expect(radii.button).toBe(12);
    expect(radii.button).toBeLessThan(layout.compactButtonHeight / 2);
  });

  it('preserves circular control tokens and accessible button heights', () => {
    expect(radii.pill).toBe(999);
    expect(layout.compactButtonHeight).toBeGreaterThanOrEqual(44);
    expect(layout.primaryButtonHeight).toBeGreaterThanOrEqual(44);
  });
});
