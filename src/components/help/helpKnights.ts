import { KNIGHTS_LIMITS, PROGRESS, PROGRESS_KINDS, TRACK_INFO, TRACKS, type Track } from '../../../shared/knights';
import type { GameView } from '../../../shared/types';
import type { HelpSection } from './helpContent';

/**
 * Cities & Knights rules, for players who know the base game: what changes, then each new part.
 * Keep these in step with docs/rules.md.
 */
export function knightsRules(view: GameView): HelpSection[] {
  const points = view.settings.victoryPoints;
  const cards = (track: Track) =>
    PROGRESS_KINDS.filter(k => PROGRESS[k].track === track).map(k => `${PROGRESS[k].name}: ${PROGRESS[k].text}`);
  return [
    {
      tab: 'knights',
      title: 'What changes',
      lines: [
        `Play to ${points} points. There are no development cards and no Largest Army.`,
        'Your second starting piece is a city, not a settlement.',
        'Cities on forest, pasture, and mountains make 1 resource and 1 commodity: paper, cloth, or coin. Cities on hills and fields still make 2 resources.',
        'Commodities trade with the bank 4:1 (3:1 at a 3:1 harbor), count toward discards, and can be stolen.',
        'The robber stays on the desert until the barbarians first land. Until then a 7 only makes players discard.',
      ],
    },
    {
      tab: 'knights',
      title: 'The dice',
      lines: [
        'You roll a red die, a yellow die, and the event die. Red and yellow add up for production as usual.',
        `Event die, ship (3 faces): the barbarian ship sails one step. After ${KNIGHTS_LIMITS.barbarianDistance} steps it lands.`,
        'Event die, gate (yellow, blue, or green): everyone with that color’s improvement draws a progress card if the red die is at most their level + 1 (level 1 draws on 1–2, level 5 on any red die).',
      ],
    },
    {
      tab: 'knights',
      title: 'Barbarians',
      lines: [
        'When the ship lands, the barbarians have 1 strength for each city on the island (metropolises included). The island defends with all active knights: strength 1, 2, or 3 each.',
        'Defended: the single player with the most active knight strength gets a Defender of Catan point. If tied, each tied player draws a progress card.',
        'Not defended: among players with a city that isn’t a metropolis, the one(s) with the least active knight strength lose a city (it becomes a settlement, and its wall goes).',
        'Afterward every knight goes inactive, and the ship starts over.',
      ],
    },
    {
      tab: 'knights',
      title: 'Knights',
      lines: [
        `Build a basic knight (1 wool, 1 ore) on an open corner beside your road. It starts inactive. You have ${KNIGHTS_LIMITS.knightsPerLevel} of each strength.`,
        'Activate it with 1 grain. Promote it with 1 wool and 1 ore: basic → strong → mighty (mighty needs politics level 3). Once per knight per turn.',
        'An active knight can, from the turn after it was activated: move along your roads, chase away a weaker opponent knight, or chase the robber from a tile beside it (then move the robber and steal). Doing any of these makes it inactive.',
        'Knights block other players’ roads and break their longest road, like a building.',
      ],
    },
    {
      tab: 'knights',
      title: 'City improvements',
      lines: [
        'With a city on the board, raise each track one level at a time. A level costs its number in that track’s commodity (level 3 costs 3).',
        ...TRACKS.map(
          t =>
            `${TRACK_INFO[t].name} (${TRACK_INFO[t].color}, ${TRACK_INFO[t].commodity}): level 3 gives ${TRACK_INFO[t].level3}`,
        ),
        'The first to reach level 4 in a track gets its metropolis on one of their cities: 2 more points, and barbarians can’t take it. The first to reach level 5 takes it from someone at level 4.',
      ],
    },
    {
      tab: 'knights',
      title: 'Walls and progress cards',
      lines: [
        `City wall (2 brick): you may hold ${KNIGHTS_LIMITS.wallCards} more cards on a 7. Up to ${KNIGHTS_LIMITS.walls}.`,
        `You may hold ${KNIGHTS_LIMITS.hand} progress cards; a card drawn with a full hand stays in the deck. Point cards (Printer, Constitution) count at once.`,
        'Play progress cards on your turn after rolling, as many as you like. Alchemist is played before rolling.',
        'The merchant: 2:1 trades for its tile’s resource and 1 point while you hold it. Defender of Catan cards are 1 point each.',
      ],
    },
    { tab: 'knights', title: 'Science cards (green)', lines: cards('science') },
    { tab: 'knights', title: 'Trade cards (yellow)', lines: cards('trade') },
    { tab: 'knights', title: 'Politics cards (blue)', lines: cards('politics') },
  ];
}

/** How to play the expansion on this site. */
export function knightsHowTo(tap: string): HelpSection {
  return {
    title: 'Cities & Knights here',
    lines: [
      `Knight and Wall on the build bar pick a corner on the board. Improve opens the three tracks.`,
      `${tap} one of your knights to activate, promote, move it, or chase the robber.`,
      `${tap} a progress card in your hand to read it and play it.`,
      'The strip at the board’s top right shows the barbarian ship, active knights against the barbarians, and the last event die.',
      'The scoreboard shows each player’s three improvement levels, progress cards, and active knight strength.',
    ],
  };
}
