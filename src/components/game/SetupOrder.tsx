import type { CSSProperties } from 'react';
import { playerVars } from '../../../shared/colors';
import { roundForward, setupPieces } from '../../../shared/maps/special';
import type { GameView } from '../../../shared/types';
import './setup-order.css';

/**
 * Who places in each setup round, shown while setup runs on maps that change it (more rounds or
 * cities). One row per round with its piece; each seat is a dot in its color, the one placing now
 * ringed, finished steps faded. Rounds alternate direction so going first early means going last later.
 */
export default function SetupOrder({ view }: { view: GameView }) {
  const rules = view.board.rules;
  if (!rules?.setup || !view.phase.startsWith('setup')) return null;
  const pieces = setupPieces(rules);
  const seats = view.players.length;
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? '';
  const color = (id: string) => view.players.find(p => p.id === id)?.color;
  return (
    <section className="setup-order" aria-label="Setup order">
      {pieces.map((piece, round) => {
        const steps = view.setupOrder.slice(round * seats, (round + 1) * seats);
        return (
          <div key={round} className="setup-round">
            <span className="setup-round-label" title={roundForward(round) ? 'First to last' : 'Last to first'}>
              {round + 1}
              <small>{piece === 'city' ? 'City' : 'Settle'}</small>
            </span>
            <ol
              className="setup-steps"
              aria-label={`Round ${round + 1}, ${roundForward(round) ? 'first to last' : 'last to first'}`}
            >
              {steps.map((id, i) => {
                const step = round * seats + i;
                const state = step < view.setupIndex ? 'done' : step === view.setupIndex ? 'now' : 'later';
                return (
                  <li
                    key={step}
                    className={`setup-step ${state}${id === view.selfId ? ' mine' : ''}`}
                    style={playerVars(color(id)) as CSSProperties}
                    title={`${name(id)}${id === view.selfId ? ' (you)' : ''}: ${piece}`}
                    aria-label={`${name(id)}${state === 'now' ? ', placing now' : ''}`}
                  />
                );
              })}
            </ol>
          </div>
        );
      })}
    </section>
  );
}
