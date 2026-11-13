import { isLargeGame } from '../../../shared/engine';
import type { GameView, Terrain } from '../../../shared/types';

/** One heading and its lines in the help dialog. */
export interface HelpSection {
  title: string;
  lines: string[];
}

/** Words that differ between touch screens and a mouse. */
interface Verbs {
  tap: string;
  hold: string;
  zoom: string;
}

/** "Tap" on touch screens, "Click" with a mouse. */
export function verbsFor(touch: boolean): Verbs {
  return touch
    ? { tap: 'Tap', hold: 'Press and hold', zoom: 'Pinch to zoom' }
    : { tap: 'Click', hold: 'Hover over', zoom: 'Scroll to zoom' };
}

const hasTerrain = (view: GameView, terrain: Terrain) => view.board.hexes.some(h => h.terrain === terrain);

/** What the viewer needs to do in the current phase, or null when nothing is asked of them. */
function rightNow(view: GameView, v: Verbs): string | null {
  const own = view.activePlayerId === view.selfId;
  const pieces = view.seafaring ? 'road or ship' : 'road';
  if (view.pausedAt !== null) return 'The game is paused. Press the play button at the top to ask to resume.';
  if (view.phase === 'discard' && (view.pendingDiscards[view.selfId] ?? 0) > 0)
    return `A 7 was rolled and you hold too many cards. ${v.tap} cards in your hand to discard the number shown, then confirm in the panel.`;
  if (view.phase === 'gold' && (view.pendingGold[view.selfId] ?? 0) > 0)
    return 'Choose the resources your gold tile pays in the panel on the board.';
  if (view.phase === 'finished') return 'The game is over. The results panel shows the final scores.';
  if (!own) {
    const name = view.players.find(p => p.id === view.activePlayerId)?.name ?? 'another player';
    return `Waiting for ${name}. You can still answer trade offers and chat.`;
  }
  switch (view.phase) {
    case 'setup-settlement':
      return `Place a starting settlement: ${v.tap.toLowerCase()} a glowing corner, then the check mark.`;
    case 'setup-road':
      return `Place a ${pieces} next to it: ${v.tap.toLowerCase()} a glowing edge, then the check mark.`;
    case 'roll':
      return 'Press Roll dice. If the countdown runs out, the dice roll for you.';
    case 'robber':
      return view.seafaring
        ? `Move the robber (or the pirate): ${v.tap.toLowerCase()} a tile, then the check mark. The pirate goes on sea.`
        : `Move the robber: ${v.tap.toLowerCase()} a tile, then the check mark.`;
    case 'steal':
      return 'Choose the player to take a card from.';
    case 'eruption':
      return 'Press Roll volcanoes.';
    case 'charting':
      return view.pendingCharts[view.selfId]
        ? `Chart your tiles: ${v.tap.toLowerCase()} tiles, then Chart. Pass skips.`
        : 'Players with survey ships are charting.';
    case 'special-build':
      return 'Build or buy cards (no trading), then press Done building.';
    case 'free-roads':
      return `Place your free ${view.seafaring ? 'roads or ships' : 'roads'} on glowing edges. Finish roads stops early.`;
    case 'build':
      return 'Build, trade, or play a card, then press End turn.';
    default:
      return null;
  }
}

/** How building works here. */
function building(view: GameView, v: Verbs): HelpSection {
  const buttons = view.seafaring ? 'Road, Ship, Settlement, or City' : 'Road, Settlement, or City';
  return {
    title: 'Building',
    lines: [
      `${v.tap} ${buttons} under your hand, then a glowing spot on the board. Or ${v.tap.toLowerCase()} a glowing spot first and confirm.`,
      `${v.hold} a build button to see its cost. The small number is how many pieces you have left.`,
      'Spots only glow when you can afford the piece and it is legal there.',
      'Dev Card buys a development card after a confirm.',
    ],
  };
}

function trading(view: GameView, v: Verbs): HelpSection {
  const lines = [
    `After you roll, ${v.tap.toLowerCase()} a card in your hand to open a trade. It goes in Give.`,
    `${v.tap} cards in the row at the top of the panel to ask for them. ${v.tap} a chosen card to take it back out.`,
    'Send the offer to everyone, or pick players first. Each answers yes, no, or with a counter-offer.',
    'Bank trades at your rates (4:1, 3:1, or 2:1 harbors), several at once: give each kind in a multiple of its rate, one card for each.',
  ];
  if (view.phase === 'special-build' || isLargeGame(view.players.length))
    lines.push('There is no trading during the special build phase.');
  return { title: 'Trading', lines };
}

function development(v: Verbs): HelpSection {
  return {
    title: 'Development cards',
    lines: [
      `Your cards sit beside your hand. Cards you can play now glow; ${v.tap.toLowerCase()} one to play it.`,
      'One card per turn, and not one bought this turn. Victory Point cards stay hidden until the end.',
    ],
  };
}

function table(v: Verbs): HelpSection {
  return {
    title: 'The table',
    lines: [
      `Drag the board to move it. ${v.zoom}.`,
      'The scoreboard lists points, cards in hand, development cards, longest road, and knights.',
      'The chat button opens chat, the game log, and a chart of dice rolls.',
      'The undo arrow asks the others to undo your last move. Rolls and revealed tiles can’t be undone. Pause also needs a vote.',
      'The clock shows time left in the turn. When it runs out, only forced choices are made for you and the turn ends.',
    ],
  };
}

/** Sections for the sea-map features this board has. */
function seaSections(view: GameView, v: Verbs): HelpSection[] {
  const sections: HelpSection[] = [];
  if (view.seafaring)
    sections.push({
      title: 'Ships and the pirate',
      lines: [
        'Ships cost wood and sheep and go on edges beside water. A line of ships counts like a road.',
        'On a coast edge that takes either piece, you choose road or ship when you confirm.',
        `Once per turn after rolling, you can move the open end ship of a line: ${v.tap.toLowerCase()} Move (or the ship), then where it goes. Not a ship built this turn.`,
        'On a 7 or a knight you move the robber or the pirate. The pirate steals from ship owners beside it and stops ships there from being built or moved.',
        'Your first settlement on each new island earns bonus points.',
      ],
    });
  if (hasTerrain(view, 'gold') || view.features.fogLand > 0)
    sections.push({
      title: 'Gold',
      lines: ['A gold tile pays any resource you choose: 1 per settlement, 2 per city. Pick in the panel.'],
    });
  if (view.features.fogLand > 0 || hasTerrain(view, 'fog'))
    sections.push({
      title: 'Fog',
      lines: [
        'Fog hides tiles. A road or ship touching a fog tile reveals it.',
        'Revealed land pays you one card of what it produces.',
      ],
    });
  if (view.jungle)
    sections.push({
      title: 'Jungle',
      lines: [
        'A jungle pays discoveries instead of cards. Each discovery pays for one resource of a development card.',
        'With discoveries in hand, Dev Card asks which resources they cover.',
      ],
    });
  if (view.features.volcano)
    sections.push({
      title: 'Volcanoes',
      lines: [
        'When a volcano’s number is rolled, the roller presses Roll volcanoes. The corner the die names loses its settlement; a city drops to a settlement.',
        'The robber on a volcano stops it erupting.',
      ],
    });
  if (hasTerrain(view, 'iceberg'))
    sections.push({
      title: 'Icebergs',
      lines: [
        'When an iceberg’s number is rolled, it drifts one tile into open sea. A ship on the side it hits sinks.',
      ],
    });
  if (view.cartographers)
    sections.push({
      title: 'Cartographers',
      lines: [
        'Lodestone is a resource like the others. It comes from moor tiles.',
        'Relay station: 2 lodestone, 1 lumber, 1 wool. Goes on an edge joined to your road, with nothing built at either end and no relay station touching it. It counts toward Longest Road and earns 1 card from each tile beside it. No points.',
        'Survey ship: 2 lodestone, 1 grain. Turns one of your ships out at sea into a survey ship, worth 1 point. It no longer moves. No two survey ships may border the same tile.',
        `On a 7, after the robber, each survey ship charts one tile. A number steps toward 7 (5 becomes 6, 12 becomes 11). A 6 or 8 gains a 2 or 12 at random, which steps the same way. A tile holds up to 3 numbers and pays on each${view.settings.chartSpecial ? '' : '; gold fields and volcanoes can’t be charted in this room'}.`,
      ],
    });
  return sections;
}

function specialBuild(): HelpSection {
  return {
    title: 'Special build (5–6 players)',
    lines: [
      'During someone else’s turn, press Special build to build or buy cards after it ends.',
      'No trading, playing cards, or moving ships then. Press Done building when finished.',
    ],
  };
}

/** Help for the game table: what to do now, then how each part of this game's interface works. */
export function gameHelp(view: GameView, touch: boolean): HelpSection[] {
  const v = verbsFor(touch);
  if (view.role === 'spectator')
    return [
      { title: 'Watching', lines: ['You are watching. Player hands stay hidden.'] },
      table(v),
      ...seaSections(view, v),
    ];
  const now = rightNow(view, v);
  return [
    ...(now ? [{ title: 'Right now', lines: [now] }] : []),
    building(view, v),
    trading(view, v),
    development(v),
    ...seaSections(view, v),
    ...(isLargeGame(view.players.length) ? [specialBuild()] : []),
    table(v),
  ];
}

/** Help for the room lobby, for the host or a guest. */
export function lobbyHelp(view: GameView): HelpSection[] {
  const host = view.hostId === view.selfId;
  const setup = host
    ? [
        'Invite friends with the room code or the Invite button, or add bots.',
        'Choose the map and settings under Game settings, then press Start game.',
      ]
    : ['The host picks the map and settings and starts the game.'];
  const seat =
    view.role === 'spectator'
      ? 'You are watching. Take a seat joins the game while there is room.'
      : 'Pick your color under the players.';
  return [
    { title: 'This room', lines: [...setup, seat] },
    {
      title: 'Maps',
      lines: [
        'Base game is the standard island. Choose map shows the other boards, including sea maps with ships.',
        'Every game draws a new layout from the map.',
      ],
    },
    {
      title: 'Once the game starts',
      lines: ['Open this help again from the info button at the top of the table for how to play.'],
    },
  ];
}
