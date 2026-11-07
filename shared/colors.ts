import { PLAYER_COLOR_IDS, type PlayerColor } from './types';

/**
 * Seat colors. `fill` paints pieces and swatches; `ink` is readable text on
 * top of `fill`; `accent` is `fill` darkened where needed to show on the light
 * UI (borders, tints). Board pieces also get a light halo (see src/art), so
 * fills can stay saturated without disappearing into tiles of a similar hue.
 */
export const PLAYER_COLORS: Record<PlayerColor, { label: string; fill: string; ink: string; accent: string }> = {
  white: { label: 'White', fill: '#f7f4ec', ink: '#22323b', accent: '#8b8577' },
  orange: { label: 'Orange', fill: '#f5850f', ink: '#2b1702', accent: '#e07507' },
  red: { label: 'Red', fill: '#d42f2a', ink: '#ffffff', accent: '#d42f2a' },
  blue: { label: 'Blue', fill: '#1f4fd6', ink: '#ffffff', accent: '#1f4fd6' },
  green: { label: 'Green', fill: '#0c9a6a', ink: '#ffffff', accent: '#0c9a6a' },
  brown: { label: 'Brown', fill: '#7a4822', ink: '#ffffff', accent: '#7a4822' },
  black: { label: 'Black', fill: '#24272d', ink: '#ffffff', accent: '#24272d' },
  purple: { label: 'Purple', fill: '#8a3cd8', ink: '#ffffff', accent: '#8a3cd8' },
};

/** CSS variables for a seat: --player-color, --player-ink, --player-accent. */
export function playerVars(id: PlayerColor | undefined, prefix = 'player'): Record<string, string> {
  const color = playerColor(id);
  return { [`--${prefix}-color`]: color.fill, [`--${prefix}-ink`]: color.ink, [`--${prefix}-accent`]: color.accent };
}

/** New seats take the first free color in this order. */
export const DEFAULT_COLOR_ORDER: readonly PlayerColor[] = [
  'red',
  'blue',
  'white',
  'orange',
  'green',
  'purple',
  'brown',
  'black',
];

export function isPlayerColor(value: unknown): value is PlayerColor {
  return PLAYER_COLOR_IDS.includes(value as PlayerColor);
}

export function playerColor(id: PlayerColor | undefined) {
  return PLAYER_COLORS[id && isPlayerColor(id) ? id : 'red'];
}

export function firstFreeColor(taken: Iterable<PlayerColor>): PlayerColor {
  const used = new Set(taken);
  return DEFAULT_COLOR_ORDER.find(color => !used.has(color)) ?? DEFAULT_COLOR_ORDER[0]!;
}
