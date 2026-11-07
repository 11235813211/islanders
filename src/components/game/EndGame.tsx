import { Bot, LogOut, Map as MapIcon, RotateCcw, Trophy } from 'lucide-react';
import type { CSSProperties } from 'react';
import { playerVars } from '../../../shared/colors';
import type { GameAction, GameView } from '../../../shared/types';
import { DiceTracker } from './TablePanel';

/** Final standings with hidden points revealed, simple stats, and what to do next. */
export default function EndGame({
  view,
  busy,
  send,
  leave,
  hide,
}: {
  view: GameView;
  busy: boolean;
  send: (a: GameAction) => void;
  leave: () => void;
  hide: () => void;
}) {
  const winner = view.players.find(p => p.id === view.winnerId);
  const standings = [...view.players].sort((a, b) => b.points - a.points);
  const host = view.hostId === view.selfId;
  return (
    <section className="end-game" role="dialog" aria-label="Game over">
      <header>
        <Trophy size={28} />
        <div>
          <h2>{winner ? `${winner.id === view.selfId ? 'You win' : `${winner.name} wins`}` : 'Game over'}</h2>
          <p>
            {winner
              ? `${winner.points} points in ${view.turn} ${view.turn === 1 ? 'turn' : 'turns'}`
              : 'Everyone left before anyone reached the target.'}
          </p>
        </div>
      </header>
      <div className="end-game-scroll">
        <table className="end-standings">
          <thead>
            <tr>
              <th>Player</th>
              <th title="Victory points">VP</th>
              <th title="Cards collected from rolls">Collected</th>
              <th title="Cards taken with the robber / lost to it">Robber</th>
              <th title="Trades with other players">Trades</th>
            </tr>
          </thead>
          <tbody>
            {standings.map(p => (
              <tr key={p.id} style={playerVars(p.color) as CSSProperties}>
                <th>
                  <span className="player-name">
                    <span className="player-name-text">
                      {p.bot && <Bot size={13} aria-label="Bot" />}
                      {p.name}
                    </span>
                  </span>
                </th>
                <td className="points">{p.points}</td>
                <td>{p.stats.gained}</td>
                <td>
                  +{p.stats.stolen} / −{p.stats.lost}
                </td>
                <td>{p.stats.trades}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <DiceTracker view={view} />
      </div>
      <footer>
        <button className="button secondary" onClick={hide}>
          <MapIcon size={18} />
          View board
        </button>
        <button className="button secondary" onClick={leave}>
          <LogOut size={18} />
          Leave
        </button>
        {view.role === 'player' &&
          (host ? (
            <button className="button primary" disabled={busy} onClick={() => send({ type: 'play-again' })}>
              <RotateCcw size={18} />
              Play again
            </button>
          ) : (
            <span className="end-wait">Waiting for the host to start a new game.</span>
          ))}
      </footer>
    </section>
  );
}
