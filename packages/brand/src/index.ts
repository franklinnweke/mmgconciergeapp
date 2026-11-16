export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeColors {
  // Surfaces & Backgrounds
  canvas: string;
  surface: string;
  surfaceRaised: string;
  surfaceInput: string;

  // Typography & Content
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Lines & Borders
  border: string;
  borderStrong: string;
  line: string;
  lineStrong: string;

  // Brand Accent & Primaries
  primary: string;
  primaryStrong: string;
  primaryContrast: string;
  gold: string;
  goldStrong: string;

  // Buttons & Interactive
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonSecondaryBg: string;
  buttonSecondaryText: string;
  buttonSecondaryBorder: string;

  // Semantics & Overlays
  success: string;
  danger: string;
  warning: string;
  scrim: string;

  // Legacy & Heritage Primitives
  black: string;
  graphite: string;
  graphiteRaised: string;
  ivory: string;
  silver: string;
  muted: string;
}

export const darkThemeColors: ThemeColors = {
  canvas: '#080807',
  surface: '#151515',
  surfaceRaised: '#1D1D1D',
  surfaceInput: '#151515',

  textPrimary: '#F7F1E7',
  textSecondary: '#E5E2DC',
  textMuted: '#B4AEA4',
  textInverse: '#080807',

  border: 'rgba(247, 241, 231, 0.12)',
  borderStrong: 'rgba(247, 241, 231, 0.22)',
  line: 'rgba(247, 241, 231, 0.12)',
  lineStrong: 'rgba(247, 241, 231, 0.22)',

  primary: '#C9A646',
  primaryStrong: '#E3C365',
  primaryContrast: '#040404',
  gold: '#C9A646',
  goldStrong: '#E3C365',

  buttonPrimaryBg: '#F7F1E7',
  buttonPrimaryText: '#040404',
  buttonSecondaryBg: 'transparent',
  buttonSecondaryText: '#F7F1E7',
  buttonSecondaryBorder: 'rgba(247, 241, 231, 0.22)',

  success: '#8FAF82',
  danger: '#D18578',
  warning: '#E6A23C',
  scrim: 'rgba(4, 4, 4, 0.62)',

  black: '#040404',
  graphite: '#151515',
  graphiteRaised: '#1D1D1D',
  ivory: '#F7F1E7',
  silver: '#E5E2DC',
  muted: '#B4AEA4',
};

export const lightThemeColors: ThemeColors = {
  canvas: '#F7F5F0',
  surface: '#FFFFFF',
  surfaceRaised: '#EFECE6',
  surfaceInput: '#EAE6DE',

  textPrimary: '#141412',
  textSecondary: '#4A4742',
  textMuted: '#6E6961',
  textInverse: '#F7F5F0',

  border: 'rgba(20, 20, 18, 0.08)',
  borderStrong: 'rgba(20, 20, 18, 0.16)',
  line: 'rgba(20, 20, 18, 0.08)',
  lineStrong: 'rgba(20, 20, 18, 0.16)',

  // Light accents must carry white button text and act as text on light surfaces
  // at WCAG AA normal-text contrast (>= 4.5:1). #856515 is ~5.4:1 on white and
  // ~5.0:1 on the light canvas; the previous #96731B was ~4.4:1 / ~4.0:1.
  primary: '#856515',
  primaryStrong: '#856515',
  primaryContrast: '#FFFFFF',
  gold: '#856515',
  goldStrong: '#856515',

  buttonPrimaryBg: '#141412',
  buttonPrimaryText: '#F7F5F0',
  buttonSecondaryBg: '#FFFFFF',
  buttonSecondaryText: '#141412',
  buttonSecondaryBorder: 'rgba(20, 20, 18, 0.16)',

  success: '#2E7D32',
  danger: '#C0392B',
  warning: '#B7791F',
  scrim: 'rgba(0, 0, 0, 0.45)',

  black: '#040404',
  graphite: '#FFFFFF',
  graphiteRaised: '#EFECE6',
  ivory: '#141412',
  silver: '#4A4742',
  muted: '#6E6961',
};

export const colors: ThemeColors = darkThemeColors;

function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`contrastRatio requires an opaque #RRGGBB colour, received ${hex}`);
  const [r, g, b] = [0, 2, 4].map((offset) => {
    const channel = parseInt(match[1].slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two opaque #RRGGBB colours. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  section: 64,
} as const;

export const layout = {
  screenGutter: 24,
  sectionGap: 48,
  sectionGapLarge: 64,
  componentGap: 24,
  rowGap: 16,
  itemGap: 12,
  minTouchTarget: 48,
  primaryButtonHeight: 56,
  compactButtonHeight: 44,
  headerHeight: 56,
} as const;

export const radii = {
  none: 0,
  sharp: 0,
  xs: 4,
  sm: 8,
  md: 12,
  button: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: 'PlayfairDisplay_500Medium',
  displayItalic: 'PlayfairDisplay_500Medium_Italic',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
} as const;

export const fontSizes = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  display: 32,
  displayLarge: 40,
} as const;

export const elevation = {
  card: {
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
  },
} as const;
