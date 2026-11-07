import { Bot, Route } from 'lucide-react';
import type { CSSProperties } from 'react';
import { playerVars } from '../../../shared/colors';
import type { GameView } from '../../../shared/types';
import { CardCount, KnightIcon } from './icons';

/** Scoreboard: one row per seat, its name on a block of the seat's color. */
export default function PlayerPanel({ view, online }: { view: GameView; online: string[] }) {
  return (
    <section className="player-panel" aria-label="Player scoreboard">
      <table className="player-table">
        <thead>
          <tr>
            <th>Players</th>
            <th title="Resource cards">
              <span className="mini-card" />
              <span className="sr-only">Resources</span>
            </th>
            <th title="Development cards">
              <span className="mini-card dev" />
              <span className="sr-only">Development cards</span>
            </th>
            <th title="Longest road length">
              <Route size={16} />
              <span className="sr-only">Road</span>
            </th>
            <th title="Knights played">
              <KnightIcon />
              <span className="sr-only">Knights</span>
            </th>
            <th title="Victory points">VP</th>
          </tr>
        </thead>
        <tbody>
          {view.players.map(p => {
            const offline = !view.testMode && !p.bot && !online.includes(p.id);
            return (
              <tr
                className={view.activePlayerId === p.id ? 'active' : ''}
                key={p.id}
                style={playerVars(p.color) as CSSProperties}
                aria-label={`${p.name}${view.selfId === p.id ? ', you' : ''}`}
              >
                <th className="player-cell">
                  <span
                    className="player-name"
                    title={`${p.name}${p.bot ? ` · ${p.bot} bot` : ''}${offline ? ' · disconnected' : ''}. ${p.settlementsLeft} settlements, ${p.citiesLeft} cities and ${p.roadsLeft} roads remaining.`}
                  >
                    <span className="player-name-text">
                      {p.bot && <Bot size={13} aria-label="Bot" />}
                      {p.name}
                    </span>
                    {p.id === view.selfId && <small>you</small>}
                  </span>
                  {offline && <span className="offline-dot" title="Disconnected" />}
                </th>
                <td aria-label={`${p.resourceCount} resource cards`}>
                  <CardCount count={p.resourceCount} />
                </td>
                <td aria-label={`${p.developmentCount} development cards`}>
                  {p.developmentCount > 0 && <CardCount count={p.developmentCount} development />}
                </td>
                <td
                  className={view.longestRoadId === p.id ? 'award' : ''}
                  title={view.longestRoadId === p.id ? 'Longest Road · 2 points' : 'Longest road length'}
                >
                  {p.longestRoad}
                </td>
                <td
                  className={view.largestArmyId === p.id ? 'award' : ''}
                  title={view.largestArmyId === p.id ? 'Largest Army · 2 points' : 'Knights played'}
                >
                  {p.knights}
                </td>
                <td
                  className="points"
                  title={
                    p.points !== p.publicPoints
                      ? `${p.publicPoints} public points · ${p.points} including victory cards`
                      : `${p.points} public points`
                  }
                >
                  {p.publicPoints}
                  {p.points !== p.publicPoints && <span className="private-points"> ({p.points})</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
