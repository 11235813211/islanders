// Active art version. To roll back, point this at an older folder (e.g. './v1').
import type { ReactElement } from 'react';
import { createElement } from 'react';
import type { BaseTerrain, Resource, Terrain } from '../../shared/types';
import type { CardColors, CartographersArt, SeaArt, SeaTileKind } from './types';
import { sea as fallbackSea } from './v7/sea';
import { FogTile as FallbackFogTile } from './v12/sea/fog';
import { cartographers as fallbackCartographers } from './v14/cartographers';
import { art } from './v16';
import { cartographers as splitCartographers } from './v16/cartographers';

export type { Frame, SeaTileKind } from './types';
export const ART_VERSION = art.version;
export const ROAD_INSET = art.roadInset ?? 0.19;
export const { ArtDefs, SeaBackdrop, HexTile, NumberToken, Harbor, Road, BuildingPiece, Robber, SeaDecorations } = art;
/** Cartographers art: the active version's, or v14's for versions made before it. */
export const CARTOGRAPHERS: CartographersArt =
  (art as { cartographers?: CartographersArt }).cartographers ?? fallbackCartographers;
/** Split seams and peek veils: the active version's, or v16's for versions made before them. */
export const SplitSeam = CARTOGRAPHERS.SplitSeam ?? splitCartographers.SplitSeam!;
export const PeekVeil = CARTOGRAPHERS.PeekVeil ?? splitCartographers.PeekVeil!;
export const CARD_COLORS: Record<Resource, CardColors> = { ...art.cardColors, lodestone: CARTOGRAPHERS.cardColors };

/** A resource's small icon (card corners, harbors, logs). */
export function ResourceIcon({ resource, size }: { resource: Resource; size?: number }): ReactElement {
  return resource === 'lodestone'
    ? createElement(CARTOGRAPHERS.ResourceIcon, { size })
    : createElement(art.ResourceIcon, { resource, size });
}

/** The large illustration in the middle of a resource card. */
export function ResourceArt({ resource }: { resource: Resource }): ReactElement {
  return resource === 'lodestone'
    ? createElement(CARTOGRAPHERS.ResourceArt)
    : createElement(art.ResourceArt, { resource });
}
/** Sea-map art: the active version's, or v7's for versions made before sea maps. */
export const SEA: SeaArt = (art as { sea?: SeaArt }).sea ?? fallbackSea;
/** Name and map color of every terrain, plus `land` (unassigned land in the editor). */
export const TERRAIN: Record<Terrain | 'land', { name: string; color: string }> = {
  ...art.terrain,
  lodestone: CARTOGRAPHERS.terrain,
  ...SEA.terrain,
  fog: { name: 'Fog · revealed when reached', color: '#eef3f5' },
};
/** Unexplored fog: the active version's, or v12's for versions made before fog. */
const FogTile = SEA.FogTile ?? FallbackFogTile;

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
  if (terrain === 'fog') return createElement(FogTile, { uid });
  if (terrain === 'lodestone') return createElement(CARTOGRAPHERS.Tile, { uid });
  return BASE_TERRAINS.has(terrain)
    ? createElement(HexTile, { uid, terrain: terrain as BaseTerrain })
    : createElement(SEA.SeaTile, { uid, terrain: terrain as SeaTileKind, variant });
}
