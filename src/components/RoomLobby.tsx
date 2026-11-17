import { ArrowRight, Bot, Eye, FlaskConical, LogOut, Plus, Swords, UserPlus, Users, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BOTS } from '../../shared/bots';
import { MAX_PLAYERS } from '../../shared/engine';
import {
  BOT_LEVELS,
  type BotLevel,
  DEFAULT_BOT_LEVEL,
  type GameAction,
  type GameSettings,
  type GameView,
  type RecordingStatus,
} from '../../shared/types';
import type { Connection, RecordingChoice } from '../hooks/useRoom';
import HelpButton from './help/HelpButton';
import { lobbyHelp } from './help/helpContent';
import ColorPicker, { ColorSwapNotice } from './lobby/ColorPicker';
import LobbySeat from './lobby/LobbySeat';
import LobbySpectators from './lobby/LobbySpectators';
import MapChoice from './lobby/MapChoice';
import RoomCode, { roomCodeOf } from './lobby/RoomCode';
import SaveGames from './lobby/SaveGames';
import { CATEGORIES, SettingControl, type SettingDef, THEMES, type Theme } from './lobby/settings';

/** Empty seats to show: up to four, then one more at a time up to six, so a small table looks complete. */
const openSeats = (seated: number) => Math.min(MAX_PLAYERS, Math.max(4, seated + 1)) - seated;

import './RoomLobby.css';

export interface RoomLobbyProps {
  view: GameView;
  playerId: string;
  connection: Connection;
  online: string[];
  busy: boolean;
  send: (action: GameAction) => void;
  recording: RecordingStatus;
  setRecordingChoice: (kind: RecordingChoice, value: boolean) => void;
  invite: () => void;
  /** Admins only: give the room its own code (once, as host). */
  setCode?: (code: string) => void;
}

export default function RoomLobby({
  view,
  playerId,
  connection,
  online,
  busy,
  send,
  recording,
  setRecordingChoice,
  invite,
  setCode,
}: RoomLobbyProps) {
  const host = playerId === view.hostId;
  const self = view.players.find(p => p.id === view.selfId);
  const change = (next: Partial<GameSettings>) => send({ type: 'configure', settings: { ...view.settings, ...next } });
  /** One setting: its icon, label and hint, and its control. */
  function renderSetting(def: SettingDef) {
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
        <SettingControl
          def={def}
          settings={view.settings}
          disabled={busy}
          readOnly={!host}
          change={next => {
            const question = def.confirm?.(view, next[def.key]!);
            if (!question || window.confirm(question)) change(next);
          }}
        />
      </Row>
    );
  }
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
      await navigator.clipboard.writeText(roomCodeOf(view));
      setCopied(true);
    } catch {
      invite();
    }
  }
  return (
    <main className="room-setup">
      <ColorSwapNotice view={view} busy={busy} send={send} />
      <div className="page-heading">
        <div>
          <span className="section-kicker">{view.testMode ? 'SOLO TEST ROOM' : 'GAME ROOM'}</span>
          <h1>{roomCodeOf(view)}</h1>
        </div>
        <div className="heading-actions">
          <ConnectionPill status={connection} />
          <HelpButton sections={() => lobbyHelp(view)} />
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
          {!view.testMode && view.players.length < MAX_PLAYERS && (
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
          <span className="subtle-badge">
            {view.players.length} / {MAX_PLAYERS}
          </span>
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
        <ColorPicker view={view} busy={busy} send={send} />
        {host && view.players.length < MAX_PLAYERS && (
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
          </div>
        )}
        {!view.testMode &&
          Array.from({ length: openSeats(view.players.length) }, (_, i) => (
            <button key={i} className="open-seat" onClick={invite}>
              <Plus size={23} />
              Invite a player
            </button>
          ))}
        <LobbySpectators view={view} host={host} busy={busy} send={send} />
        {self && !view.testMode && (
          <SaveGames host={host} recording={recording} disabled={connection !== 'online'} choose={setRecordingChoice} />
        )}
        <RoomCode
          view={view}
          busy={busy}
          copy={() => void copyCode()}
          copied={copied}
          setCode={host ? setCode : undefined}
        />
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
        {/* The map, then its Variations (the first category), then the other settings. */}
        <MapChoice view={view} host={host} busy={busy} send={send} />
        {CATEGORIES.map(category => {
          const shown = category.settings.filter(def => def.when?.(view) ?? true);
          if (!shown.length) return null;
          const Extra = category.extra;
          return (
            <fieldset key={category.id} className={`setting-group tone-${category.tone}`}>
              <legend>{category.title}</legend>
              {shown.filter(def => !def.theme).map(renderSetting)}
              {Extra && <Extra view={view} host={host} busy={busy} change={change} />}
              {(Object.keys(THEMES) as Theme[]).map(theme => {
                const rows = shown.filter(def => def.theme === theme);
                return rows.length ? (
                  <fieldset key={theme} className={`setting-theme theme-${theme}`} aria-label={THEMES[theme]}>
                    <span className="setting-theme-title">{THEMES[theme]}</span>
                    {rows.map(renderSetting)}
                  </fieldset>
                ) : null;
              })}
            </fieldset>
          );
        })}
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
            onClick={() => send({ type: 'new-board' })}
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
