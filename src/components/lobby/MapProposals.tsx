import { Check, Eye, Undo2, X } from 'lucide-react';
import { type CSSProperties, useEffect, useState } from 'react';
import { playerVars } from '../../../shared/colors';
import { TUNING } from '../../../shared/default-settings';
import { boardPlayerCount, isLargeGame, proposalsBy } from '../../../shared/engine';
import { type BoardDesign, designFor } from '../../../shared/maps';
import type { GameAction, GameView, MapProposal } from '../../../shared/types';
import MapThumbnail from '../maps/MapThumbnail';
import { BASE_MAP_ID, LARGE_ISLAND, STANDARD_ISLAND } from '../maps/mapInfo';
import './map-proposals.css';

/** How long a proposal this person just withdrew stays, grayed, with Undo. */
const UNDO_MS = 3000;

/** The map a proposal names: the base island for the table's size, or a library map (once loaded). */
function proposalDesign(proposal: MapProposal, boards: BoardDesign[] | undefined, players: number) {
  if (proposal.mapId === BASE_MAP_ID) return isLargeGame(players) ? LARGE_ISLAND : STANDARD_ISLAND;
  return boards?.find(b => b.id === proposal.mapId);
}

const keyOf = (p: Pick<MapProposal, 'mapId' | 'layoutFor'>) => `${p.mapId}:${p.layoutFor}`;
/** propose-map for this proposal: backs it, or takes this person's backing back. */
const proposeAction = (p: MapProposal): GameAction => ({
  type: 'propose-map',
  mapId: p.mapId,
  ...(p.layoutFor === null ? {} : { layoutFor: p.layoutFor }),
});

/** A proposal this person was the only backer of and just withdrew, kept in its place for a moment. */
interface Withdrawn {
  proposal: MapProposal;
  index: number;
}

/**
 * Maps players have put forward, most backed first, each a small preview with a square per backer
 * in their seat color, in an even grid that stays tidy with many. Tapping one backs it (or stops
 * backing it), up to TUNING.mapProposalsPerPlayer each; one this person alone backed stays grayed
 * with Undo for a few seconds. Everyone can View it, and the host also gets Use and Decline.
 */
export default function MapProposals({
  view,
  host,
  busy,
  boards,
  send,
  open,
}: {
  view: GameView;
  host: boolean;
  busy: boolean;
  boards: BoardDesign[] | undefined;
  send: (action: GameAction) => void;
  /** Show this map large, at the proposed layout. */
  open: (design: BoardDesign, layoutFor: number | null) => void;
}) {
  const [withdrawn, setWithdrawn] = useState<Withdrawn | null>(null);
  useEffect(() => {
    if (!withdrawn) return;
    const timer = setTimeout(() => setWithdrawn(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [withdrawn]);
  const players = boardPlayerCount(view);
  const seat = (id: string) => view.players.find(p => p.id === id);
  const choose = (p: MapProposal) =>
    send({ type: 'choose-map', mapId: p.mapId, ...(p.layoutFor === null ? {} : { layoutFor: p.layoutFor }) });
  const seated = view.role === 'player';
  const mineCount = proposalsBy(view.mapProposals, view.selfId);
  const most = TUNING.mapProposalsPerPlayer;
  // Most backed first; ties keep the order they were proposed in.
  const sorted = [...view.mapProposals].sort((a, b) => b.by.length - a.by.length);
  // The withdrawn one comes back to where it was, until it is proposed again or its time is up.
  const ghost = withdrawn && !sorted.some(p => keyOf(p) === keyOf(withdrawn.proposal)) ? withdrawn : null;
  const shown = ghost ? [...sorted.slice(0, ghost.index), ghost.proposal, ...sorted.slice(ghost.index)] : sorted;
  if (!shown.length) return null;
  const back = (p: MapProposal, index: number) => {
    if (p.by.length === 1 && p.by[0] === view.selfId) setWithdrawn({ proposal: p, index });
    send(proposeAction(p));
  };
  return (
    <section className="map-proposals" aria-label="Proposed maps">
      <h4>
        Proposed
        {seated && (
          <small>
            Yours: {mineCount} of {most}
          </small>
        )}
      </h4>
      <div className="map-proposal-list">
        {shown.map((p, index) => {
          const design = proposalDesign(p, boards, players);
          const thumbnail = <MapThumbnail tiles={design ? designFor(design, p.layoutFor ?? players).tiles : []} />;
          if (p === ghost?.proposal)
            return (
              <article className="map-proposal withdrawn" key={keyOf(p)}>
                <button
                  type="button"
                  className="map-proposal-pick"
                  aria-label={`Undo: propose ${p.name} again`}
                  disabled={busy || mineCount >= most}
                  onClick={() => {
                    setWithdrawn(null);
                    send(proposeAction(p));
                  }}
                >
                  {thumbnail}
                  <span className="map-proposal-undo" aria-hidden="true">
                    <Undo2 size={16} />
                    Undo
                  </span>
                  <span className="map-proposal-name">{p.name}</span>
                </button>
              </article>
            );
          const mine = p.by.includes(view.selfId);
          const names = p.by.map(id => seat(id)?.name ?? '').join(', ');
          const viewButton = (
            <button
              type="button"
              className="map-proposal-view"
              aria-label={`View ${p.name}`}
              data-tip={host ? 'View' : undefined}
              disabled={!design}
              onClick={() => design && open(design, p.layoutFor)}
            >
              <Eye size={15} />
              {!host && 'View'}
            </button>
          );
          return (
            <article className="map-proposal" key={keyOf(p)}>
              <button
                type="button"
                className="map-proposal-pick"
                aria-pressed={mine}
                aria-label={`${p.name}, proposed by ${names}. ${mine ? 'Stop backing' : 'Back'} this map`}
                data-tip={mine ? 'Stop backing' : 'Back this map'}
                disabled={busy || !seated || (!mine && mineCount >= most)}
                onClick={() => back(p, index)}
              >
                {thumbnail}
                <span className="map-proposal-backers" aria-hidden="true">
                  {p.by.map(id => (
                    <i key={id} style={playerVars(seat(id)?.color) as CSSProperties} />
                  ))}
                </span>
                <span className="map-proposal-name">{p.name}</span>
              </button>
              {host ? (
                <span className="map-proposal-host">
                  {viewButton}
                  <button
                    type="button"
                    className="map-proposal-use"
                    aria-label={`Use ${p.name}`}
                    data-tip="Use"
                    disabled={busy}
                    onClick={() => choose(p)}
                  >
                    <Check size={15} />
                  </button>
                  <button
                    type="button"
                    className="map-proposal-decline"
                    aria-label={`Decline ${p.name}`}
                    data-tip="Decline"
                    disabled={busy}
                    onClick={() => send({ type: 'decline-map', mapId: p.mapId })}
                  >
                    <X size={15} />
                  </button>
                </span>
              ) : (
                viewButton
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
