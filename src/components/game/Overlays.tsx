import { Check, Pause, UserRound, X } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { playerVars } from '../../../shared/colors';
import { emptyBag, resourceCount } from '../../../shared/engine';
import type { GameAction, GameView } from '../../../shared/types';
import { ResourcePicker } from '../TradePanel';
import { CardCount } from './icons';

interface OverlayProps {
  view: GameView;
  busy: boolean;
  send: (a: GameAction) => void;
}

export function DiscardPanel({ view, busy, send }: OverlayProps) {
  const [bag, setBag] = useState(emptyBag);
  const needed = view.pendingDiscards[view.selfId];
  return (
    <section className="discard-overlay" aria-label="Discard resources">
      <h3>Discard {needed} resources</h3>
      <ResourcePicker value={bag} setValue={setBag} limit={view.hand} prefix="Discard" />
      <button
        className="button primary full"
        disabled={busy || resourceCount(bag) !== needed}
        onClick={() => send({ type: 'discard', resources: bag })}
      >
        Return {resourceCount(bag)} / {needed}
      </button>
    </section>
  );
}

export function ProposalNotice({ view, busy, send }: OverlayProps) {
  const p = view.proposal;
  if (!p) return null;
  const canVote = !p.rejected.length && p.required.includes(view.selfId) && !p.accepted.includes(view.selfId);
  return (
    <div className="proposal-notice" role="region" aria-label="Game proposal">
      <div>
        <strong>{p.kind === 'undo' ? 'Undo move?' : p.kind === 'pause' ? 'Pause game?' : 'Resume game?'}</strong>
        <span>{p.description}</span>
        <div className="proposal-voters">
          {p.required.map(id => {
            const player = view.players.find(player => player.id === id)!;
            const yes = p.accepted.includes(id);
            const no = p.rejected.includes(id);
            return (
              <span
                key={id}
                role="img"
                className={yes ? 'yes' : no ? 'no' : 'pending'}
                aria-label={`${player.name}: ${yes ? 'yes' : no ? 'no' : 'not yet approved'}`}
              >
                <span className="vote-avatar" style={playerVars(player.color) as CSSProperties}>
                  {player.name.slice(0, 1)}
                </span>
                {yes ? <Check size={15} /> : <X size={15} />}
                <span>{player.name}</span>
              </span>
            );
          })}
        </div>
      </div>
      {canVote ? (
        <>
          <button
            className="accept-trade"
            aria-label="Approve proposal"
            disabled={busy}
            onClick={() => send({ type: 'vote', proposalId: p.id, accept: true })}
          >
            <Check size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Reject proposal"
            disabled={busy}
            onClick={() => send({ type: 'vote', proposalId: p.id, accept: false })}
          >
            <X size={18} />
          </button>
        </>
      ) : (
        <small>{p.rejected.length ? 'Declined' : 'Waiting for votes'}</small>
      )}
    </div>
  );
}

export function StealChooser({
  view,
  blocked,
  send,
}: {
  view: GameView;
  blocked: boolean;
  send: (a: GameAction) => void;
}) {
  return (
    <section className="steal-choices" aria-label="Choose a player to steal from">
      <strong>Take a random resource from…</strong>
      <div>
        {view.legal.stealTargets.map(id => {
          const player = view.players.find(p => p.id === id)!;
          return (
            <button
              key={id}
              aria-label={`Steal from ${player.name}`}
              style={playerVars(player.color, 'victim') as CSSProperties}
              disabled={blocked}
              onClick={() => send({ type: 'steal', playerId: id })}
            >
              <span className="victim-avatar">
                <UserRound size={28} />
              </span>
              <span>{player.name}</span>
              <CardCount count={player.resourceCount} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function PausedNotice() {
  return (
    <div className="paused-notice">
      <Pause size={18} />
      Paused · clocks are stopped
    </div>
  );
}
