import type { GameView } from '../../../shared/types';
import type { HelpSection } from './helpContent';

/**
 * The rules tabs of the help dialog: the base game and each expansion, written for people who
 * know roughly how the board game goes. How to do things on this site is the How to tab
 * (helpContent.ts). Keep these in step with docs/rules.md.
 */

function base(view: GameView): HelpSection[] {
  return [
    {
      tab: 'base',
      title: 'Setup',
      lines: [
        'Turn order is drawn at random. Each player places a settlement and a road, then again in reverse order.',
        'Your second settlement pays one card from each tile beside it.',
      ],
    },
    {
      tab: 'base',
      title: 'A turn',
      lines: [
        'Roll the dice. Every tile with that number pays 1 card per settlement and 2 per city beside it.',
        'Then trade and build in any order, and end your turn.',
      ],
    },
    {
      tab: 'base',
      title: 'Costs',
      lines: [
        'Road: lumber and brick. Settlement: lumber, brick, wool, and grain. City: 2 grain and 3 ore. Development card: wool, grain, and ore.',
        'A settlement needs your road and no building on the corners next to it.',
      ],
    },
    {
      tab: 'base',
      title: 'A 7',
      lines: [
        `Anyone holding more than ${view.settings.discardLimit} cards discards half. The roller moves the robber and takes a card from someone beside it.`,
        'The robber stops its tile from paying.',
        ...(view.settings.friendlyRobber
          ? ['In this room the robber skips players with 2 or fewer visible points.']
          : []),
      ],
    },
    {
      tab: 'base',
      title: 'Trading',
      lines: [
        'Trade with the bank at 4:1, or 3:1 and 2:1 at your harbors.',
        'Players trade with whoever’s turn it is. Here anyone may also offer off turn: a deal between two other players happens at the start of the next turn of either one.',
      ],
    },
    {
      tab: 'base',
      title: 'Points',
      lines: [
        'Settlement 1, city 2. Longest Road (5 or more) and Largest Army (3 or more knights) are 2 each. Victory Point cards are 1 each.',
        `First to ${view.settings.victoryPoints} points on their turn wins.`,
      ],
    },
  ];
}

function seafarers(): HelpSection[] {
  return [
    {
      tab: 'seafarers',
      title: 'Ships',
      lines: [
        'A ship costs lumber and wool and goes on an edge beside water. A line of ships counts like a road for Longest Road.',
        'Once per turn you may move the open end ship of a line, but not one built this turn.',
        'Your first settlement on each new island earns bonus points on some maps.',
      ],
    },
    {
      tab: 'seafarers',
      title: 'The pirate',
      lines: [
        'On a 7 or a knight you may move the pirate instead of the robber. It steals from ship owners beside it.',
        'Ships can’t be built or moved beside the pirate.',
      ],
    },
    {
      tab: 'seafarers',
      title: 'Gold and fog',
      lines: [
        'A gold field pays any resource you choose: 1 per settlement, 2 per city.',
        'Fog hides tiles. A road or ship touching a fog tile reveals it; land pays the builder one card of what it produces.',
      ],
    },
    {
      tab: 'seafarers',
      title: 'Icebergs',
      lines: ['When an iceberg’s number rolls, it drifts one tile into open sea. A ship on the side it hits sinks.'],
    },
  ];
}

function tropics(view: GameView): HelpSection[] {
  return [
    {
      tab: 'tropics',
      title: 'Jungles',
      lines: [
        'A jungle pays discoveries instead of cards: 1 per settlement, 2 per city.',
        'Each discovery pays for one resource of a development card.',
      ],
    },
    {
      tab: 'tropics',
      title: 'Volcanoes',
      lines: [
        view.settings.volcanoGold
          ? 'A volcano pays like gold when its number rolls, then erupts.'
          : 'A volcano pays nothing in this room; it only erupts.',
        'An eruption rolls a die for a corner: a settlement there is lost and a city drops to a settlement.',
        'The robber on a volcano stops it erupting.',
      ],
    },
  ];
}

function cartographers(view: GameView): HelpSection[] {
  return [
    {
      tab: 'cartographers',
      title: 'Lodestone',
      lines: [
        'A sixth resource from moor tiles. It is produced, stolen, discarded, traded, and taken by cards like the others, and has its own 2:1 harbor.',
      ],
    },
    {
      tab: 'cartographers',
      title: 'Relay stations',
      lines: [
        'Cost: 1 lodestone, 1 grain, 1 lumber. 4 each. No points.',
        'Goes on an edge joined to your road, like a road, and counts toward Longest Road. It reveals fog like a road.',
        'No settlement or city at either end, and no two relay stations (anyone’s) may share a corner. A settlement can’t later go at a relay station’s end.',
        'When a tile beside it rolls, it earns 1 card from that tile. On a coast it earns from its one land tile. The robber blocks it.',
        'On a harbor’s edge it gives you that harbor’s rate, as a settlement there would. Beside the harbor edge it does not.',
      ],
    },
    {
      tab: 'cartographers',
      title: 'Survey ships',
      lines: [
        'Cost: 2 lodestone, 1 ore. Upgrades one of your ships with water on both sides. 4 each. 1 point.',
        'It can’t move afterward and still counts in your trade route. The pirate blocks upgrading a ship beside it.',
        'No two survey ships (anyone’s) may border the same tile.',
      ],
    },
    {
      tab: 'cartographers',
      title: 'Charting',
      lines: [
        'On a 7, after discards and the robber or pirate, everyone charts one tile per survey ship, all at once. You have 30 seconds; then you pass.',
        'A charted number steps toward 7 (5 becomes 6, 12 becomes 11). A 6 or 8 gains a 2 or 12 at random, which steps the same way later.',
        'A tile holds up to 3 numbers and pays once for each that rolls.',
        view.settings.chartSpecial
          ? 'In this room gold fields and volcanoes can be charted too.'
          : 'Gold fields and volcanoes can’t be charted in this room.',
      ],
    },
    {
      tab: 'cartographers',
      title: 'Peeking under the fog',
      lines: [
        'On your turn after the roll, pay 1 lodestone to see what one fog tile hides.',
        'Only you see it: the tile shows faintly through the fog with a purple ring. Everyone sees which tile you peeked at.',
        'A peek can’t be undone. The tile is still revealed the usual way, by building next to it.',
      ],
    },
  ];
}

/** Every rules tab's sections, worded for this room's settings. */
export function ruleSections(view: GameView): HelpSection[] {
  return [...base(view), ...seafarers(), ...tropics(view), ...cartographers(view)];
}
