import { AlertTriangle, Map as MapIcon } from 'lucide-react';
import { useState } from 'react';
import { isLargeGame } from '../../../shared/engine';
import type { GameAction, GameView } from '../../../shared/types';
import { useBoardLibrary } from '../../hooks/useBoardLibrary';
import MapBrowser from '../maps/MapBrowser';
import MapThumbnail from '../maps/MapThumbnail';
import { LARGE_ISLAND, playerRange, playersMismatch, STANDARD_ISLAND } from '../maps/mapInfo';

/**
 * The lobby's map: the standard island or a chosen map, previewed as designed (the actual layout
 * is drawn when the game starts). Everyone can browse maps; the host chooses.
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
  const [browsing, setBrowsing] = useState(false);
  const { library, error } = useBoardLibrary();
  const map = view.map;
  const players = view.players.length;
  const base = isLargeGame(players) ? LARGE_ISLAND : STANDARD_ISLAND;
  const design = map ? library?.boards.find(b => b.id === map.id) : base;
  return (
    <div className="map-choice">
      <div className="map-choice-switch" role="radiogroup" aria-label="Map">
        {/* biome-ignore lint/a11y/useSemanticElements: a two-way segmented control of buttons. */}
        <button
          type="button"
          role="radio"
          aria-checked={!map}
          disabled={!host || busy}
          onClick={() => map && send({ type: 'choose-map', mapId: 'base' })}
        >
          Base game
        </button>
        {/* biome-ignore lint/a11y/useSemanticElements: a two-way segmented control of buttons. */}
        <button type="button" role="radio" aria-checked={!!map} disabled={busy} onClick={() => setBrowsing(true)}>
          {host ? 'Choose map' : 'View maps'}
        </button>
      </div>
      <div className="mode-card tone-sea">
        {design && <MapThumbnail tiles={design.tiles} label={`${design.name} preview`} />}
        <div>
          <h3>{map?.name ?? base.name}</h3>
          <p>{playerRange((map ?? base).players)} players · a new layout every game</p>
        </div>
        <button type="button" className="button secondary" disabled={busy} onClick={() => setBrowsing(true)}>
          <MapIcon size={17} />
          Maps
        </button>
      </div>
      {map && playersMismatch(map, players) && (
        <p className="map-warning" role="note">
          <AlertTriangle size={17} />
          {map.name} is made for {playerRange(map.players)} players. This room has {players}.
        </p>
      )}
      {browsing && (
        <MapBrowser
          library={library}
          error={error}
          players={players}
          currentId={map?.id ?? null}
          canChoose={host}
          choose={chosen => {
            send({ type: 'choose-map', mapId: chosen.id });
            setBrowsing(false);
          }}
          close={() => setBrowsing(false)}
        />
      )}
    </div>
  );
}
