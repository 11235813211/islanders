import {
  ArrowLeftRight,
  Bot,
  Coins,
  Compass,
  Dice5,
  Dot,
  Flame,
  Hand,
  House,
  type LucideIcon,
  Route,
  Sailboat,
  Snowflake,
  Sparkles,
  Trash2,
  Trophy,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { playerColor } from '../../../shared/colors';
import {
  type GameEvent,
  type GameLog,
  type GameView,
  RESOURCES,
  type Tradable,
  type TradeBag,
} from '../../../shared/types';
import { CityIcon } from './icons';
import { TradableIcon } from './tradables';

type Player = GameView['players'][number];

/** A run of log entries from one turn (turn 0 is setup and the lobby). */
interface TurnGroup {
  turn: number | undefined;
  entries: GameLog[];
}

/** Consecutive entries with the same turn number, newest group first and newest entry first. */
function groupByTurn(log: GameLog[]): TurnGroup[] {
  const groups: TurnGroup[] = [];
  for (const entry of log) {
    const last = groups.at(-1);
    if (last && last.turn === entry.turn) last.entries.push(entry);
    else groups.push({ turn: entry.turn, entries: [entry] });
  }
  return groups.reverse().map(group => ({ ...group, entries: [...group.entries].reverse() }));
}

/** Who acted in an event, if anyone. */
function actorOf(event: GameEvent | undefined): string | null {
  if (!event) return null;
  if ('playerId' in event) return event.playerId;
  if (event.kind === 'player-trade') return event.fromId;
  if (event.kind === 'steal') return event.thiefId;
  return null;
}

/** Whose turn a group is: the roller, else the first entry's actor. */
function turnPlayer(group: TurnGroup): string | null {
  const roll = group.entries.find(entry => entry.event?.kind === 'roll');
  if (roll) return actorOf(roll.event);
  return actorOf(group.entries.at(-1)?.event);
}

const BUILD_ICONS: Record<string, LucideIcon> = {
  road: Route,
  ship: Sailboat,
  settlement: House,
  development: Sparkles,
};
const EVENT_ICONS: Partial<Record<GameEvent['kind'], LucideIcon>> = {
  roll: Dice5,
  'bank-trade': ArrowLeftRight,
  'player-trade': ArrowLeftRight,
  offer: ArrowLeftRight,
  counter: ArrowLeftRight,
  discard: Trash2,
  steal: Hand,
  development: Sparkles,
  gold: Coins,
  eruption: Flame,
  iceberg: Snowflake,
  discover: Compass,
  takeover: Bot,
  win: Trophy,
};

/** The small icon at the start of an entry, by what happened. */
function EntryIcon({ event }: { event: GameEvent | undefined }) {
  if (event?.kind === 'build' && event.piece === 'city') return <CityIcon size={15} />;
  if (event?.kind === 'presence') return event.online ? <Wifi size={15} /> : <WifiOff size={15} />;
  const Icon = (event?.kind === 'build' ? BUILD_ICONS[event.piece] : event && EVENT_ICONS[event.kind]) ?? Dot;
  return <Icon size={15} />;
}

/** Cards as icons with counts (resources, then discoveries). */
function Cards({ bag }: { bag: Partial<TradeBag> }) {
  const items: Tradable[] = [...RESOURCES, 'discovery'];
  const shown = items.filter(item => (bag[item] ?? 0) > 0);
  if (!shown.length) return null;
  return (
    <span className="log-cards">
      {shown.map(item => (
        <span key={item}>
          <TradableIcon item={item} size={15} />
          {bag[item]! > 1 && <b>{bag[item]}</b>}
        </span>
      ))}
    </span>
  );
}

/** A player's name in their seat color. */
function Name({ player }: { player: Player }) {
  return (
    <span className="log-name" style={{ '--seat': playerColor(player.color).fill } as CSSProperties}>
      {player.name}
    </span>
  );
}

/** Entry text with each player's name drawn in their color. */
function withNames(text: string, players: Player[]): ReactNode[] {
  const named = players.filter(p => p.name).sort((a, b) => b.name.length - a.name.length);
  if (!named.length) return [text];
  const escaped = named.map(p => p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return text.split(new RegExp(`(${escaped.join('|')})`)).map((part, i) => {
    const player = named.find(p => p.name === part);
    return player ? <Name key={i} player={player} /> : part;
  });
}

/** The cards an entry moved, when the event says which (trades, discards, gold, payouts). */
function EntryCards({ event, players }: { event: GameEvent | undefined; players: Player[] }) {
  if (!event) return null;
  switch (event.kind) {
    case 'bank-trade':
    case 'player-trade':
      return (
        <span className="log-detail">
          <Cards bag={event.give} /> → <Cards bag={event.get} />
        </span>
      );
    case 'offer':
    case 'counter':
      return (
        <span className="log-detail">
          <Cards bag={event.give} /> for <Cards bag={event.want} />
        </span>
      );
    case 'discard':
      return <Cards bag={event.resources} />;
    case 'gold':
      return <Cards bag={event.resources} />;
    case 'steal':
      return event.resource ? <Cards bag={{ [event.resource]: 1 }} /> : null;
    case 'development':
      return event.gains ? <Cards bag={event.gains} /> : null;
    case 'roll':
      return <RollGains gains={event.gains} players={players} />;
    default:
      return null;
  }
}

/** Who a roll paid, one line per player. */
function RollGains({ gains, players }: { gains: Record<string, Partial<TradeBag>>; players: Player[] }) {
  const paid = players.filter(p => Object.values(gains[p.id] ?? {}).some(n => (n ?? 0) > 0));
  if (!paid.length) return null;
  return (
    <span className="log-gains">
      {paid.map(p => (
        <span key={p.id}>
          <Name player={p} />
          <Cards bag={gains[p.id]!} />
        </span>
      ))}
    </span>
  );
}

/** The activity tab: entries grouped by turn, each with an icon, colored names, and card icons. */
export default function ActivityLog({ view }: { view: GameView }) {
  const players = view.players;
  return (
    <ol className="activity-list">
      {groupByTurn(view.log).map(group => {
        const owner = players.find(p => p.id === turnPlayer(group));
        const key = group.entries.at(-1)!.id;
        return (
          <li key={key} className="log-turn">
            <h4 style={owner ? ({ '--seat': playerColor(owner.color).fill } as CSSProperties) : undefined}>
              {group.turn ? `Turn ${group.turn}` : 'Setup'}
              {owner && group.turn ? <Name player={owner} /> : null}
            </h4>
            <ol>
              {group.entries.map(entry => {
                const actor = players.find(p => p.id === actorOf(entry.event));
                return (
                  <li
                    key={entry.id}
                    className={`log-entry log-${entry.event?.kind ?? 'note'}`}
                    style={actor ? ({ '--seat': playerColor(actor.color).fill } as CSSProperties) : undefined}
                  >
                    <span className="log-icon">
                      <EntryIcon event={entry.event} />
                    </span>
                    <span className="log-text">
                      {withNames(entry.text, players)} <EntryCards event={entry.event} players={players} />
                    </span>
                  </li>
                );
              })}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}
