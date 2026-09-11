export const colors = {
  pink: '#e8215b',
  pinkDark: '#c8145a',
  pinkSoft: '#fff0f4',
  pinkMist: '#ffe3ec',
  ink: '#221a1e',
  cream: '#ffffff',
  canvas: '#fff7f9',
  muted: '#7a6d72',
  /** Kept for rare video chrome; prefer pink/white elsewhere. */
  dark: '#120e10',
  white: '#ffffff',
  border: '#eadfe3',
  softBorder: '#f0e4e8',
  yellow: '#ffd23c',
  success: '#1a7a4a',
  danger: '#b42318',
  academy: '#fff0f4',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const fonts = {
  regular: 'Archivo_400Regular',
  semiBold: 'Archivo_600SemiBold',
  extraBold: 'Archivo_800ExtraBold',
  /** High-contrast serif for brand wordmark (VIVI). */
  display: 'PlayfairDisplay_700Bold',
  /** Calligraphic Regular — short decorative brand phrases only. */
  decorative: 'Italianno_400Regular',
  /** Script for main screen titles only. */
  heading: 'Niconne_400Regular',
  /** Tangerine Regular — optional accent. */
  tangerine: 'Tangerine_400Regular',
  /** Tangerine Bold — Live supporting phrase. */
  tangerineBold: 'Tangerine_700Bold',
};

export const shadows = {
  soft: {
    shadowColor: '#e8215b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  card: {
    shadowColor: '#221a1e',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
};

/** Brand mark for headers / auth (not splash). */
export const brandLogo = require('../../assets/vivi-brand-logo.png');
