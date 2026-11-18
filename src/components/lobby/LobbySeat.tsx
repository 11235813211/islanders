import { Bot, Crown, Eye, Pencil, UserMinus } from 'lucide-react';
import type { CSSProperties } from 'react';
import { BOTS } from '../../../shared/bots';
import { PLAYER_COLORS, playerVars } from '../../../shared/colors';
import { BOT_LEVELS, type BotLevel, type GameAction, type GameView, type PublicPlayer } from '../../../shared/types';

/** One seat in the lobby. The host can change bot levels, move people to spectators, remove seats, and hand over hosting. */
export default function LobbySeat({
  view,
  seat,
  host,
  online,
  busy,
  send,
  rename,
}: {
  view: GameView;
  seat: PublicPlayer;
  host: boolean;
  online: boolean;
  busy: boolean;
  send: (action: GameAction) => void;
  rename: () => void;
}) {
  const isHost = seat.id === view.hostId;
  const self = seat.id === view.selfId;
  const status = seat.bot
    ? `Bot · ${BOTS[seat.bot].label}`
    : isHost
      ? 'Host'
      : view.testMode
        ? 'Test seat'
        : online
          ? 'Connected'
          : 'Offline';
  return (
    <div className="lobby-player" style={playerVars(seat.color) as CSSProperties}>
      <div className="player-avatar">{seat.bot ? <Bot size={22} /> : seat.name.slice(0, 1).toUpperCase()}</div>
      <div>
        <strong>
          {seat.name}
          {self && <small className="you-tag">you</small>}
          {self && (
            <button type="button" className="name-edit" aria-label="Change your name" disabled={busy} onClick={rename}>
              <Pencil size={13} />
            </button>
          )}
        </strong>
        <span>
          {status} · {PLAYER_COLORS[seat.color].label}
        </span>
      </div>
      {isHost && <Crown className="gold" size={22} aria-label="Host" />}
      {host && !self && (
        <div className="seat-controls">
          {seat.bot ? (
            <select
              aria-label={`Bot level for ${seat.name}`}
              value={seat.bot}
              disabled={busy}
              onChange={e => send({ type: 'set-bot-level', playerId: seat.id, level: e.target.value as BotLevel })}
            >
              {BOT_LEVELS.map(level => (
                <option key={level} value={level}>
                  {BOTS[level].label}
                </option>
              ))}
            </select>
          ) : (
            !view.testMode && (
              <button
                className="icon-button"
                aria-label={`Make ${seat.name} host`}
                title="Make host"
                disabled={busy}
                onClick={() => send({ type: 'transfer-host', playerId: seat.id })}
              >
                <Crown size={18} />
              </button>
            )
          )}
          {!seat.bot && !view.testMode && (
            <button
              className="icon-button"
              aria-label={`Move ${seat.name} to spectators`}
              title="Move to spectators"
              disabled={busy}
              onClick={() => send({ type: 'remove-player', playerId: seat.id, watch: true })}
            >
              <Eye size={18} />
            </button>
          )}
          <button
            className="icon-button"
            aria-label={`Remove ${seat.name}`}
            title="Remove from room"
            disabled={busy}
            onClick={() => send({ type: 'remove-player', playerId: seat.id })}
          >
            <UserMinus size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
