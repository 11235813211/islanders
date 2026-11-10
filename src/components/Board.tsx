import { type CSSProperties, type KeyboardEvent, useId } from 'react';
import { playerColor } from '../../shared/colors';
import type { GameLog, GameView } from '../../shared/types';
import { ArtDefs, BuildingPiece, ROAD_INSET, Road, SEA, SeaDecorations, TERRAIN } from '../art';
import { useFreshLog } from '../hooks/useFreshLog';
import { boardFrame, cameraViewBox } from '../lib/boardCamera';
import { hexPoints } from '../lib/geometry';
import BoardScene, { type Drift } from './BoardScene';
import BoardDice from './game/BoardDice';
import BoardEffects, { risingSettlements } from './game/BoardEffects';
import './Board.css';

export type PlaceKind = 'road' | 'ship' | 'settlement' | 'city';
export type BoardMode = PlaceKind | 'robber' | 'move-ship' | null;
/** A picked spot waiting for confirmation. `choices` lists both pieces when a coastal edge takes either. */
export interface Selection {
  kind: PlaceKind;
  id: string;
  choices?: PlaceKind[];
}

export interface BoardProps {
  view: GameView;
  mode: BoardMode;
  onVertex: (id: string) => void;
  onEdge: (id: string) => void;
  onHex: (id: string) => void;
  disabled?: boolean;
  camera?: { x: number; y: number; zoom: number };
  selected?: Selection | null;
  onConfirm?: (kind: PlaceKind) => void;
  /** While moving a ship: the ship being moved, once picked. */
  moveFrom?: string | null;
  /** The tile the robber or pirate was just moved to, waiting for confirm or cancel. */
  robberPick?: string | null;
  onRobberConfirm?: (confirm: boolean) => void;
}

/**
 * One rhythm for every target. SMIL animations run on the SVG's own clock, so a target added
 * later joins in step, and nothing ever pauses them (hover shows a separate still circle).
 */
const PULSE = {
  dur: '2.2s',
  keyTimes: '0;0.5;1',
  calcMode: 'spline',
  keySplines: '0.42 0 0.58 1;0.42 0 0.58 1',
  repeatCount: 'indefinite',
} as const;
const stillMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** An open corner for a new settlement: a breathing circle, swapped for a still one on hover or once picked. */
function CornerMark() {
  return (
    <>
      <circle className="board-target-mark board-pulse" r="10">
        {!stillMotion() && (
          <>
            <animate attributeName="r" values="6.2;10.8;6.2" {...PULSE} />
            <animate attributeName="opacity" values="0.75;1;0.75" {...PULSE} />
          </>
        )}
      </circle>
      <circle className="board-pulse-hover" r="10.8" />
    </>
  );
}

function keyboardActivate(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

/** Phases where pieces can be bought: your turn, or your slot in the special build phase. */
const buildingPhase = (view: GameView) => view.phase === 'build' || view.phase === 'special-build';

/** Icebergs that drifted on a roll this turn, since this screen opened. */
function icebergDrifts(view: GameView, fresh: GameLog[]): Drift[] {
  const drifts: Drift[] = [];
  for (const entry of fresh) {
    const event = entry.event;
    if (event?.kind !== 'iceberg' || entry.turn !== view.turn) continue;
    drifts.push({ id: entry.id, from: event.hexId, to: event.toHexId ?? event.hexId, die: event.die });
  }
  return drifts;
}

/** Edges to highlight for the current phase and mode. */
function edgeTargetsFor(view: GameView, mode: BoardMode, moveFrom: string | null | undefined): string[] {
  const { legal } = view;
  if (mode === 'move-ship') return moveFrom ? (legal.shipMoves[moveFrom] ?? []) : Object.keys(legal.shipMoves);
  if (mode === 'road') return legal.roads;
  if (mode === 'ship') return legal.ships;
  const linking = view.phase === 'setup-road' || view.phase === 'free-roads';
  if (mode === null && (linking || buildingPhase(view))) return [...legal.roads, ...legal.ships];
  return [];
}

function hintFor(mode: BoardMode, hexes: number, edges: number, moveFrom: string | null | undefined): string {
  if (hexes) return 'Choose a tile for the robber or the pirate';
  if (mode === 'move-ship') return moveFrom ? 'Choose where the ship goes' : 'Choose a ship to move';
  if (edges) return mode === 'ship' ? 'Choose a highlighted sea edge' : 'Choose a highlighted edge';
  return mode === 'city' ? 'Choose a settlement to upgrade' : 'Choose a highlighted corner';
}

/** Interactive board: art comes from BoardScene and src/art; this file owns targets, clicks, and the camera. */
export default function Board({
  view,
  mode,
  onVertex,
  onEdge,
  onHex,
  disabled = false,
  camera = { x: 0, y: 0, zoom: 1 },
  selected,
  onConfirm,
  moveFrom,
  robberPick = null,
  onRobberConfirm,
}: BoardProps) {
  const uid = useId().replace(/:/g, '');
  const picked = robberPick ? view.board.hexes.find(h => h.id === robberPick) : undefined;
  const frame = boardFrame(view.board.hexes);
  const fresh = useFreshLog(view.log);
  const rising = risingSettlements(fresh.filter(entry => entry.turn === view.turn));
  const vertices = new Map(view.board.vertices.map(vertex => [vertex.id, vertex]));
  const edges = new Map(view.board.edges.map(edge => [edge.id, edge]));
  const playerName = (id: string) => view.players.find(player => player.id === id)?.name;
  const color = (playerId: string) => playerColor(view.players.find(player => player.id === playerId)?.color).fill;
  const selfColor = view.players.find(player => player.id === view.selfId)?.color;
  const settlementMode = view.phase === 'setup-settlement' || mode === 'settlement';
  const direct = mode === null && buildingPhase(view);
  const robberMode = view.phase === 'robber' || mode === 'robber';
  const vertexTargets = new Set(
    disabled
      ? []
      : direct
        ? [...view.legal.cities, ...view.legal.settlements]
        : mode === 'city'
          ? view.legal.cities
          : settlementMode
            ? view.legal.settlements
            : [],
  );
  const edgeTargets = new Set(disabled ? [] : edgeTargetsFor(view, mode, moveFrom));
  const hexTargets = new Set(disabled || !robberMode ? [] : view.legal.robberHexes);
  const edgeEnds = (edgeId: string) => {
    const edge = edges.get(edgeId)!;
    return [vertices.get(edge.a)!, vertices.get(edge.b)!] as const;
  };
  const edgeLabel = (edgeId: string) => {
    if (mode === 'move-ship') return moveFrom ? `Move ship to ${edgeId}` : `Move the ship at ${edgeId}`;
    const road = view.legal.roads.includes(edgeId) && mode !== 'ship';
    const ship = view.legal.ships.includes(edgeId) && mode !== 'road';
    return `${road && ship ? 'Build road or ship' : ship ? 'Build ship' : 'Build road'} at ${edgeId}`;
  };
  const isEdge = (kind: PlaceKind) => kind === 'road' || kind === 'ship';
  const selectedPoint = selected
    ? isEdge(selected.kind)
      ? (() => {
          const [a, b] = edgeEnds(selected.id);
          return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        })()
      : vertices.get(selected.id)
    : null;
  const choices = selected?.choices ?? (selected ? [selected.kind] : []);
  const hasTargets = vertexTargets.size + edgeTargets.size + hexTargets.size > 0;
  const showHint = hasTargets && (!direct || mode === 'move-ship') && !selected;
  return (
    <div className={`board-frame${hasTargets ? ' board-has-targets' : ''}`}>
      <svg
        className={`board-svg${selfColor === 'white' ? ' board-light-seat' : ''}`}
        style={{ '--target-color': color(view.selfId) } as CSSProperties}
        viewBox={cameraViewBox(camera, frame)}
        data-frame={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        role="group"
        aria-label="Island game board. Highlighted locations are legal moves."
      >
        <title>Islanders board</title>
        <defs>
          <ArtDefs uid={uid} />
          <SEA.Defs uid={uid} />
          <clipPath id={`${uid}-sea-clip`}>
            <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} rx="18" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${uid}-sea-clip)`}>
          <BoardScene
            uid={uid}
            board={view.board}
            frame={frame}
            robber={picked && picked.terrain !== 'sea' ? picked.id : view.robber}
            pirate={picked?.terrain === 'sea' ? picked.id : view.pirate}
            showClosed={view.phase === 'setup-settlement'}
            drifts={icebergDrifts(view, fresh)}
          />
          {Object.entries(view.roads).map(([edgeId, owner]) => {
            const [a, b] = edgeEnds(edgeId);
            return (
              <g key={edgeId} className="board-road" aria-label={`${playerName(owner)}'s road`}>
                <title>{playerName(owner)}&apos;s road</title>
                <Road from={a} to={b} color={color(owner)} />
              </g>
            );
          })}
          {Object.entries(view.ships).map(([edgeId, owner]) => {
            const [a, b] = edgeEnds(edgeId);
            // Your ships that may move this turn can be picked up straight from the board.
            const movable = !disabled && mode !== 'move-ship' && !!view.legal.shipMoves[edgeId];
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: role is set when the ship can be picked up.
              <g
                key={edgeId}
                className={`board-ship-piece${moveFrom === edgeId ? ' board-ship-moving' : ''}${movable ? ' board-ship-movable' : ''}`}
                aria-label={movable ? `Move the ship at ${edgeId}` : `${playerName(owner)}'s ship`}
                role={movable ? 'button' : undefined}
                tabIndex={movable ? 0 : undefined}
                onClick={movable ? () => onEdge(edgeId) : undefined}
                onKeyDown={movable ? event => keyboardActivate(event, () => onEdge(edgeId)) : undefined}
              >
                <title>{playerName(owner)}&apos;s ship</title>
                <SEA.Ship from={a} to={b} color={color(owner)} />
              </g>
            );
          })}
          {view.board.hexes
            .filter(hex => hexTargets.has(hex.id))
            .map(hex => {
              const pirate = hex.terrain === 'sea';
              return (
                <g
                  key={hex.id}
                  className={`board-target board-hex-target${pirate ? ' board-sea-target' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Move ${pirate ? 'pirate' : 'robber'} to ${TERRAIN[hex.terrain].name}${hex.number ? `, number ${hex.number}` : ''}`}
                  onClick={() => onHex(hex.id)}
                  onKeyDown={event => keyboardActivate(event, () => onHex(hex.id))}
                  transform={`translate(${hex.x} ${hex.y})`}
                >
                  <polygon
                    points={hexPoints(52)}
                    fill="transparent"
                    stroke="#fff5d7"
                    strokeWidth="2.5"
                    strokeDasharray={pirate ? '2 5' : '5 4'}
                  />
                </g>
              );
            })}
          {[...edgeTargets].map(edgeId => {
            const [a, b] = edgeEnds(edgeId);
            const dx = (b.x - a.x) * ROAD_INSET;
            const dy = (b.y - a.y) * ROAD_INSET;
            const seaOnly = !view.legal.roads.includes(edgeId) && mode !== 'road';
            return (
              <g
                key={edgeId}
                className={`board-target board-road-target${selected?.id === edgeId ? ' board-target-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={edgeLabel(edgeId)}
                onClick={() => onEdge(edgeId)}
                onKeyDown={event => keyboardActivate(event, () => onEdge(edgeId))}
              >
                <circle
                  cx={(a.x + b.x) / 2}
                  cy={(a.y + b.y) / 2}
                  r="12"
                  fill="transparent"
                  className="board-hit-area"
                />
                <line
                  className="board-hit-area"
                  x1={a.x + dx}
                  y1={a.y + dy}
                  x2={b.x - dx}
                  y2={b.y - dy}
                  stroke="transparent"
                  strokeWidth="22"
                  strokeLinecap="round"
                />
                <line
                  className="board-target-mark"
                  x1={a.x + dx}
                  y1={a.y + dy}
                  x2={b.x - dx}
                  y2={b.y - dy}
                  stroke="#fff9df"
                  strokeWidth="7"
                  strokeDasharray={seaOnly ? '1 6' : '2 5'}
                  strokeLinecap="round"
                >
                  {!stillMotion() && selected?.id !== edgeId && (
                    <animate attributeName="opacity" values="0.45;1;0.45" {...PULSE} />
                  )}
                </line>
              </g>
            );
          })}
          {Object.entries(view.buildings)
            .sort(([a], [b]) => vertices.get(a)!.y - vertices.get(b)!.y)
            .map(([vertexId, building]) => {
              const vertex = vertices.get(vertexId)!;
              const rise = rising.get(vertexId);
              return (
                <g
                  key={vertexId}
                  transform={`translate(${vertex.x} ${vertex.y - 3})`}
                  className={rise === undefined ? undefined : 'eruption-rise'}
                  style={rise === undefined ? undefined : { animationDelay: `${rise}s` }}
                >
                  <title>
                    {playerName(building.playerId)}&apos;s {building.kind}
                  </title>
                  <BuildingPiece
                    color={color(building.playerId)}
                    city={building.kind === 'city'}
                    style={view.settings.pieceStyle}
                  />
                </g>
              );
            })}
          <BoardEffects view={view} fresh={fresh} vertices={vertices} frame={frame} uid={uid} playerColor={color} />
          {[...vertexTargets].map(vertexId => {
            const vertex = vertices.get(vertexId)!;
            return (
              <g
                key={vertexId}
                className={`board-target board-vertex-target${selected?.id === vertexId ? ' board-target-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`${view.legal.cities.includes(vertexId) ? 'Upgrade to city' : 'Build settlement'} at ${vertexId}`}
                onClick={() => onVertex(vertexId)}
                onKeyDown={event => keyboardActivate(event, () => onVertex(vertexId))}
                transform={`translate(${vertex.x} ${vertex.y})`}
              >
                <circle r="17" fill="transparent" className="board-hit-area" />
                {/* Settlements that can become cities stay clickable but unmarked: the piece itself is the target. */}
                {!view.legal.cities.includes(vertexId) && <CornerMark />}
              </g>
            );
          })}
          {picked && onRobberConfirm && (
            <RobberConfirm at={picked} pirate={picked.terrain === 'sea'} onConfirm={onRobberConfirm} />
          )}
          {selected && selectedPoint && (
            <ConfirmCard
              at={selectedPoint}
              choices={choices}
              view={view}
              color={color(view.selfId)}
              onConfirm={onConfirm}
            />
          )}
          <SeaDecorations frame={frame} />
        </g>
      </svg>
      <BoardDice view={view} />
      {showHint && (
        <div className="board-placement-hint" role="status">
          <span />
          {hintFor(mode, hexTargets.size, edgeTargets.size, moveFrom)}
        </div>
      )}
    </div>
  );
}

/** Confirm or cancel, just above where the robber or pirate was put. */
function RobberConfirm({
  at,
  pirate,
  onConfirm,
}: {
  at: { x: number; y: number };
  pirate: boolean;
  onConfirm: (confirm: boolean) => void;
}) {
  const piece = pirate ? 'pirate' : 'robber';
  return (
    <g className="map-confirm robber-confirm" transform={`translate(${at.x} ${at.y - 62})`}>
      <path d="M-46 18H-6L0 26 6 18H46V-20H-46Z" fill="#fffdf4" stroke="#123d54" strokeWidth="2" />
      {[true, false].map(yes => (
        // biome-ignore lint/a11y/useSemanticElements: an SVG group can't be a <button>.
        <g
          key={String(yes)}
          transform={`translate(${yes ? -22 : 22} 0)`}
          role="button"
          tabIndex={0}
          aria-label={yes ? `Confirm ${piece}` : `Cancel ${piece}`}
          onClick={event => {
            event.stopPropagation();
            onConfirm(yes);
          }}
          onKeyDown={event => keyboardActivate(event, () => onConfirm(yes))}
        >
          <circle r="14" fill={yes ? '#198144' : '#c8473b'} />
          {yes ? (
            <path d="m-6 0 4 4 8-9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          ) : (
            <path d="M-5-5 5 5M5-5-5 5" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          )}
        </g>
      ))}
    </g>
  );
}

/** The card above a picked spot: one confirm button per piece that fits there. */
function ConfirmCard({
  at,
  choices,
  view,
  color,
  onConfirm,
}: {
  at: { x: number; y: number };
  choices: PlaceKind[];
  view: GameView;
  color: string;
  onConfirm?: (kind: PlaceKind) => void;
}) {
  const width = 64 * choices.length;
  return (
    <g className="map-confirm" transform={`translate(${at.x} ${at.y - 42})`}>
      <path
        d={`M${-width / 2} 18H-6L0 26 6 18H${width / 2}V-22H${-width / 2}Z`}
        fill="#fffdf4"
        stroke="#123d54"
        strokeWidth="2"
      />
      {choices.map((kind, i) => (
        <g
          key={kind}
          transform={`translate(${-width / 2 + 32 + i * 64} 0)`}
          role="button"
          tabIndex={0}
          aria-label={`Confirm ${kind}`}
          onClick={event => {
            event.stopPropagation();
            onConfirm?.(kind);
          }}
          onKeyDown={event => keyboardActivate(event, () => onConfirm?.(kind))}
        >
          <rect x="-31" y="-20" width="62" height="36" fill="transparent" />
          {/* The board's own piece art, outlined in a dark tone of the seat color, so even white shows on the cream card. */}
          {kind === 'road' && <Road from={{ x: -26, y: 10 }} to={{ x: 4, y: -14 }} color={color} />}
          {kind === 'ship' && (
            <g transform="translate(-10 0) scale(.8)">
              <SEA.Ship from={{ x: -18, y: 8 }} to={{ x: 18, y: 8 }} color={color} />
            </g>
          )}
          {(kind === 'settlement' || kind === 'city') && (
            <g transform="translate(-11 -1) scale(.75)">
              <BuildingPiece color={color} city={kind === 'city'} style={view.settings.pieceStyle} />
            </g>
          )}
          <circle cx="17" cy="-2" r="10" fill="#198144" />
          <path d="m12 -2 3.5 3.5 6.5-7.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}
