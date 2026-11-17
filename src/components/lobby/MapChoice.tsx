import { AlertTriangle, Map as MapIcon } from 'lucide-react';
import { useState } from 'react';
import { isLargeGame } from '../../../shared/engine';
import { type BoardDesign, designFor } from '../../../shared/maps';
import type { GameAction, GameView } from '../../../shared/types';
import { useBoardLibrary } from '../../hooks/useBoardLibrary';
import MapBrowser from '../maps/MapBrowser';
import MapThumbnail from '../maps/MapThumbnail';
import { LARGE_ISLAND, playerRange, roomMapPlayers, roomMapWarning, STANDARD_ISLAND } from '../maps/mapInfo';
import MapProposals from './MapProposals';

/**
 * The lobby's map: the standard island or a chosen map, previewed as designed (the actual layout
 * is drawn when the game starts). Everyone can browse maps; the host chooses, and the others
 * propose maps for the host to pick (MapProposals).
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
  const players = view.players.length;
  const base = isLargeGame(players) ? LARGE_ISLAND : STANDARD_ISLAND;
  const found = map && library?.boards.find(b => b.id === map.id);
  // The thumbnail shows the layout that will be played.
  const design = map ? found && designFor(found, map.layout?.min ?? players) : base;
  const warning = map && roomMapWarning(map, players);
  // The host picks; other seated people propose (spectators only look).
  const canPick = host || view.role === 'player';
  return (
    <div className="map-choice">
      <div className="map-choice-switch" role="radiogroup" aria-label="Map">
        {/* biome-ignore lint/a11y/useSemanticElements: a two-way segmented control of buttons. */}
        <button
          type="button"
          role="radio"
          aria-checked={!map}
          disabled={!canPick || busy || (!host && !map)}
          data-tip={host ? undefined : 'Propose the base game'}
          onClick={() => map && send({ type: host ? 'choose-map' : 'propose-map', mapId: 'base' })}
        >
          Base game
        </button>
        {/* biome-ignore lint/a11y/useSemanticElements: a two-way segmented control of buttons. */}
        <button type="button" role="radio" aria-checked={!!map} disabled={busy} onClick={() => setBrowsing({})}>
          {host ? 'Choose map' : canPick ? 'Propose map' : 'View maps'}
        </button>
      </div>
      <div className="mode-card tone-sea">
        {design && <MapThumbnail tiles={design.tiles} label={`${design.name} preview`} />}
        <div>
          <h3>{map?.name ?? base.name}</h3>
          <p>{map ? roomMapPlayers(map) : playerRange(base.players)} players · a new layout every game</p>
        </div>
        <button type="button" className="button secondary" disabled={busy} onClick={() => setBrowsing({})}>
          <MapIcon size={17} />
          Maps
        </button>
      </div>
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
          currentId={map?.id ?? base.id}
          currentLayout={map?.layout ?? null}
          canChoose={canPick}
          proposing={!host}
          initial={browsing.initial}
          choose={(chosen, layoutFor) => {
            const type = host ? 'choose-map' : 'propose-map';
            send({ type, mapId: chosen.id, ...(layoutFor === undefined ? {} : { layoutFor }) });
            setBrowsing(null);
          }}
          close={() => setBrowsing(null)}
        />
      )}
    </div>
  );
}
