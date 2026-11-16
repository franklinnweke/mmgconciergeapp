import { contrastRatio, darkThemeColors, lightThemeColors } from '@mmg/brand';
import { describe, expect, it } from 'vitest';

import { checkoutCtaColors } from './checkout-cta-colors';

describe('checkout CTA colour pairing', () => {
  it.each([
    ['dark', darkThemeColors],
    ['light', lightThemeColors],
  ] as const)('meets WCAG AA normal-text contrast in %s mode', (_name, theme) => {
    const { background, foreground } = checkoutCtaColors(theme);
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('no longer uses the failing light pairing (white on #96731B, ~4.41:1)', () => {
    expect(checkoutCtaColors(lightThemeColors).background).not.toBe('#96731B');
  });
});
