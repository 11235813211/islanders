import type { GameView, Vertex } from '../../../shared/types';
import { BuildingPiece, MegacityPiece } from '../../art';
import type { SpotGroup, SpotPicking } from '../knights/KnightPieces';
import { HexConfirm, keyboardActivate } from './BoardConfirm';
import './group-targets.css';

/** A tapped group waiting for its confirm: Santa lands on `target`, the card stands at `at`. */
export type GroupPick = { groupId: string; target: string; at: { x: number; y: number } };

type Ends = (edgeId: string) => readonly [Vertex, Vertex];

/**
 * The flashing gold halo around every piece of each pickable group (Santa's gift): drawn under the
 * pieces, in each piece's own shape, so roads, settlements, and cities get an outline.
 */
export function GroupGlow({
  view,
  groups,
  picked,
  vertices,
  edgeEnds,
}: {
  view: GameView;
  groups: SpotGroup[];
  picked: GroupPick | null;
  vertices: Map<string, Vertex>;
  edgeEnds: Ends;
}) {
  return (
    <g className="group-glow" aria-hidden="true">
      {groups.map((group, i) => (
        <g
          key={group.id}
          className={`group-glow-set${picked?.groupId === group.id ? ' group-glow-picked' : ''}`}
          // Groups flash out of step, so neighbouring networks read as separate picks.
          style={{ animationDelay: `${(i % 3) * -0.35}s` }}
        >
          {group.edges.map(edgeId => {
            const [a, b] = edgeEnds(edgeId);
            return <line key={edgeId} className="group-glow-road" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
          {group.vertices.map(v => {
            const at = vertices.get(v);
            const building = view.buildings[v];
            if (!at || !building) return null;
            const style = view.settings.pieceStyle;
            return (
              <g key={v} className="group-glow-building" transform={`translate(${at.x} ${at.y - 3})`}>
                {view.megacities.includes(v) ? (
                  <MegacityPiece color="#ffd23f" style={style} />
                ) : (
                  <BuildingPiece color="#ffd23f" city={building.kind === 'city'} style={style} />
                )}
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}

/**
 * Tap areas over each group's roads and buildings (a tap anywhere on a group picks it) and the
 * confirm card for the tapped one. Santa lands on the tapped building, or the group's first one for a road.
 */
export function GroupTargets({
  spots,
  groups,
  picked,
  onPicked,
  vertices,
  edgeEnds,
}: {
  spots: SpotPicking;
  groups: SpotGroup[];
  picked: GroupPick | null;
  onPicked: (pick: GroupPick | null) => void;
  vertices: Map<string, Vertex>;
  edgeEnds: Ends;
}) {
  const text = spots.confirmText ?? spots.label;
  return (
    <g className="group-targets">
      {groups.map(group => (
        <g
          key={group.id}
          className="board-target group-target"
          role="button"
          tabIndex={0}
          aria-label={spots.label(group.id)}
          aria-pressed={picked?.groupId === group.id}
          onKeyDown={event =>
            keyboardActivate(event, () =>
              onPicked({ groupId: group.id, target: group.id, at: vertices.get(group.id) ?? { x: 0, y: 0 } }),
            )
          }
        >
          {group.edges.map(edgeId => {
            const [a, b] = edgeEnds(edgeId);
            const at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            return (
              <line
                key={edgeId}
                className="board-hit-area"
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                strokeWidth="22"
                onClick={() => onPicked({ groupId: group.id, target: group.id, at })}
              />
            );
          })}
          {group.vertices.map(v => {
            const at = vertices.get(v);
            return at ? (
              <circle
                key={v}
                className="board-hit-area"
                cx={at.x}
                cy={at.y}
                r="19"
                onClick={() => onPicked({ groupId: group.id, target: v, at })}
              />
            ) : null;
          })}
        </g>
      ))}
      {picked && (
        <HexConfirm
          at={picked.at}
          piece="santa"
          text={text(picked.target)}
          onConfirm={yes => {
            onPicked(null);
            if (yes) spots.onPick(picked.target);
          }}
        />
      )}
    </g>
  );
}
