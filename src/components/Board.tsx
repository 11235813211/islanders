import { type CSSProperties, type KeyboardEvent, useId } from 'react';
import { playerColor } from '../../shared/colors';
import type { GameView } from '../../shared/types';
import {
  ArtDefs,
  BuildingPiece,
  Harbor,
  HexTile,
  NumberToken,
  Road,
  Robber,
  SeaBackdrop,
  SeaDecorations,
  TERRAIN,
} from '../art';
import { cameraViewBox } from '../lib/boardCamera';
import { hexPoints } from '../lib/geometry';
import './Board.css';

export interface BoardProps {
  view: GameView;
  mode: 'road' | 'settlement' | 'city' | 'robber' | null;
  onVertex: (id: string) => void;
  onEdge: (id: string) => void;
  onHex: (id: string) => void;
  disabled?: boolean;
  camera?: { x: number; y: number; zoom: number };
  selected?: { kind: 'road' | 'settlement' | 'city'; id: string } | null;
  onConfirm?: () => void;
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

/** A legal corner: a breathing circle (a ring around a settlement that can become a city). */
function CornerMark({ ring }: { ring: boolean }) {
  const r = ring ? 16 : 10;
  const kind = ring ? ' board-pulse-ring' : '';
  return (
    <>
      <circle className={`board-target-mark board-pulse${kind}`} r={r}>
        {!stillMotion() && (
          <>
            <animate attributeName="r" values={`${r * 0.62};${r * 1.08};${r * 0.62}`} {...PULSE} />
            <animate attributeName="opacity" values="0.75;1;0.75" {...PULSE} />
          </>
        )}
      </circle>
      <circle className={`board-pulse-hover${kind}`} r={r * 1.08} />
    </>
  );
}

function keyboardActivate(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

/** Interactive board: art comes from src/art; this file owns targets, clicks, and the camera. */
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
}: BoardProps) {
  const uid = useId().replace(/:/g, '');
  const vertices = new Map(view.board.vertices.map(vertex => [vertex.id, vertex]));
  const playerName = (id: string) => view.players.find(player => player.id === id)?.name;
  const color = (playerId: string) => playerColor(view.players.find(player => player.id === playerId)?.color).fill;
  const settlementMode = view.phase === 'setup-settlement' || mode === 'settlement';
  const roadMode = view.phase === 'setup-road' || view.phase === 'free-roads' || mode === 'road';
  const direct = mode === null && view.phase === 'build';
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
  const edgeTargets = new Set(disabled || (!roadMode && !direct) ? [] : view.legal.roads);
  const hexTargets = new Set(disabled || !robberMode ? [] : view.legal.robberHexes);
  const edgeEnds = (edgeId: string) => {
    const edge = view.board.edges.find(e => e.id === edgeId)!;
    return [vertices.get(edge.a)!, vertices.get(edge.b)!] as const;
  };
  const selectedPoint =
    selected?.kind === 'road'
      ? (() => {
          const [a, b] = edgeEnds(selected.id);
          return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        })()
      : selected
        ? vertices.get(selected.id)
        : null;
  const hasTargets = vertexTargets.size + edgeTargets.size + hexTargets.size > 0;
  return (
    <div className={`board-frame${hasTargets ? ' board-has-targets' : ''}`}>
      <svg
        className="board-svg"
        style={{ '--target-color': color(view.selfId) } as CSSProperties}
        viewBox={cameraViewBox(camera)}
        role="group"
        aria-label="Island game board. Highlighted locations are legal moves."
      >
        <title>Islanders board with nine trading harbors</title>
        <defs>
          <ArtDefs uid={uid} />
          <clipPath id={`${uid}-sea-clip`}>
            <rect x="-335" y="-300" width="670" height="600" rx="18" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${uid}-sea-clip)`}>
          <SeaBackdrop uid={uid} hexes={view.board.hexes} />
          {view.board.hexes.map(hex => (
            <g key={hex.id} transform={`translate(${hex.x} ${hex.y})`}>
              <title>
                {TERRAIN[hex.terrain].name}
                {hex.number ? ` · ${hex.number}` : ''}
                {view.robber === hex.id ? ' · robber blocks production' : ''}
              </title>
              <HexTile uid={uid} terrain={hex.terrain} />
              {hex.number !== null && <NumberToken uid={uid} number={hex.number} />}
              {view.robber === hex.id && <Robber />}
            </g>
          ))}
          {view.board.harbors.map(port => (
            <g
              key={port.id}
              className="board-harbor"
              aria-label={`${port.resource === 'any' ? 'Any resource 3:1' : `${port.resource} 2:1`} harbor`}
            >
              <title>
                {port.resource === 'any'
                  ? 'Trade any three matching resources for one'
                  : `Trade two ${port.resource} for one resource`}
                . Build on either connected coastal corner.
              </title>
              <Harbor resource={port.resource} at={port} corners={port.vertices.map(id => vertices.get(id)!)} />
            </g>
          ))}
          {view.board.edges
            .filter(edge => view.roads[edge.id])
            .map(edge => {
              const [a, b] = edgeEnds(edge.id);
              const owner = view.roads[edge.id]!;
              return (
                <g key={edge.id} className="board-road" aria-label={`${playerName(owner)}'s road`}>
                  <title>{playerName(owner)}&apos;s road</title>
                  <Road from={a} to={b} color={color(owner)} />
                </g>
              );
            })}
          {view.board.hexes
            .filter(hex => hexTargets.has(hex.id))
            .map(hex => (
              <g
                key={hex.id}
                className="board-target board-hex-target"
                role="button"
                tabIndex={0}
                aria-label={`Move robber to ${TERRAIN[hex.terrain].name}${hex.number ? `, number ${hex.number}` : ''}`}
                onClick={() => onHex(hex.id)}
                onKeyDown={event => keyboardActivate(event, () => onHex(hex.id))}
                transform={`translate(${hex.x} ${hex.y})`}
              >
                <polygon
                  points={hexPoints(52)}
                  fill="transparent"
                  stroke="#fff5d7"
                  strokeWidth="2.5"
                  strokeDasharray="5 4"
                />
              </g>
            ))}
          {view.board.edges
            .filter(edge => edgeTargets.has(edge.id))
            .map(edge => {
              const [a, b] = edgeEnds(edge.id);
              const dx = (b.x - a.x) * 0.2;
              const dy = (b.y - a.y) * 0.2;
              return (
                <g
                  key={edge.id}
                  className={`board-target board-road-target${selected?.id === edge.id ? ' board-target-selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Build road at ${edge.id}`}
                  onClick={() => onEdge(edge.id)}
                  onKeyDown={event => keyboardActivate(event, () => onEdge(edge.id))}
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
                    strokeDasharray="2 5"
                    strokeLinecap="round"
                  >
                    {!stillMotion() && selected?.id !== edge.id && (
                      <animate attributeName="opacity" values="0.45;1;0.45" {...PULSE} />
                    )}
                  </line>
                </g>
              );
            })}
          {view.board.vertices
            .filter(vertex => view.buildings[vertex.id])
            .map(vertex => {
              const building = view.buildings[vertex.id]!;
              return (
                <g key={vertex.id} transform={`translate(${vertex.x} ${vertex.y - 3})`}>
                  <title>
                    {playerName(building.playerId)}&apos;s {building.kind}
                  </title>
                  <BuildingPiece color={color(building.playerId)} city={building.kind === 'city'} />
                </g>
              );
            })}
          {view.board.vertices
            .filter(vertex => vertexTargets.has(vertex.id))
            .map(vertex => (
              <g
                key={vertex.id}
                className={`board-target board-vertex-target${selected?.id === vertex.id ? ' board-target-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`${view.legal.cities.includes(vertex.id) ? 'Upgrade to city' : 'Build settlement'} at ${vertex.id}`}
                onClick={() => onVertex(vertex.id)}
                onKeyDown={event => keyboardActivate(event, () => onVertex(vertex.id))}
                transform={`translate(${vertex.x} ${vertex.y})`}
              >
                <circle r="17" fill="transparent" className="board-hit-area" />
                <CornerMark ring={view.legal.cities.includes(vertex.id)} />
              </g>
            ))}
          {selected && selectedPoint && (
            <g className="map-confirm" transform={`translate(${selectedPoint.x} ${selectedPoint.y - 42})`}>
              <path d="M-32 18H32V-22H-32ZM-6 18 0 26 6 18" fill="#fffdf4" stroke="#123d54" strokeWidth="2" />
              <g
                role="button"
                tabIndex={0}
                aria-label={`Confirm ${selected.kind}`}
                onClick={event => {
                  event.stopPropagation();
                  onConfirm?.();
                }}
                onKeyDown={event => keyboardActivate(event, () => onConfirm?.())}
              >
                <rect x="-31" y="-20" width="62" height="36" fill="transparent" />
                {/* The board's own piece art, outlined in a dark tone of the seat color, so even white shows on the cream card. */}
                {selected.kind === 'road' ? (
                  <Road from={{ x: -26, y: 10 }} to={{ x: 4, y: -14 }} color={color(view.selfId)} />
                ) : (
                  <g transform="translate(-11 -1) scale(.75)">
                    <BuildingPiece color={color(view.selfId)} city={selected.kind === 'city'} />
                  </g>
                )}
                <circle cx="17" cy="-2" r="10" fill="#198144" />
                <path d="m12 -2 3.5 3.5 6.5-7.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
              </g>
            </g>
          )}
          <SeaDecorations />
        </g>
      </svg>
      {hasTargets && !direct && !selected && (
        <div className="board-placement-hint" role="status">
          <span />
          {hexTargets.size
            ? 'Choose a tile for the robber'
            : edgeTargets.size
              ? 'Choose a highlighted road'
              : mode === 'city'
                ? 'Choose a settlement to upgrade'
                : 'Choose a highlighted corner'}
        </div>
      )}
    </div>
  );
}
