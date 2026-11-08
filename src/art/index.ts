// Active art version. To roll back, point this at an older folder (e.g. './v1').
import type { ReactElement } from 'react';
import { createElement } from 'react';
import type { BaseTerrain, Terrain } from '../../shared/types';
import type { SeaArt, SeaTileKind } from './types';
import { sea as fallbackSea } from './v7/sea';
import { art } from './v11';

export type { Frame, SeaTileKind } from './types';
export const ART_VERSION = art.version;
export const ROAD_INSET = art.roadInset ?? 0.19;
export const {
  cardColors: CARD_COLORS,
  ArtDefs,
  SeaBackdrop,
  HexTile,
  NumberToken,
  Harbor,
  Road,
  BuildingPiece,
  Robber,
  SeaDecorations,
  ResourceIcon,
  ResourceArt,
} = art;
/** Sea-map art: the active version's, or v7's for versions made before sea maps. */
export const SEA: SeaArt = (art as { sea?: SeaArt }).sea ?? fallbackSea;
/** Name and map color of every terrain, plus `land` (unassigned land in the editor). */
export const TERRAIN: Record<Terrain | 'land', { name: string; color: string }> = { ...art.terrain, ...SEA.terrain };

const BASE_TERRAINS = new Set<string>(Object.keys(art.terrain));

/** Any tile, base or sea-map, centered at the origin. */
export function Tile({
  uid,
  terrain,
  variant,
}: {
  uid: string;
  terrain: Terrain | 'land';
  variant?: number;
}): ReactElement {
  return BASE_TERRAINS.has(terrain)
    ? createElement(HexTile, { uid, terrain: terrain as BaseTerrain })
    : createElement(SEA.SeaTile, { uid, terrain: terrain as SeaTileKind, variant });
}
