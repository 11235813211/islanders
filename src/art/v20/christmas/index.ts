// The Christmas look (room setting `christmas`): winter tiles, the North Pole, Santa's sleigh,
// the Grinch as the robber, and card decorations. Every color, count, and speed is in tuning.ts.
import type { ChristmasArt } from '../../types';
import { CardDecor, ChristmasCardArt } from './cards';
import { NorthPoleRing, NorthPoleTile, Sleigh } from './northpole';
import { GrinchRobber } from './robber';
import { LogoTree, WinterTile } from './tiles';
import { CHRISTMAS } from './tuning';

export const christmas: ChristmasArt = {
  WinterTile,
  NorthPoleTile,
  NorthPoleRing,
  Sleigh,
  CardDecor,
  CardArt: ChristmasCardArt,
  LogoTree,
  Robber: GrinchRobber,
  sleigh: CHRISTMAS.sleigh,
};
