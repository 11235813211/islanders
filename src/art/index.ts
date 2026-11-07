// Active art version. To roll back, point this at an older folder (e.g. './v1').
import { art } from './v6';

export const ART_VERSION = art.version;
export const ROAD_INSET = art.roadInset ?? 0.19;
export const {
  terrain: TERRAIN,
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
