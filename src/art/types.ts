import type { ReactElement } from 'react';
import type { BaseTerrain, PieceStyle, Resource, SeaTerrain } from '../../shared/types';

/**
 * Everything drawn on the board and cards. Each art version (src/art/vN)
 * exports one `ArtPack`; src/art/index.ts picks the active one. Interaction
 * code (targets, clicks, camera) lives in components and never draws art.
 */
export interface ArtPack {
  version: string;
  terrain: Record<BaseTerrain, { name: string; color: string }>;
  /** `base` frames the card, `light` is the face, `dark` is text and borders. */
  cardColors: Record<Resource, { base: string; light: string; dark: string }>;
  /** Gradients and clip paths, ids prefixed with `uid` so several boards can share a page. */
  ArtDefs: (props: { uid: string }) => ReactElement;
  /** Sea, waves, and the sandy island base under the tiles. `frame` is the board's drawing area (default 670×600 at the origin). */
  SeaBackdrop: (props: { uid: string; hexes: { x: number; y: number }[]; frame?: Frame }) => ReactElement;
  /** One terrain tile, centered at the origin. */
  HexTile: (props: { uid: string; terrain: BaseTerrain }) => ReactElement;
  NumberToken: (props: { uid: string; number: number }) => ReactElement;
  /** Pier lines from the two coastal corners plus the sign at `at`. */
  Harbor: (props: {
    resource: Resource | 'any';
    at: { x: number; y: number };
    corners: { x: number; y: number }[];
  }) => ReactElement;
  Road: (props: { from: { x: number; y: number }; to: { x: number; y: number }; color: string }) => ReactElement;
  /** Share of an edge left bare at each end of a road; road targets match it. Before v6: 0.19. */
  roadInset?: number;
  /** A settlement or city. Versions before v5 draw one style and ignore `style`. */
  BuildingPiece: (props: { color: string; city: boolean; style?: PieceStyle }) => ReactElement;
  Robber: () => ReactElement;
  /** Compass, boat, and gulls drawn over the sea, near the corners of `frame`. */
  SeaDecorations: (props: { frame?: Frame }) => ReactElement;
  ResourceIcon: (props: { resource: Resource; size?: number }) => ReactElement;
  /** Large illustration in the middle of a resource card. */
  ResourceArt: (props: { resource: Resource }) => ReactElement;
  /** Sea-map tiles and pieces. Versions before v7 leave this out and borrow v7's. */
  sea?: SeaArt;
}

/** A rectangle in board units. */
export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tiles in `SeaArt.terrain`: the sea-map terrains plus `land`, the editor's not-yet-chosen land. */
export type SeaTileKind = SeaTerrain | 'land';

/** Art for sea maps. Each tile lives in its own file in src/art/vN/sea so it is easy to tweak. */
export interface SeaArt {
  terrain: Record<SeaTileKind, { name: string; color: string }>;
  /** Gradients the sea tiles use, ids prefixed with `uid`. */
  Defs: (props: { uid: string }) => ReactElement;
  /** One tile centered at the origin. `variant` (any integer) varies repeated tiles such as open sea. */
  SeaTile: (props: { uid: string; terrain: SeaTileKind; variant?: number }) => ReactElement;
  /** The sandy shore under each land tile of an island. */
  IslandBase: (props: { uid: string; hexes: { x: number; y: number }[] }) => ReactElement;
  /** A ship along the edge from `from` to `to`. */
  Ship: (props: { from: { x: number; y: number }; to: { x: number; y: number }; color: string }) => ReactElement;
  Pirate: () => ReactElement;
  /** Bonus points for first settling the island, drawn on one of its tiles. */
  BonusChip: (props: { points: number }) => ReactElement;
  /** A jungle discovery, for hands and logs. */
  DiscoveryIcon: (props: { size?: number }) => ReactElement;
}
