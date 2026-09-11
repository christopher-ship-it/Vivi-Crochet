export const colors = {
  pink: '#e8215b',
  pinkDark: '#c8145a',
  pinkSoft: '#fff0f4',
  pinkMist: '#ffe3ec',
  /** Soft lilac used in the page gradient. */
  lilac: '#e8d9f8',
  lilacSoft: '#f3ebfc',
  ink: '#221a1e',
  /** Page wash under the gradient (fallback / non-gradient contexts). */
  cream: 'transparent',
  canvas: 'transparent',
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
  /** Soft fill for image placeholders (not page background). */
  mediaWash: '#ffe3ec',
};

/** Pink → light purple page background. */
export const pageGradient = {
  colors: ['#ffe4ec', '#f6e7f5', '#ebe0f8'] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

/** Stronger pink wash for headers + heroes (horizontal so stacked bands flow as one). */
export const heroGradient = {
  colors: ['#ffb6cc', '#ffe0ea', '#fff0f5'] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 0 },
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
