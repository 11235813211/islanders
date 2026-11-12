import { Bot, ChevronDown, ChevronUp, Route, WifiOff } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { playerVars } from '../../../shared/colors';
import { type GameView, RESOURCES } from '../../../shared/types';
import { ResourceIcon, SEA } from '../../art';
import { cardStyle, RESOURCE_LABELS } from '../ResourceHand';
import { CardCount, KnightIcon } from './icons';
import { tradableStyle } from './tradables';

const FOLDED_KEY = 'islanders:scoreboard-folded';

/** Whether this viewer folded the scoreboard (portrait phones), remembered in this browser. */
function useFolded(): [boolean, (folded: boolean) => void] {
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(FOLDED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const set = (next: boolean) => {
    setFolded(next);
    try {
      localStorage.setItem(FOLDED_KEY, next ? '1' : '0');
    } catch {
      /* Storage may be disabled. */
    }
  };
  return [folded, set];
}

/**
 * Scoreboard: one row per seat, its name on a block of the seat's color. On a portrait phone it
 * folds (button at its top left) to one line of seat colors and points, giving the board the room.
 */
export default function PlayerPanel({ view, online }: { view: GameView; online: string[] }) {
  const [folded, setFolded] = useFolded();
  return (
    <section className={`player-panel${folded ? ' folded' : ''}`} aria-label="Player scoreboard">
      <button
        type="button"
        className="players-fold icon-button"
        aria-expanded={!folded}
        aria-label={folded ? 'Show the scoreboard' : 'Fold the scoreboard'}
        onClick={() => setFolded(!folded)}
      >
        {folded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
      <FoldedScores view={view} />
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
            <th className="points-goal" title={`Victory points (${view.settings.victoryPoints} to win)`}>
              VP: {view.settings.victoryPoints}
            </th>
          </tr>
        </thead>
        <tbody>
          {view.players.map(p => {
            const offline = !view.testMode && !p.bot && !online.includes(p.id);
            return (
              <tr
                className={[view.activePlayerId === p.id && 'active', offline && 'offline'].filter(Boolean).join(' ')}
                key={p.id}
                data-player-id={p.id}
                style={playerVars(p.color) as CSSProperties}
                aria-label={`${p.name}${view.selfId === p.id ? ', you' : ''}`}
              >
                <th className="player-cell">
                  <span
                    className="player-name"
                    title={`${p.name}${p.bot ? ` · ${p.bot} bot` : ''}${offline ? ' · disconnected' : ''}. ${p.settlementsLeft} settlements, ${p.citiesLeft} cities, ${p.roadsLeft} roads${view.seafaring ? ` and ${p.shipsLeft} ships` : ''} remaining.`}
                  >
                    <span className="player-name-text">
                      {offline && <WifiOff className="offline-mark" size={14} aria-label="Disconnected" />}
                      {p.bot && <Bot size={13} aria-label="Bot" />}
                      {p.name}
                    </span>
                    {p.id === view.selfId && <small>you</small>}
                  </span>
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
      <BankCounts view={view} />
    </section>
  );
}

/** The folded scoreboard: each seat's color with its points; the seat whose turn it is is ringed. */
function FoldedScores({ view }: { view: GameView }) {
  return (
    <ol className="players-strip" aria-label="Points">
      {view.players.map(p => (
        <li
          key={p.id}
          className={view.activePlayerId === p.id ? 'active' : undefined}
          data-player-id={p.id}
          style={playerVars(p.color) as CSSProperties}
          aria-label={`${p.name}: ${p.publicPoints} points`}
        >
          {p.publicPoints}
        </li>
      ))}
    </ol>
  );
}

/** Cards left in the bank, under the scoreboard for everyone, when the room shows them. */
export function BankCounts({ view }: { view: GameView }) {
  const counts = view.bankCounts;
  if (!counts) return null;
  return (
    <>
      <div className="bank-counts" role="group" aria-label="Cards left in the bank">
        <span>Bank</span>
        {RESOURCES.map(r => (
          <span
            key={r}
            className="bank-count"
            style={cardStyle(r)}
            role="img"
            aria-label={`${counts[r]} ${RESOURCE_LABELS[r]}`}
          >
            <ResourceIcon resource={r} size={18} />
            {counts[r]}
          </span>
        ))}
      </div>
      {view.discoveryBank !== null && (
        <div className="bank-counts bank-extras" role="group" aria-label="Discoveries left">
          {/* Same label width as the row above, so the chips line up under the resources. */}
          <span aria-hidden="true" className="bank-label-spacer">
            Bank
          </span>
          <span
            className="bank-count"
            style={tradableStyle('discovery')}
            role="img"
            aria-label={`${view.discoveryBank} discoveries`}
          >
            <SEA.DiscoveryIcon size={18} />
            {view.discoveryBank}
          </span>
        </div>
      )}
    </>
  );
}
