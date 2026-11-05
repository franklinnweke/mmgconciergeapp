import { describe, expect, it } from 'vitest';
import { colors, darkThemeColors, lightThemeColors, type ThemeColors } from './index';

describe('@mmg/brand theme tokens', () => {
  it('preserves existing colors object identity with darkThemeColors as default', () => {
    expect(colors).toEqual(darkThemeColors);
    expect(colors.canvas).toBe('#080807');
    expect(colors.black).toBe('#040404');
    expect(colors.graphite).toBe('#151515');
    expect(colors.graphiteRaised).toBe('#1D1D1D');
    expect(colors.ivory).toBe('#F7F1E7');
    expect(colors.silver).toBe('#E5E2DC');
    expect(colors.muted).toBe('#B4AEA4');
    expect(colors.gold).toBe('#C9A646');
    expect(colors.goldStrong).toBe('#E3C365');
    expect(colors.line).toBe('rgba(247, 241, 231, 0.12)');
    expect(colors.lineStrong).toBe('rgba(247, 241, 231, 0.22)');
    expect(colors.scrim).toBe('rgba(4, 4, 4, 0.62)');
    expect(colors.success).toBe('#8FAF82');
    expect(colors.danger).toBe('#D18578');
  });

  it('guarantees darkThemeColors and lightThemeColors share the exact same keys', () => {
    const darkKeys = Object.keys(darkThemeColors).sort();
    const lightKeys = Object.keys(lightThemeColors).sort();
    expect(darkKeys).toEqual(lightKeys);
  });

  it('defines all required semantic tokens in ThemeColors', () => {
    const requiredSemanticKeys: Array<keyof ThemeColors> = [
      'canvas',
      'surface',
      'surfaceRaised',
      'surfaceInput',
      'textPrimary',
      'textSecondary',
      'textMuted',
      'textInverse',
      'border',
      'borderStrong',
      'line',
      'lineStrong',
      'primary',
      'primaryStrong',
      'primaryContrast',
      'gold',
      'goldStrong',
      'buttonPrimaryBg',
      'buttonPrimaryText',
      'buttonSecondaryBg',
      'buttonSecondaryText',
      'buttonSecondaryBorder',
      'success',
      'danger',
      'warning',
      'scrim',
      'black',
      'graphite',
      'graphiteRaised',
      'ivory',
      'silver',
      'muted',
    ];

    for (const key of requiredSemanticKeys) {
      expect(darkThemeColors[key]).toBeDefined();
      expect(typeof darkThemeColors[key]).toBe('string');
      expect(lightThemeColors[key]).toBeDefined();
      expect(typeof lightThemeColors[key]).toBe('string');
    }
  });

  it('provides distinct, legible values between light and dark themes', () => {
    // Canvas
    expect(darkThemeColors.canvas).not.toBe(lightThemeColors.canvas);
    expect(darkThemeColors.canvas).toBe('#080807');
    expect(lightThemeColors.canvas).toBe('#F7F5F0');

    // Text primary
    expect(darkThemeColors.textPrimary).toBe('#F7F1E7');
    expect(lightThemeColors.textPrimary).toBe('#141412');

    // Primary button
    expect(darkThemeColors.buttonPrimaryBg).toBe('#F7F1E7');
    expect(darkThemeColors.buttonPrimaryText).toBe('#040404');
    expect(lightThemeColors.buttonPrimaryBg).toBe('#141412');
    expect(lightThemeColors.buttonPrimaryText).toBe('#F7F5F0');
  });
});
