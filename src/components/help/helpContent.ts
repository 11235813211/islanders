import { isLargeGame } from '../../../shared/engine';
import type { GameView, Terrain } from '../../../shared/types';
import { ruleSections } from './helpRules';

/** The help dialog's tabs: how to use this site, then the rules of the base game and each expansion. */
export const HELP_TABS = [
  { id: 'ui', label: 'How to' },
  { id: 'base', label: 'Base' },
  { id: 'seafarers', label: 'Seafarers' },
  { id: 'tropics', label: 'Tropics' },
  { id: 'cartographers', label: 'Cartographers' },
] as const;
export type HelpTab = (typeof HELP_TABS)[number]['id'];

/** One heading and its lines in the help dialog, on its tab (How to when absent). */
export interface HelpSection {
  title: string;
  lines: string[];
  tab?: HelpTab;
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
    return view.pendingSplit[view.selfId]?.length
      ? 'Choose the resources your gold or split tiles pay in the panel on the board.'
      : 'Choose the resources your gold tile pays in the panel on the board.';
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
    `After the roll, ${v.tap.toLowerCase()} a card in your hand to open a trade. It goes in Give. The panel stays open through rolls and turns.`,
    `${v.tap} cards in the row at the top of the panel to ask for them. ${v.tap} a chosen card to take it back out.`,
    'Send the offer to everyone, or pick players first. Each answers yes, no, or with a counter-offer, and everyone sees every answer.',
    'You can offer off turn. A deal with the player whose turn it is happens at once; one between two others comes back at the start of the next turn of either.',
    'Bank trades, on your own turn, use your rates (4:1, 3:1, or 2:1 harbors), several at once: give each kind in a multiple of its rate, one card for each.',
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

/** How the sea-map pieces are used here, for the features this board has (their rules are on the other tabs). */
function seaSections(view: GameView, v: Verbs): HelpSection[] {
  const lines: string[] = [];
  if (view.seafaring) {
    lines.push('On a coast edge that takes either piece, you choose road or ship when you confirm.');
    lines.push(
      `To move a ship, ${v.tap.toLowerCase()} Move (or the ship), then where it goes. On a 7, ${v.tap.toLowerCase()} a sea tile to move the pirate.`,
    );
  }
  if (hasTerrain(view, 'gold') || view.features.fogLand > 0)
    lines.push('Gold pays what you pick in the panel on the board.');
  if (view.jungle) lines.push('With discoveries in hand, Dev Card asks which resources they cover.');
  if (view.features.volcano) lines.push('When a volcano’s number rolls, the roller presses Roll volcanoes.');
  if (view.cartographers) {
    lines.push(`Relay, Survey, Chart, and Split are on the build bar. ${v.hold} one to see its cost.`);
    lines.push(`Survey: ${v.tap.toLowerCase()} a ship at sea, then confirm in the panel.`);
    lines.push(`Chart and Split: ${v.tap.toLowerCase()} a tile, then confirm in the panel.`);
    if (hasTerrain(view, 'fog'))
      lines.push(`Peek, then ${v.tap.toLowerCase()} a fog tile, spends a lodestone to see under it.`);
  }
  return lines.length ? [{ title: 'This map', lines }] : [];
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
      ...ruleSections(view),
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
    ...ruleSections(view),
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
    ...ruleSections(view),
  ];
}
