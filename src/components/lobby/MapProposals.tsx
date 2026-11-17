import { Check, Eye, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { playerVars } from '../../../shared/colors';
import { isLargeGame } from '../../../shared/engine';
import { type BoardDesign, designFor } from '../../../shared/maps';
import type { GameAction, GameView, MapProposal } from '../../../shared/types';
import MapThumbnail from '../maps/MapThumbnail';
import { LARGE_ISLAND, STANDARD_ISLAND } from '../maps/mapInfo';
import './map-proposals.css';

/** The map a proposal names: the base island for the table's size, or a library map (once loaded). */
function proposalDesign(proposal: MapProposal, boards: BoardDesign[] | undefined, players: number) {
  if (proposal.mapId === 'base') return isLargeGame(players) ? LARGE_ISLAND : STANDARD_ISLAND;
  return boards?.find(b => b.id === proposal.mapId);
}

/**
 * Maps players have put forward, each a small preview with a square per backer in their seat
 * color. Tapping one backs it (or stops backing it); everyone can View it, and the host also gets
 * Use and Decline.
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
  if (!view.mapProposals.length) return null;
  const players = view.players.length;
  const seat = (id: string) => view.players.find(p => p.id === id);
  const choose = (p: MapProposal) =>
    send({ type: 'choose-map', mapId: p.mapId, ...(p.layoutFor === null ? {} : { layoutFor: p.layoutFor }) });
  const back = (p: MapProposal) =>
    send({ type: 'propose-map', mapId: p.mapId, ...(p.layoutFor === null ? {} : { layoutFor: p.layoutFor }) });
  return (
    <section className="map-proposals" aria-label="Proposed maps">
      <h4>Proposed</h4>
      <div className="map-proposal-list">
        {view.mapProposals.map(p => {
          const mine = p.by.includes(view.selfId);
          const names = p.by.map(id => seat(id)?.name ?? '').join(', ');
          const design = proposalDesign(p, boards, players);
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
            <article className="map-proposal" key={`${p.mapId}:${p.layoutFor}`}>
              <button
                type="button"
                className="map-proposal-pick"
                aria-pressed={mine}
                aria-label={`${p.name}, proposed by ${names}. ${mine ? 'Stop backing' : 'Back'} this map`}
                data-tip={mine ? 'Stop backing' : 'Back this map'}
                disabled={busy || view.role !== 'player'}
                onClick={() => back(p)}
              >
                <MapThumbnail tiles={design ? designFor(design, p.layoutFor ?? players).tiles : []} />
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
