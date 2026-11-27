import type { ReactElement } from 'react';
import type { Track } from '../../shared/knights';
import type { BaseTerrain, CLASSIC_RESOURCES, Commodity, PieceStyle, Resource, SeaTerrain } from '../../shared/types';

/** The base game's resources: what every version draws. Lodestone comes from `cartographers`. */
export type ClassicResource = (typeof CLASSIC_RESOURCES)[number];

/**
 * Everything drawn on the board and cards. Each art version (src/art/vN)
 * exports one `ArtPack`; src/art/index.ts picks the active one. Interaction
 * code (targets, clicks, camera) lives in components and never draws art.
 */
export interface ArtPack {
  version: string;
  terrain: Record<BaseTerrain, { name: string; color: string }>;
  /** `base` frames the card, `light` is the face, `dark` is text and borders. */
  cardColors: Record<ClassicResource, CardColors>;
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
  /** A megacity: three buildings. Versions before v19 leave this out and borrow v19's. */
  MegacityPiece?: (props: { color: string; style?: PieceStyle }) => ReactElement;
  Robber: () => ReactElement;
  /** Compass, boat, and gulls drawn over the sea, near the corners of `frame`. */
  SeaDecorations: (props: { frame?: Frame }) => ReactElement;
  ResourceIcon: (props: { resource: ClassicResource; size?: number }) => ReactElement;
  /** Large illustration in the middle of a resource card. */
  ResourceArt: (props: { resource: ClassicResource }) => ReactElement;
  /** Cartographers art. Versions before v14 leave this out and borrow v14's. */
  cartographers?: CartographersArt;
  /** Sea-map tiles and pieces. Versions before v7 leave this out and borrow v7's. */
  sea?: SeaArt;
  /** Cities & Knights art. Versions before v18 leave this out and borrow v18's. */
  knights?: KnightsArt;
  /** The Christmas look. Versions before v20 leave this out and borrow v20's. */
  christmas?: ChristmasArt;
}

/** The Christmas look: winter tiles, the North Pole, Santa's sleigh, and card decorations. */
export interface ChristmasArt {
  /** A base tile in winter, centered at the origin; `seed` varies its motion. */
  WinterTile: (props: {
    uid: string;
    terrain: BaseTerrain;
    seed?: number;
    /** The roll's id when this tile just paid out: it plays its motion once. */
    paid?: number;
  }) => ReactElement;
  /** A winter tile's standing figures (the desert's polar bear), drawn above trains and pieces. Versions before v23 leave it out. */
  TileFigure?: (props: { terrain: BaseTerrain }) => ReactElement | null;
  /** Santa's home, centered at the origin. */
  NorthPoleTile: (props: { uid: string }) => ReactElement;
  /** Drawn under the North Pole's number token, at its origin. */
  NorthPoleRing: () => ReactElement;
  /** Santa's sleigh and reindeer, facing right. */
  Sleigh: () => ReactElement;
  /** Holly and snow over a resource card's art. */
  CardDecor: () => ReactElement;
  /** A Christmas card face for some resources (lumber, wool); null keeps the usual art. */
  CardArt: (props: { resource: string }) => ReactElement | null;
  /** Christmas Candy: a standard resource card's face and small icon. Versions before v23 leave these out. */
  CandyCardArt?: (props: { resource: ClassicResource }) => ReactElement;
  CandyIcon?: (props: { resource: ClassicResource; size?: number }) => ReactElement;
  /** The logo's mark: a decorated pine with a star, centered at the origin (about ±15 by -32..12). */
  LogoTree: () => ReactElement;
  /** The robber in a Christmas room: the Grinch, in the usual robber's footprint. */
  Robber: () => ReactElement;
  /** Seconds to fly to a building, and to stay there before leaving. */
  sleigh: { flight: number; hold: number; scale: number };
}

/** Cities & Knights: commodities, knights, walls, metropolises, the merchant, and the event die. */
export interface KnightsArt {
  cardColors: Record<Commodity, CardColors>;
  /** Each improvement track's color (the event die's gates use them too). */
  trackColors: Record<Track, CardColors>;
  CommodityIcon: (props: { commodity: Commodity; size?: number }) => ReactElement;
  CommodityArt: (props: { commodity: Commodity }) => ReactElement;
  /** A knight token centered at the origin. */
  Knight: (props: { color: string; level: 1 | 2 | 3; active: boolean }) => ReactElement;
  /** A city wall, drawn under the city at its corner. */
  CityWall: (props: { color: string }) => ReactElement;
  /** A metropolis banner, drawn over the city at its corner. */
  Metropolis: (props: { track: Track }) => ReactElement;
  /** The merchant, centered on its tile. */
  Merchant: (props: { color: string }) => ReactElement;
  BarbarianShip: (props: { size?: number }) => ReactElement;
  EventFace: (props: { face: 'ship' | Track; size?: number }) => ReactElement;
}

export interface CardColors {
  base: string;
  light: string;
  dark: string;
}

/** Cartographers: lodestone, relay stations, survey ships, and charted numbers. */
export interface CartographersArt {
  terrain: { name: string; color: string };
  cardColors: CardColors;
  /** The lodestone tile, frame included, centered at the origin. */
  Tile: (props: { uid: string }) => ReactElement;
  ResourceIcon: (props: { size?: number }) => ReactElement;
  ResourceArt: () => ReactElement;
  /** A relay station on the edge from `from` to `to`; `inset` is the share left bare at each end. */
  Relay: (props: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    color: string;
    inset: number;
  }) => ReactElement;
  SurveyShip: (props: { from: { x: number; y: number }; to: { x: number; y: number }; color: string }) => ReactElement;
  /** A tile's charted numbers, beside its number token (drawn at the token's origin). */
  ExtraNumbers: (props: { numbers: number[] }) => ReactElement;
  /** A survey ship's target marker, centered at the origin. Versions before v16 borrow v16's. */
  SurveyTarget?: (props: { color: string }) => ReactElement;
  /** The seam between a split tile's halves, drawn at the tile's center. Versions before v16 borrow v16's. */
  SplitSeam?: () => ReactElement;
  /** Edge mist and cloud banks over a fog tile you peeked at. Versions before v16 borrow v16's. */
  PeekVeil?: (props: { uid: string }) => ReactElement;
}

/** A rectangle in board units. */
export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tiles in `SeaArt.terrain`: the sea-map terrains (fog is separate) plus `land`, the editor's not-yet-chosen land. */
export type SeaTileKind = Exclude<SeaTerrain, 'fog'> | 'land';

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
  /** An unexplored fog tile. Versions before v12 leave this out and borrow v12's. */
  FogTile?: (props: { uid: string }) => ReactElement;
}
