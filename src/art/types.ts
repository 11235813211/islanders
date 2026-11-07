import type { ReactElement } from 'react';
import type { PieceStyle, Resource, Terrain } from '../../shared/types';

/**
 * Everything drawn on the board and cards. Each art version (src/art/vN)
 * exports one `ArtPack`; src/art/index.ts picks the active one. Interaction
 * code (targets, clicks, camera) lives in components and never draws art.
 */
export interface ArtPack {
  version: string;
  terrain: Record<Terrain, { name: string; color: string }>;
  /** `base` frames the card, `light` is the face, `dark` is text and borders. */
  cardColors: Record<Resource, { base: string; light: string; dark: string }>;
  /** Gradients and clip paths, ids prefixed with `uid` so several boards can share a page. */
  ArtDefs: (props: { uid: string }) => ReactElement;
  /** Sea, waves, and the sandy island base under the tiles. */
  SeaBackdrop: (props: { uid: string; hexes: { x: number; y: number }[] }) => ReactElement;
  /** One terrain tile, centered at the origin. */
  HexTile: (props: { uid: string; terrain: Terrain }) => ReactElement;
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
  /** Compass, boat, and gulls drawn over the sea. */
  SeaDecorations: () => ReactElement;
  ResourceIcon: (props: { resource: Resource; size?: number }) => ReactElement;
  /** Large illustration in the middle of a resource card. */
  ResourceArt: (props: { resource: Resource }) => ReactElement;
}
