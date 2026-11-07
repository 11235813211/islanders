import {
  ArrowRight,
  Bot,
  Check,
  Copy,
  Eye,
  FlaskConical,
  LogOut,
  Map as MapIcon,
  Plus,
  Swords,
  UserPlus,
  Users,
  Wifi,
} from 'lucide-react';
import { type CSSProperties, useEffect, useState } from 'react';
import { BOTS } from '../../shared/bots';
import { PLAYER_COLORS, playerVars } from '../../shared/colors';
import {
  BOT_LEVELS,
  type BotLevel,
  DEFAULT_BOT_LEVEL,
  type GameAction,
  type GameSettings,
  type GameView,
  PLAYER_COLOR_IDS,
} from '../../shared/types';
import type { Connection } from '../hooks/useRoom';
import LobbySeat from './lobby/LobbySeat';
import { CATEGORIES, GAME_MODES, SettingControl } from './lobby/settings';
import './RoomLobby.css';

export interface RoomLobbyProps {
  view: GameView;
  playerId: string;
  connection: Connection;
  online: string[];
  busy: boolean;
  send: (action: GameAction) => void;
  invite: () => void;
}

export default function RoomLobby({ view, playerId, connection, online, busy, send, invite }: RoomLobbyProps) {
  const host = playerId === view.hostId;
  const self = view.players.find(p => p.id === view.selfId);
  const takenBy = new Map(view.players.map(p => [p.color, p]));
  const change = (next: Partial<GameSettings>) => send({ type: 'configure', settings: { ...view.settings, ...next } });
  const mode = GAME_MODES[0]!;
  const [botLevel, setBotLevel] = useState<BotLevel>(DEFAULT_BOT_LEVEL);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  /** The button sits beside the code, so it copies just the code. Links come from Invite friends. */
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(view.roomId);
      setCopied(true);
    } catch {
      invite();
    }
  }
  return (
    <main className="room-setup">
      <div className="page-heading">
        <div>
          <span className="section-kicker">{view.testMode ? 'SOLO TEST ROOM' : 'GAME ROOM'}</span>
          <h1>{view.roomId}</h1>
        </div>
        <div className="heading-actions">
          <ConnectionPill status={connection} />
          <button className="button secondary" onClick={invite}>
            <Users size={20} />
            Invite friends
          </button>
        </div>
      </div>
      {view.role === 'spectator' && (
        <div className="test-banner">
          <Eye size={20} />
          <span>You are spectating. Player hands stay private.</span>
          {!view.testMode && view.players.length < 4 && (
            <button className="button secondary" disabled={busy} onClick={() => send({ type: 'switch-role' })}>
              <UserPlus size={18} />
              Take a seat
            </button>
          )}
        </div>
      )}
      {view.testMode && (
        <div className="test-banner">
          <FlaskConical size={22} />
          <span>
            <strong>Solo playtest.</strong> You control every seat in this room.
          </span>
        </div>
      )}

      <section className="setup-players panel">
        <div className="section-heading">
          <h2>Players</h2>
          <span className="subtle-badge">{view.players.length} / 4</span>
        </div>
        {view.players.map(p => (
          <LobbySeat
            key={p.id}
            view={view}
            seat={p}
            host={host}
            online={online.includes(p.id)}
            busy={busy}
            send={send}
          />
        ))}
        {self && (
          <div className="color-picker" role="radiogroup" aria-label="Your color">
            {PLAYER_COLOR_IDS.map(color => {
              const owner = takenBy.get(color);
              const mine = owner?.id === self.id;
              return (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={mine}
                  aria-label={`${PLAYER_COLORS[color].label}${owner && !mine ? ` (taken by ${owner.name})` : ''}`}
                  title={owner && !mine ? `Taken by ${owner.name}` : PLAYER_COLORS[color].label}
                  className="color-swatch"
                  style={playerVars(color) as CSSProperties}
                  disabled={busy || (!!owner && !mine)}
                  onClick={() => !mine && send({ type: 'choose-color', color })}
                >
                  {mine && <Check size={16} />}
                </button>
              );
            })}
          </div>
        )}
        {host && view.players.length < 4 && (
          <div className="add-bot">
            <Bot size={22} />
            <select aria-label="New bot level" value={botLevel} onChange={e => setBotLevel(e.target.value as BotLevel)}>
              {BOT_LEVELS.map(level => (
                <option key={level} value={level}>
                  {BOTS[level].label}
                </option>
              ))}
            </select>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => send({ type: 'add-bot', level: botLevel })}
            >
              <Plus size={18} />
              Add bot
            </button>
            <small>{BOTS[botLevel].description}</small>
          </div>
        )}
        {!view.testMode &&
          Array.from({ length: 4 - view.players.length }, (_, i) => (
            <button key={i} className="open-seat" onClick={invite}>
              <Plus size={23} />
              Invite a player
            </button>
          ))}
        <div className="room-code-box">
          <span>Room code</span>
          <strong>{view.roomId}</strong>
          <button className="icon-button" onClick={() => void copyCode()} aria-label="Copy room code">
            {copied ? <Check /> : <Copy />}
          </button>
        </div>
        <div className="lobby-exits">
          {self && !view.testMode && view.players.some(p => !p.bot && p.id !== self.id) && (
            <button className="text-button" disabled={busy} onClick={() => send({ type: 'switch-role' })}>
              <Eye size={17} />
              Watch instead
            </button>
          )}
          <button className="text-button leave-room" disabled={busy} onClick={() => send({ type: 'leave' })}>
            <LogOut size={17} />
            Leave room
          </button>
        </div>
      </section>

      <section className="setup-settings panel">
        <div className="section-heading">
          <h2>Game settings</h2>
          {!host && <span className="subtle-badge">Host controls</span>}
        </div>
        <div className="mode-card tone-sea">
          <MapIcon size={30} />
          <div>
            <h3>{mode.name}</h3>
            <p>
              {mode.board} · {mode.players}
            </p>
          </div>
          <span className="mode-check">
            <Check size={18} />
          </span>
        </div>
        {CATEGORIES.map(category => (
          <fieldset key={category.id} className={`setting-group tone-${category.tone}`}>
            <legend>{category.title}</legend>
            {category.settings.map(def => {
              // A <label> forwards clicks to its first button, so stepper rows use a plain <div>.
              const Row = def.control.kind === 'stepper' ? 'div' : 'label';
              return (
                <Row className="setting-row" key={def.key}>
                  <span className="setting-label">
                    {def.icon}
                    <span>
                      <strong>{def.label}</strong>
                      <small>{def.hint}</small>
                    </span>
                  </span>
                  <SettingControl def={def} settings={view.settings} disabled={busy || !host} change={change} />
                </Row>
              );
            })}
          </fieldset>
        ))}
        <div className="setup-start">
          <p>
            {view.players.length < 2
              ? 'Invite at least one more player to start.'
              : host
                ? `${view.players.length} players · first to ${view.settings.victoryPoints} points`
                : 'Waiting for the host to start.'}
          </p>
          <button
            className="button primary"
            disabled={busy || !host || view.players.length < 2}
            onClick={() => send({ type: 'start' })}
          >
            <Swords size={21} />
            Start game
            <ArrowRight size={21} />
          </button>
        </div>
      </section>
    </main>
  );
}

export function ConnectionPill({ status }: { status: Connection }) {
  return (
    <span className={`connection-pill ${status !== 'online' ? 'disconnected' : ''}`}>
      <Wifi size={16} />
      {status === 'online' ? 'Connected' : status === 'offline' ? 'Offline' : 'Connecting…'}
    </span>
  );
}
