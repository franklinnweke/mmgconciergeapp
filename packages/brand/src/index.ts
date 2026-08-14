export const colors = {
  black: '#040404',
  graphite: '#151515',
  graphiteRaised: '#1D1D1D',
  ivory: '#F7F1E7',
  silver: '#E5E2DC',
  muted: '#B4AEA4',
  gold: '#C9A646',
  goldStrong: '#E3C365',
  line: 'rgba(247, 241, 231, 0.12)',
  lineStrong: 'rgba(247, 241, 231, 0.22)',
  scrim: 'rgba(4, 4, 4, 0.62)',
  success: '#8FAF82',
  danger: '#D18578',
} as const;

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

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
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
