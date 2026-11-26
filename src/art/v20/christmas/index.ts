// The Christmas look (room setting `christmas`): winter tiles, the North Pole, Santa's sleigh,
// and card decorations. Every color, count, and speed is in tuning.ts.
import type { ChristmasArt } from '../../types';
import { CardDecor, ChristmasCardArt } from './cards';
import { NorthPoleRing, NorthPoleTile, Sleigh } from './northpole';
import { WinterTile } from './tiles';
import { CHRISTMAS } from './tuning';

export const christmas: ChristmasArt = {
  WinterTile,
  NorthPoleTile,
  NorthPoleRing,
  Sleigh,
  CardDecor,
  CardArt: ChristmasCardArt,
  sleigh: CHRISTMAS.sleigh,
};
