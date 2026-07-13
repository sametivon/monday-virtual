/**
 * Scene palette (B2): one warm ink-and-paper family shared by every procedural
 * prop, replacing the ad-hoc Flat-UI hexes that made furniture read as game
 * assets. Derived from the product tokens (paper #faf7f2 / ink #211c29 /
 * violet #6c5ce7 / amber #e8a33d) but tuned for lit 3D — mid-tones sit a touch
 * darker than their UI cousins because IBL + bloom lift them.
 *
 * Room/Amphitheater surface colors stay data-driven from the scene config;
 * this palette covers the props whose colors were never meant to be themed.
 */
export const SCENE = {
  /** Paper family — whiteboards, labels, signs. */
  paper: '#fdfcf9',
  paperDim: '#e6e1d8',
  signPaper: '#f2ead9',
  /** Ink family — text, frames, upholstery. */
  ink: '#211c29',
  inkSoft: '#332e3a',
  slate: '#6f6a7c',
  /** Hardware — legs, poles, pedestals, shells. */
  metal: '#4a4550',
  metalDark: '#2b2731',
  /** Panels that are "off" — near-black with a violet cast, not console gray. */
  screen: '#141019',
  screenGlow: '#2a2433',
  /** Brand accents. */
  violet: '#6c5ce7',
  violetSoft: '#b7aef2',
  violetScreen: '#171226',
  violetScreenDim: '#251d3d',
  amber: '#e8a33d',
  /** Materials with a real-world identity. */
  wood: '#7a5a3a',
  theaterWine: '#5e2333',
  portalGlow: '#8b7cf0',
  portalBase: '#231d3a',
  /** Type on dark in-scene screens. */
  textOnScreen: '#e9e5f2',
  textDimOnScreen: '#c9c3d4',
  danger: '#e46a5c',
} as const;
