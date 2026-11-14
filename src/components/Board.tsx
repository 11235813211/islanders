import { type CSSProperties, useId } from 'react';
import { playerColor } from '../../shared/colors';
import type { GameLog, GameView } from '../../shared/types';
import { ArtDefs, BuildingPiece, CARTOGRAPHERS, ROAD_INSET, Road, SEA, SeaDecorations, TERRAIN } from '../art';
import { sinceLatestRoll, useFreshLog } from '../hooks/useFreshLog';
import { boardFrame, cameraViewBox } from '../lib/boardCamera';
import { hexPoints } from '../lib/geometry';
import BoardScene, { type Drift } from './BoardScene';
import { ConfirmCard, HexConfirm, keyboardActivate } from './game/BoardConfirm';
import BoardDice from './game/BoardDice';
import BoardEffects, { risingSettlements, volcanoRumbles } from './game/BoardEffects';
import { viewerZones } from './game/routeView';
import ShipPieces from './game/ShipPieces';
import TileTargets, { ChartTaps, type TilePicking } from './game/TileTargets';
import RouteZones from './RouteZones';
import './Board.css';

export type PlaceKind = 'road' | 'ship' | 'settlement' | 'city' | 'relay' | 'survey';
export type BoardMode = PlaceKind | 'robber' | 'move-ship' | 'peek' | 'chart' | 'split' | null;
/** Pieces that go on an edge. */
export const isEdgeKind = (kind: PlaceKind) => kind !== 'settlement' && kind !== 'city';
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
  /** While moving a ship or fitting out a survey ship: that ship, once picked. */
  moveFrom?: string | null;
  /** The tile the robber or pirate was just moved to, or a fog tile to peek at, waiting for confirm or cancel. */
  hexPick?: string | null;
  onHexConfirm?: (confirm: boolean) => void;
  /** Cartographers: tiles the chart, split, or survey tool can pick, and the one picked. */
  tiles?: TilePicking | null;
  /** With no tool picked: a tap on a tile you can chart starts charting it. */
  onChart?: (hexId: string) => void;
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

/** Phases where pieces can be bought: your turn, or your slot in the special build phase. */
const buildingPhase = (view: GameView) => view.phase === 'build' || view.phase === 'special-build';

/** Icebergs that drifted on the latest roll (see sinceLatestRoll). */
function icebergDrifts(rolled: GameLog[]): Drift[] {
  const drifts: Drift[] = [];
  for (const entry of rolled) {
    const event = entry.event;
    if (event?.kind !== 'iceberg') continue;
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
  if (mode === 'relay') return legal.relays;
  const linking = view.phase === 'setup-road' || view.phase === 'free-roads';
  // Relay station spots are road spots too, so a tap there asks which to build.
  if (mode === null && (linking || buildingPhase(view))) return [...legal.roads, ...legal.ships, ...legal.relays];
  return [];
}

function hintFor(
  view: GameView,
  mode: BoardMode,
  hexes: number,
  edges: number,
  moveFrom: string | null | undefined,
): string {
  if (mode === 'chart') return 'Choose a tile to chart';
  if (mode === 'split') return 'Choose a tile to split';
  if (mode === 'survey') return moveFrom ? 'It charts the tiles around your nearest town' : 'Choose a ship out at sea';
  if (mode === 'peek') return 'Choose a fog tile to peek at';
  if (hexes) return view.seafaring ? 'Choose a tile for the robber or the pirate' : 'Choose a tile for the robber';
  if (mode === 'move-ship') return moveFrom ? 'Choose where the ship goes' : 'Choose a ship to move';
  if (mode === 'relay') return 'Place your relay station';
  if (edges) return mode === 'ship' ? 'Place your ship' : 'Place your road';
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
  hexPick = null,
  onHexConfirm,
  tiles = null,
  onChart,
}: BoardProps) {
  const uid = useId().replace(/:/g, '');
  const picked = hexPick ? view.board.hexes.find(h => h.id === hexPick) : undefined;
  // A tile picked by a tool that confirms on the board (the chart tool) gets its card above it.
  const tileConfirm = tiles?.confirm && tiles.picked ? view.board.hexes.find(h => h.id === tiles.picked) : undefined;
  // A fog tile picked to peek at moves no piece.
  const pickedPiece = !picked
    ? null
    : picked.terrain === 'fog'
      ? 'peek'
      : picked.terrain === 'sea'
        ? 'pirate'
        : 'robber';
  const frame = boardFrame(view.board.hexes);
  const fresh = useFreshLog(view.log);
  const rolled = sinceLatestRoll(fresh);
  const rising = risingSettlements(rolled);
  const vertices = new Map(view.board.vertices.map(vertex => [vertex.id, vertex]));
  const edges = new Map(view.board.edges.map(edge => [edge.id, edge]));
  const playerName = (id: string) => view.players.find(player => player.id === id)?.name;
  const color = (playerId: string) => playerColor(view.players.find(player => player.id === playerId)?.color).fill;
  const selfColor = view.players.find(player => player.id === view.selfId)?.color;
  const settlementMode = view.phase === 'setup-settlement' || mode === 'settlement';
  const direct = mode === null && buildingPhase(view);
  const robberMode = view.phase === 'robber' || mode === 'robber';
  // With no tool picked, fog tiles you can peek at are tappable too.
  const peeking = mode === 'peek' || (direct && !robberMode);
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
  const hexTargets = new Set(disabled ? [] : peeking ? view.legal.peekHexes : robberMode ? view.legal.robberHexes : []);
  const edgeEnds = (edgeId: string) => {
    const edge = edges.get(edgeId)!;
    return [vertices.get(edge.a)!, vertices.get(edge.b)!] as const;
  };
  const edgeLabel = (edgeId: string) => {
    if (mode === 'move-ship') return moveFrom ? `Move ship to ${edgeId}` : `Move the ship at ${edgeId}`;
    if (mode === 'relay') return `Build relay station at ${edgeId}`;
    if (!mode && view.legal.relays.includes(edgeId)) return `Build relay station at ${edgeId}`;
    const road = view.legal.roads.includes(edgeId) && mode !== 'ship';
    const ship = view.legal.ships.includes(edgeId) && mode !== 'road';
    return `${road && ship ? 'Build road or ship' : ship ? 'Build ship' : 'Build road'} at ${edgeId}`;
  };
  const selectedPoint = selected
    ? isEdgeKind(selected.kind)
      ? (() => {
          const [a, b] = edgeEnds(selected.id);
          return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        })()
      : vertices.get(selected.id)
    : null;
  const choices = selected?.choices ?? (selected ? [selected.kind] : []);
  // In survey mode the ships themselves are the first targets.
  const pickable = (tiles?.hexes.length ?? 0) + (mode === 'survey' ? view.legal.surveys.length : 0);
  const hasTargets = vertexTargets.size + edgeTargets.size + hexTargets.size + pickable > 0;
  const showHint = hasTargets && (!direct || mode === 'move-ship') && !selected && !tiles?.picked;
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
            robber={pickedPiece === 'robber' ? picked!.id : view.robber}
            pirate={pickedPiece === 'pirate' ? picked!.id : view.pirate}
            showClosed={view.phase === 'setup-settlement'}
            drifts={icebergDrifts(rolled)}
            rumbles={volcanoRumbles(view, rolled)}
            peeks={view.fogPeeks}
          />
          <RouteZones zones={viewerZones(view)} />
          {Object.entries(view.roads).map(([edgeId, owner]) => {
            const [a, b] = edgeEnds(edgeId);
            const relay = view.relays.includes(edgeId);
            const name = `${playerName(owner)}'s ${relay ? 'relay station' : 'road'}`;
            return (
              <g key={edgeId} className="board-road" aria-label={name}>
                <title>{name}</title>
                {relay ? (
                  <CARTOGRAPHERS.Relay from={a} to={b} color={color(owner)} inset={ROAD_INSET} />
                ) : (
                  <Road from={a} to={b} color={color(owner)} />
                )}
              </g>
            );
          })}
          {direct && !disabled && onChart && <ChartTaps view={view} onChart={onChart} />}
          <ShipPieces
            view={view}
            mode={mode}
            disabled={disabled}
            picked={moveFrom}
            ends={edgeEnds}
            color={color}
            playerName={playerName}
            onShip={onEdge}
          />
          {view.board.hexes
            .filter(hex => hexTargets.has(hex.id))
            .map(hex => {
              const pirate = hex.terrain === 'sea';
              return (
                <g
                  key={hex.id}
                  className={`board-target board-hex-target${pirate ? ' board-sea-target' : ''}${hexPick === hex.id ? ' board-target-selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    peeking
                      ? `Peek at the fog tile ${hex.id}`
                      : `Move ${pirate ? 'pirate' : 'robber'} to ${TERRAIN[hex.terrain].name}${hex.number ? `, number ${hex.number}` : ''}`
                  }
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
          {tiles && <TileTargets view={view} tiles={tiles} />}
          <BoardEffects view={view} rolled={rolled} vertices={vertices} frame={frame} uid={uid} playerColor={color} />
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
          <SeaDecorations frame={frame} />
        </g>
        {/* Outside the sea clip, so a card by the board's edge is never cut off. */}
        {picked && pickedPiece && onHexConfirm && (
          <HexConfirm at={picked} piece={pickedPiece} onConfirm={onHexConfirm} />
        )}
        {tileConfirm && tiles?.confirm && (
          <HexConfirm at={tileConfirm} piece="chart" text={tiles.confirm.text} onConfirm={tiles.confirm.onConfirm} />
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
      </svg>
      <BoardDice view={view} />
      {showHint && (
        <div className="board-placement-hint" role="status">
          <span />
          {hintFor(view, mode, hexTargets.size, edgeTargets.size, moveFrom)}
        </div>
      )}
    </div>
  );
}
