// The Christmas look (room setting `christmas`): winter tiles, the North Pole, Santa's sleigh,
// the Grinch as the robber, and card decorations; Christmas Candy card faces and icons (candy-cards.tsx). Every color, count, and speed is in tuning.ts.
import type { ChristmasArt } from '../../types';
import { CandyCardArt, CandyIcon } from './candy-cards';
import { CardDecor, ChristmasCardArt } from './cards';
import { NorthPoleRing, NorthPoleTile, Sleigh } from './northpole';
import { GrinchRobber } from './robber';
import { LogoTree, WinterFigure, WinterTile } from './tiles';
import { CHRISTMAS } from './tuning';

export const christmas: ChristmasArt = {
  WinterTile,
  TileFigure: WinterFigure,
  NorthPoleTile,
  NorthPoleRing,
  Sleigh,
  CardDecor,
  CardArt: ChristmasCardArt,
  CandyCardArt,
  CandyIcon,
  LogoTree,
  Robber: GrinchRobber,
  sleigh: CHRISTMAS.sleigh,
};
