import { AlertTriangle, Map as MapIcon } from 'lucide-react';
import { useState } from 'react';
import { TUNING } from '../../../shared/default-settings';
import { boardPlayerCount, proposalsBy } from '../../../shared/engine';
import { type BoardDesign, designFor } from '../../../shared/maps';
import type { GameAction, GameView } from '../../../shared/types';
import { useBoardLibrary } from '../../hooks/useBoardLibrary';
import MapBrowser from '../maps/MapBrowser';
import MapThumbnail from '../maps/MapThumbnail';
import { BASE_MAP_ID, baseIslandFor, playerRange, roomMapPlayers, roomMapWarning } from '../maps/mapInfo';
import type { Proposing } from '../maps/ProposeButton';
import BoardPlayers from './BoardPlayers';
import MapProposals from './MapProposals';

/** The Maps button's words: the host chooses, seated people propose, spectators look. */
function mapsLabel(host: boolean, seated: boolean): string {
  if (host) return 'Choose map';
  return seated ? 'Propose map' : 'Maps';
}

/**
 * The lobby's map: the standard island or a chosen map, previewed as designed (the actual layout
 * is drawn when the game starts). Everyone can browse maps; the host chooses, and everyone seated
 * (the host too) can propose up to three maps for the table to look at (MapProposals).
 */
export default function MapChoice({
  view,
  host,
  busy,
  send,
}: {
  view: GameView;
  host: boolean;
  busy: boolean;
  send: (action: GameAction) => void;
}) {
  // Open maps browser, maybe straight to one map (a proposal's View).
  const [browsing, setBrowsing] = useState<{ initial?: { design: BoardDesign; layoutFor: number | null } } | null>(
    null,
  );
  const { library, error } = useBoardLibrary();
  const map = view.map;
  // What people browse and propose for; the warning below is about who is actually seated.
  const players = boardPlayerCount(view);
  const base = baseIslandFor(players);
  const found = map && library?.boards.find(b => b.id === map.id);
  // The thumbnail shows the layout that will be played.
  const design = map ? found && designFor(found, map.layout?.min ?? players) : base;
  const warning = map && roomMapWarning(map, view.players.length);
  const layoutOf = (layoutFor?: number) => (layoutFor === undefined ? {} : { layoutFor });
  const propose: Proposing | undefined =
    view.role === 'player'
      ? {
          toggle: (chosen, layoutFor) => send({ type: 'propose-map', mapId: chosen.id, ...layoutOf(layoutFor) }),
          backs: (mapId, layoutFor) =>
            view.mapProposals.some(p => p.mapId === mapId && p.layoutFor === layoutFor && p.by.includes(view.selfId)),
          left: TUNING.mapProposalsPerPlayer - proposalsBy(view.mapProposals, view.selfId),
        }
      : undefined;
  return (
    <div className="map-choice">
      <div className="mode-card tone-sea">
        {design && <MapThumbnail tiles={design.tiles} label={`${design.name} preview`} />}
        <div>
          <h3>{map?.name ?? base.name}</h3>
          <p>{map ? roomMapPlayers(map) : playerRange(base.players)} players · a new layout every game</p>
        </div>
        <button type="button" className="button secondary" disabled={busy} onClick={() => setBrowsing({})}>
          <MapIcon size={17} />
          {mapsLabel(host, view.role === 'player')}
        </button>
      </div>
      {host && <BoardPlayers view={view} busy={busy} send={send} />}
      <MapProposals
        view={view}
        host={host}
        busy={busy}
        boards={library?.boards}
        send={send}
        open={(design, layoutFor) => setBrowsing({ initial: { design, layoutFor } })}
      />
      {warning && (
        <p className="map-warning" role="note">
          <AlertTriangle size={17} />
          {warning}
        </p>
      )}
      {browsing && (
        <MapBrowser
          library={library}
          error={error}
          players={players}
          planned={view.boardPlayers !== null}
          currentId={map?.id ?? BASE_MAP_ID}
          currentLayout={map?.layout ?? null}
          initial={browsing.initial}
          propose={propose}
          choose={
            host
              ? (chosen, layoutFor) => {
                  send({ type: 'choose-map', mapId: chosen.id, ...layoutOf(layoutFor) });
                  setBrowsing(null);
                }
              : undefined
          }
          close={() => setBrowsing(null)}
        />
      )}
    </div>
  );
}
