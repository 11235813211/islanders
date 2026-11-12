import { Bot, LogOut, Map as MapIcon, RotateCcw, Trophy } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { playerVars } from '../../../shared/colors';
import type { GameAction, GameView } from '../../../shared/types';
import { STAT_CATEGORIES, type StatCategory, visibleColumns } from './endStats';
import { DiceTracker } from './TablePanel';

/** Final standings with hidden points revealed, stats by category, and what to do next. */
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
  const [category, setCategory] = useState(STAT_CATEGORIES[0]!);
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
        <StatTabs selected={category} select={setCategory} />
        <StatTable view={view} category={category} />
        {category.id === 'dice' && <DiceTracker view={view} />}
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

/** Buttons choosing which category of stats the table shows. */
function StatTabs({ selected, select }: { selected: StatCategory; select: (category: StatCategory) => void }) {
  return (
    <div className="stat-tabs" role="tablist" aria-label="Stats">
      {STAT_CATEGORIES.map(category => (
        <button
          key={category.id}
          role="tab"
          aria-selected={category.id === selected.id}
          className={category.id === selected.id ? 'selected' : ''}
          onClick={() => select(category)}
        >
          {category.label}
        </button>
      ))}
    </div>
  );
}

/** One category's numbers: a row per player, best score first. */
function StatTable({ view, category }: { view: GameView; category: StatCategory }) {
  const standings = [...view.players].sort((a, b) => b.points - a.points);
  const columns = visibleColumns(category, view);
  return (
    <div className="end-table-scroll">
      <table className="end-standings" aria-label={category.label}>
        <thead>
          <tr>
            <th>Player</th>
            {columns.map((column, index) => (
              <th key={index} title={column.title}>
                {column.label}
              </th>
            ))}
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
              {columns.map((column, index) => (
                <td key={index} className={column.total ? 'points' : undefined}>
                  {column.value(p, view)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
