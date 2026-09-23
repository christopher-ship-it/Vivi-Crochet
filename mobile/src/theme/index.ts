export const colors = {
  pink: '#e8215b',
  pinkDark: '#c8145a',
  pinkSoft: '#fff0f4',
  pinkMist: '#ffe3ec',
  /** Soft lilac used in the page gradient. */
  lilac: '#e8d9f8',
  lilacSoft: '#f3ebfc',
  ink: '#221a1e',
  /** Soft opaque page fill — matches gradient wash; opaque so stack transitions don’t bleed. */
  cream: '#fff0f5',
  canvas: '#fff0f5',
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
  shopCanvas: '#f7f2ef',
  /** Soft fill for image placeholders (not page background). */
  mediaWash: '#f0ebe8',
  /** Warm ivory base behind product photography (cotton texture frame). */
  cottonBase: '#FFFDFB',
};

/** Full-screen pink gradient (soft → lighter pink, no purple shift). */
export const pageGradient = {
  colors: ['#ffc8da', '#ffe0ea', '#fff0f5', '#ffe8f0'] as const,
  locations: [0, 0.35, 0.7, 1] as const,
  start: { x: 0.1, y: 0 },
  end: { x: 0.9, y: 1 },
};

/**
 * Header/hero accent — slightly richer pink at top, fades into the page wash
 * so there is no hard edge.
 */
export const heroGradient = {
  colors: ['rgba(255, 170, 196, 0.55)', 'rgba(255, 208, 224, 0.25)', 'rgba(255, 240, 245, 0)'] as const,
  locations: [0, 0.5, 1] as const,
  start: { x: 0.5, y: 0 },
  end: { x: 0.5, y: 1 },
};

/**
 * Full-page wash for Home, Shop, and Learn (not Live / My Vivi).
 * Soft mixed peach ↔ blush — no hard left/right seam.
 */
export const tabPageGradient = {
  colors: [
    '#f7e7c8',
    '#f5e0cc',
    '#f3d4ce',
    '#efc4d0',
    '#ebb6ca',
    '#e8acc4',
    '#e5a6c0',
  ] as const,
  locations: [0, 0.18, 0.36, 0.52, 0.68, 0.84, 1] as const,
  start: { x: 0.08, y: 0.12 },
  end: { x: 0.92, y: 0.88 },
};

/** Soft cross-fade overlay so peach and blush feel mixed, not banded. */
export const tabPageGradientMix = {
  colors: [
    'rgba(229, 166, 192, 0.42)',
    'rgba(245, 220, 208, 0.18)',
    'rgba(247, 231, 200, 0.32)',
  ] as const,
  locations: [0, 0.5, 1] as const,
  start: { x: 0.9, y: 0.1 },
  end: { x: 0.1, y: 0.9 },
};

/** My Vivi tab hero only — warm diagonal peach → blush. */
export const myViviHeroGradient = {
  colors: ['#f7e7c8', '#f3d5c0', '#f6c4d4', '#f8d6e4'] as const,
  locations: [0, 0.35, 0.7, 1] as const,
  start: { x: 0.1, y: 0 },
  end: { x: 0.95, y: 1 },
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
  /** Body / UI — primary sans. */
  regular: 'Nunito_400Regular',
  semiBold: 'Nunito_600SemiBold',
  /** Heaviest UI weight (Nunito Bold; no ExtraBold loaded). */
  extraBold: 'Nunito_700Bold',
  /** Display / titles — Nunito Bold (replaces former Playfair). */
  display: 'Nunito_700Bold',
  /** Soft body alias — same as regular. */
  decorative: 'Nunito_400Regular',
  nunitoSemi: 'Nunito_600SemiBold',
  nunitoBold: 'Nunito_700Bold',
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
