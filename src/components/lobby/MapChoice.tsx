import { AlertTriangle, Map as MapIcon, Shuffle } from 'lucide-react';
import { useState } from 'react';
import type { GameAction, GameView } from '../../../shared/types';
import MapPicker, { playersMismatch } from '../maps/MapPicker';
import MapThumbnail from '../maps/MapThumbnail';

const range = (p: { min: number; max: number }) => (p.min === p.max ? `${p.min}` : `${p.min}–${p.max}`);

/**
 * The lobby's map: the standard island or a chosen map, with a preview of this room's draw.
 * Everyone can browse maps; the host switches maps and re-draws the layout.
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
  const [picking, setPicking] = useState(false);
  const map = view.map;
  const players = view.players.length;
  return (
    <div className="map-choice">
      <div className="map-choice-switch" role="radiogroup" aria-label="Map">
        <button
          type="button"
          role="radio"
          aria-checked={!map}
          disabled={!host || busy}
          onClick={() => map && send({ type: 'choose-map', mapId: 'base' })}
        >
          Base game
        </button>
        <button type="button" role="radio" aria-checked={!!map} disabled={busy} onClick={() => setPicking(true)}>
          {host ? 'Choose map' : 'View maps'}
        </button>
      </div>
      <div className="mode-card tone-sea">
        <MapThumbnail board={view.board} label={`Preview of ${map?.name ?? 'the standard island'}`} />
        <div>
          <h3>{map?.name ?? 'Standard island'}</h3>
          <p>
            {map ? `${range(map.players)} players` : '2–4 players'} ·{' '}
            {view.seafaring ? 'ships and islands' : '19 tiles'}
          </p>
        </div>
        <div className="map-choice-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={() => setPicking(true)}>
            <MapIcon size={17} />
            Maps
          </button>
          {host && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              title="Draw the random tiles, numbers, and harbors again"
              onClick={() => send({ type: 'choose-map', mapId: map?.id ?? 'base' })}
            >
              <Shuffle size={17} />
              New layout
            </button>
          )}
        </div>
      </div>
      {map && playersMismatch(map, players) && (
        <p className="map-warning" role="note">
          <AlertTriangle size={17} />
          {map.name} is made for {range(map.players)} players. This room has {players}.
        </p>
      )}
      {picking && (
        <MapPicker
          players={players}
          currentId={map?.id ?? null}
          canChoose={host}
          choose={design => {
            send({ type: 'choose-map', mapId: design.id });
            setPicking(false);
          }}
          close={() => setPicking(false)}
        />
      )}
    </div>
  );
}
