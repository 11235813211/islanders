// Active art version. To roll back, point this at an older folder (e.g. './v1').
import type { ReactElement } from 'react';
import { createContext, createElement, useContext } from 'react';
import {
  type BaseTerrain,
  CLASSIC_RESOURCES,
  type ClassicResource,
  COMMODITIES,
  type Commodity,
  type Resource,
  type Terrain,
} from '../../shared/types';
import { CandyTheme } from './candy-options';
import type { CardColors, CartographersArt, ChristmasArt, KnightsArt, SeaArt, SeaTileKind } from './types';
import { sea as fallbackSea } from './v7/sea';
import { FogTile as FallbackFogTile } from './v12/sea/fog';
import { cartographers as fallbackCartographers } from './v14/cartographers';
import { cartographers as splitCartographers } from './v16/cartographers';
import { knights as fallbackKnights } from './v18/knights';
import { MegacityPiece as fallbackMegacity } from './v19/pieces';
import { art as christmasPack } from './v20';
import { art } from './v23';
import { CandyTile } from './v23/christmas/candy-tiles';

export type { Frame, SeaTileKind } from './types';
export { CandyTile } from './v23/christmas/candy-tiles';
export {
  CandyRailways,
  designTracks,
  type RailRoad,
  type RailTrack,
  trainInFront,
} from './v23/christmas/train';
export const ART_VERSION = art.version;
export const ROAD_INSET = art.roadInset ?? 0.19;
export const { ArtDefs, SeaBackdrop, HexTile, NumberToken, Road, BuildingPiece, SeaDecorations } = art;
/** Cartographers art: the active version's, or v14's for versions made before it. */
export const CARTOGRAPHERS: CartographersArt =
  (art as { cartographers?: CartographersArt }).cartographers ?? fallbackCartographers;
/** Split seams and peek veils: the active version's, or v16's for versions made before them. */
export const SplitSeam = CARTOGRAPHERS.SplitSeam ?? splitCartographers.SplitSeam!;
export const PeekVeil = CARTOGRAPHERS.PeekVeil ?? splitCartographers.PeekVeil!;
/** Megacities: the active version's, or v19's for versions made before them. */
export const MegacityPiece = (art as { MegacityPiece?: typeof fallbackMegacity }).MegacityPiece ?? fallbackMegacity;
/** The Christmas look: the active version's, or v20's for versions made before it. */
export const CHRISTMAS: ChristmasArt = (art as { christmas?: ChristmasArt }).christmas ?? christmasPack.christmas;
/** True inside a room with the Christmas look: tiles and cards draw their winter versions. */
export const ChristmasTheme = createContext(false);
/** The robber: the Grinch in a room with the Christmas look, else the active version's. */
export function Robber(): ReactElement {
  return createElement(useContext(ChristmasTheme) ? CHRISTMAS.Robber : art.Robber);
}
export { FiguresApart } from './figures';
/**
 * A tile's standing figures in a Christmas or Candy room, for boards that draw them in their own
 * layer above trains and pieces (inside FiguresApart); null for tiles without one.
 */
export function TileFigure({ terrain }: { terrain: Terrain | 'land' }): ReactElement | null {
  const christmas = useContext(ChristmasTheme);
  const candy = useContext(CandyTheme);
  if (!(christmas || candy) || !CHRISTMAS.TileFigure || !BASE_TERRAINS.has(terrain)) return null;
  return createElement(CHRISTMAS.TileFigure, { terrain: terrain as BaseTerrain });
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

/** The standard resource to draw as candy (Christmas Candy look), or null. */
const candyResource = (candy: boolean, resource: Resource): ClassicResource | null =>
  candy && (CLASSIC_RESOURCES as readonly string[]).includes(resource) ? (resource as ClassicResource) : null;

/** A resource's small icon (card corners, harbors, logs). */
export function ResourceIcon({ resource, size }: { resource: Resource; size?: number }): ReactElement {
  const candy = candyResource(useContext(CandyTheme), resource);
  if (candy && CHRISTMAS.CandyIcon) return createElement(CHRISTMAS.CandyIcon, { resource: candy, size });
  if (resource === 'lodestone') return createElement(CARTOGRAPHERS.ResourceIcon, { size });
  if (isCommodity(resource)) return createElement(KNIGHTS.CommodityIcon, { commodity: resource, size });
  return createElement(art.ResourceIcon, { resource, size });
}

/** A harbor's piers and sign, its icon drawn as the room's look draws resources (candy in Candy rooms). */
export function Harbor(props: Parameters<typeof art.Harbor>[0]): ReactElement {
  const icon =
    props.resource === 'any' ? undefined : createElement(ResourceIcon, { resource: props.resource, size: 20 });
  return createElement(art.Harbor, { ...props, icon });
}

/** The large illustration in the middle of a resource card. */
export function ResourceArt({ resource }: { resource: Resource }): ReactElement {
  const christmas = useContext(ChristmasTheme);
  const candy = candyResource(useContext(CandyTheme), resource);
  if (!christmas) return createElement(PlainResourceArt, { resource });
  if (candy && CHRISTMAS.CandyCardArt)
    return createElement(
      'span',
      { className: 'cards-xmas' },
      createElement(CHRISTMAS.CandyCardArt, { resource: candy }),
      createElement(CHRISTMAS.CardDecor),
    );
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
  const candy = useContext(CandyTheme);
  if (terrain === 'fog') return createElement(FogTile, { uid });
  if (candy && BASE_TERRAINS.has(terrain))
    return createElement(CandyTile, { uid, terrain: terrain as BaseTerrain, seed: variant ?? 0, paid });
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
