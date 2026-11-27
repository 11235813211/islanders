// Active art version. To roll back, point this at an older folder (e.g. './v1').
import type { ReactElement } from 'react';
import { createContext, createElement, useContext } from 'react';
import { type BaseTerrain, COMMODITIES, type Commodity, type Resource, type Terrain } from '../../shared/types';
import type { CardColors, CartographersArt, ChristmasArt, KnightsArt, SeaArt, SeaTileKind } from './types';
import { sea as fallbackSea } from './v7/sea';
import { FogTile as FallbackFogTile } from './v12/sea/fog';
import { cartographers as fallbackCartographers } from './v14/cartographers';
import { cartographers as splitCartographers } from './v16/cartographers';
import { knights as fallbackKnights } from './v18/knights';
import { MegacityPiece as fallbackMegacity } from './v19/pieces';
import { art } from './v20';
import { christmas as fallbackChristmas } from './v20/christmas';

export type { Frame, SeaTileKind } from './types';
export const ART_VERSION = art.version;
export const ROAD_INSET = art.roadInset ?? 0.19;
export const { ArtDefs, SeaBackdrop, HexTile, NumberToken, Harbor, Road, BuildingPiece, SeaDecorations } = art;
/** Cartographers art: the active version's, or v14's for versions made before it. */
export const CARTOGRAPHERS: CartographersArt =
  (art as { cartographers?: CartographersArt }).cartographers ?? fallbackCartographers;
/** Split seams and peek veils: the active version's, or v16's for versions made before them. */
export const SplitSeam = CARTOGRAPHERS.SplitSeam ?? splitCartographers.SplitSeam!;
export const PeekVeil = CARTOGRAPHERS.PeekVeil ?? splitCartographers.PeekVeil!;
/** Megacities: the active version's, or v19's for versions made before them. */
export const MegacityPiece = (art as { MegacityPiece?: typeof fallbackMegacity }).MegacityPiece ?? fallbackMegacity;
/** The Christmas look: the active version's, or v20's for versions made before it. */
export const CHRISTMAS: ChristmasArt = (art as { christmas?: ChristmasArt }).christmas ?? fallbackChristmas;
/** True inside a room with the Christmas look: tiles and cards draw their winter versions. */
export const ChristmasTheme = createContext(false);
/** The robber: the Grinch in a room with the Christmas look, else the active version's. */
export function Robber(): ReactElement {
  return createElement(useContext(ChristmasTheme) ? CHRISTMAS.Robber : art.Robber);
}
/** Cities & Knights art: the active version's, or v18's for versions made before it. */
export const KNIGHTS: KnightsArt = (art as { knights?: KnightsArt }).knights ?? fallbackKnights;
export const CARD_COLORS: Record<Resource, CardColors> = {
  ...art.cardColors,
  lodestone: CARTOGRAPHERS.cardColors,
  ...KNIGHTS.cardColors,
};

const isCommodity = (resource: Resource): resource is Commodity =>
  (COMMODITIES as readonly string[]).includes(resource);

/** A resource's small icon (card corners, harbors, logs). */
export function ResourceIcon({ resource, size }: { resource: Resource; size?: number }): ReactElement {
  if (resource === 'lodestone') return createElement(CARTOGRAPHERS.ResourceIcon, { size });
  if (isCommodity(resource)) return createElement(KNIGHTS.CommodityIcon, { commodity: resource, size });
  return createElement(art.ResourceIcon, { resource, size });
}

/** The large illustration in the middle of a resource card. */
export function ResourceArt({ resource }: { resource: Resource }): ReactElement {
  const christmas = useContext(ChristmasTheme);
  if (!christmas) return createElement(PlainResourceArt, { resource });
  // Lumber and wool get Christmas faces of their own; every card gets holly and snow.
  const face = CHRISTMAS.CardArt({ resource }) ?? createElement(PlainResourceArt, { resource });
  return createElement('span', { className: 'cards-xmas' }, face, createElement(CHRISTMAS.CardDecor));
}
function PlainResourceArt({ resource }: { resource: Resource }): ReactElement {
  if (resource === 'lodestone') return createElement(CARTOGRAPHERS.ResourceArt);
  if (isCommodity(resource)) return createElement(KNIGHTS.CommodityArt, { commodity: resource });
  return createElement(art.ResourceArt, { resource });
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
  paid,
}: {
  uid: string;
  terrain: Terrain | 'land';
  variant?: number;
  /** Christmas: the roll's id when this tile just paid out, to play its motion. */
  paid?: number;
}): ReactElement {
  const winter = useContext(ChristmasTheme);
  if (terrain === 'fog') return createElement(FogTile, { uid });
  if (winter && BASE_TERRAINS.has(terrain))
    return createElement(CHRISTMAS.WinterTile, {
      uid,
      terrain: terrain as BaseTerrain,
      seed: variant ?? 0,
      paid,
    });
  if (terrain === 'lodestone') return createElement(CARTOGRAPHERS.Tile, { uid });
  return BASE_TERRAINS.has(terrain)
    ? createElement(HexTile, { uid, terrain: terrain as BaseTerrain })
    : createElement(SEA.SeaTile, { uid, terrain: terrain as SeaTileKind, variant });
}
