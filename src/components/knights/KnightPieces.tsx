import { KNIGHT_NAMES, TRACK_INFO, type Track } from '../../../shared/knights';
import type { GameView, Vertex } from '../../../shared/types';
import { KNIGHTS } from '../../art';
import { keyboardActivate } from '../game/BoardConfirm';

/** Corners and edges a Cities & Knights move can pick (a knight, a wall, a card's target), and the pick. */
export interface SpotPicking {
  vertices: string[];
  edges: string[];
  hint: string;
  label: (id: string) => string;
  onPick: (id: string) => void;
}

type Corners = Map<string, Vertex>;

/** City walls, drawn under the cities they ring. */
export function KnightWalls({
  view,
  vertices,
  color,
}: {
  view: GameView;
  vertices: Corners;
  color: (id: string) => string;
}) {
  const ck = view.ck;
  if (!ck) return null;
  return (
    <g className="ck-walls" aria-hidden="true">
      {ck.walls.map(v => {
        const at = vertices.get(v);
        const owner = view.buildings[v]?.playerId;
        return at && owner ? (
          <g key={v} transform={`translate(${at.x} ${at.y - 3})`}>
            <KNIGHTS.CityWall color={color(owner)} />
          </g>
        ) : null;
      })}
    </g>
  );
}

/**
 * Knights, metropolis banners, and the merchant. Your own knights with something to do are buttons
 * (`onKnight`), so a tap opens what they can do.
 */
export function KnightPieces({
  view,
  vertices,
  color,
  playerName,
  onKnight,
  disabled,
}: {
  view: GameView;
  vertices: Corners;
  color: (id: string) => string;
  playerName: (id: string) => string | undefined;
  onKnight?: (vertexId: string) => void;
  disabled: boolean;
}) {
  const ck = view.ck;
  if (!ck) return null;
  const legal = ck.legal;
  const actionable = new Set([...legal.activate, ...legal.promote, ...Object.keys(legal.moves), ...legal.chase]);
  const merchantHex = ck.merchant && view.board.hexes.find(h => h.id === ck.merchant!.hexId);
  return (
    <g className="ck-pieces">
      {(Object.entries(ck.metropolis) as [Track, string | null][]).map(([track, v]) => {
        const at = v && vertices.get(v);
        return at ? (
          <g
            key={track}
            transform={`translate(${at.x} ${at.y - 3})`}
            aria-label={`${TRACK_INFO[track].name} metropolis`}
          >
            <title>{`${playerName(view.buildings[v!]?.playerId ?? '')}'s ${TRACK_INFO[track].name.toLowerCase()} metropolis`}</title>
            <KNIGHTS.Metropolis track={track} />
          </g>
        ) : null;
      })}
      {merchantHex && (
        <g transform={`translate(${merchantHex.x + 20} ${merchantHex.y - 18})`}>
          <title>{`${playerName(ck.merchant!.playerId)}'s merchant`}</title>
          <KNIGHTS.Merchant color={color(ck.merchant!.playerId)} />
        </g>
      )}
      {Object.entries(ck.knights).map(([v, knight]) => {
        const at = vertices.get(v);
        if (!at) return null;
        const name = `${playerName(knight.playerId)}'s ${KNIGHT_NAMES[knight.level].toLowerCase()}, ${knight.active ? 'active' : 'inactive'}`;
        const tappable = !disabled && !!onKnight && actionable.has(v);
        return (
          <g
            key={v}
            transform={`translate(${at.x} ${at.y})`}
            className={tappable ? 'board-target ck-knight-target' : undefined}
            role={tappable ? 'button' : 'img'}
            tabIndex={tappable ? 0 : undefined}
            aria-label={tappable ? `${name}. Choose what it does` : name}
            onClick={tappable ? () => onKnight!(v) : undefined}
            onKeyDown={tappable ? event => keyboardActivate(event, () => onKnight!(v)) : undefined}
          >
            <title>{name}</title>
            {tappable && <circle r="20" className="ck-knight-ring" />}
            {/* Drawn larger than a settlement's corner mark so strength and state read at a glance. */}
            <g transform="scale(1.35)">
              <KNIGHTS.Knight color={color(knight.playerId)} level={knight.level} active={knight.active} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** Targets for a Cities & Knights pick: pulsing corners and edges. */
export function SpotTargets({
  spots,
  vertices,
  edgeEnds,
}: {
  spots: SpotPicking;
  vertices: Corners;
  edgeEnds: (edgeId: string) => readonly [Vertex, Vertex];
}) {
  return (
    <g className="ck-spot-targets">
      {spots.edges.map(edgeId => {
        const [a, b] = edgeEnds(edgeId);
        return (
          <g
            key={edgeId}
            className="board-target board-road-target"
            role="button"
            tabIndex={0}
            aria-label={spots.label(edgeId)}
            onClick={() => spots.onPick(edgeId)}
            onKeyDown={event => keyboardActivate(event, () => spots.onPick(edgeId))}
          >
            <line
              className="board-hit-area"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="transparent"
              strokeWidth="22"
              strokeLinecap="round"
            />
            <line
              className="board-target-mark ck-edge-mark"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#ffe08a"
              strokeWidth="6"
              strokeDasharray="2 5"
              strokeLinecap="round"
            />
          </g>
        );
      })}
      {spots.vertices.map(v => {
        const at = vertices.get(v);
        return at ? (
          <g
            key={v}
            className="board-target board-vertex-target"
            role="button"
            tabIndex={0}
            aria-label={spots.label(v)}
            onClick={() => spots.onPick(v)}
            onKeyDown={event => keyboardActivate(event, () => spots.onPick(v))}
            transform={`translate(${at.x} ${at.y})`}
          >
            <circle r="17" fill="transparent" className="board-hit-area" />
            <circle r="9" className="board-target-mark ck-corner-mark" />
          </g>
        ) : null;
      })}
    </g>
  );
}
