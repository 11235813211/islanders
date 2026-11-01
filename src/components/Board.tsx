import { useId, type KeyboardEvent } from 'react';
import type { GameView, Terrain } from '../../shared/types';
import { ResourceIcon } from './ResourceHand';
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
  onCancel?: () => void;
}

const COLORS = ['#f15934', '#1686da', '#f5bb20', '#9554d4'];
const TERRAIN: Record<Terrain, { name: string; color: string }> = {
  wood: { name: 'Forest · lumber', color: '#6d9270' },
  brick: { name: 'Hills · brick', color: '#c47e5d' },
  sheep: { name: 'Pasture · wool', color: '#afc68a' },
  wheat: { name: 'Fields · grain', color: '#e0c16c' },
  ore: { name: 'Mountains · ore', color: '#8a9da0' },
  desert: { name: 'Desert', color: '#dec99b' },
};

function hexPoints(radius: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (index * 60 - 30) * Math.PI / 180;
    return `${Math.cos(angle) * radius},${Math.sin(angle) * radius}`;
  }).join(' ');
}

function keyboardActivate(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

function Tree({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <ellipse cx="1" cy="9" rx="10" ry="3" fill="#253f38" opacity=".17" />
    <path d="M0 1V11" stroke="#5e6750" strokeWidth="3" />
    <path d="M0-24 12 0H7L14 8H-14L-7 0H-12Z" fill="#315e4b" />
    <path d="M0-24V8H-14L-7 0H-12Z" fill="#44775a" />
    <path d="M-2-17-8-4H-4" fill="none" stroke="#83a374" strokeWidth="1.2" opacity=".55" />
  </g>;
}

function Sheep({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <ellipse cy="6" rx="9" ry="2.5" fill="#68805a" opacity=".22" />
    <path d="M-5 1V6M3 1V6" stroke="#596254" strokeWidth="2" strokeLinecap="round" />
    <path d="M-7 0C-13-5-6-11-2-8 1-13 8-8 7-4 12 0 6 5 2 3-1 7-7 4-7 0" fill="#fff9e6" />
    <ellipse cx="8" cy="-1" rx="3" ry="4" fill="#586251" transform="rotate(-20 8 -1)" />
    <circle cx="9" cy="-2" r=".7" fill="#fff9e6" />
  </g>;
}

function Wheat({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate})`} stroke="#9b7f38" strokeWidth="1.3" fill="#f3d682" strokeLinecap="round">
    <path d="M0 6V-15M0-8-5-12M0-3-5-7M0-8 5-12M0-3 5-7" />
    <ellipse cx="-3" cy="-11" rx="1.6" ry="3.4" transform="rotate(-40 -3 -11)" stroke="none" />
    <ellipse cx="3" cy="-11" rx="1.6" ry="3.4" transform="rotate(40 3 -11)" stroke="none" />
    <ellipse cx="-3" cy="-6" rx="1.6" ry="3.4" transform="rotate(-40 -3 -6)" stroke="none" />
    <ellipse cx="3" cy="-6" rx="1.6" ry="3.4" transform="rotate(40 3 -6)" stroke="none" />
    <ellipse cy="-16" rx="1.7" ry="3.4" stroke="none" />
  </g>;
}

function TerrainArt({ terrain }: { terrain: Terrain }) {
  if (terrain === 'wood') return <g>
    <path d="M-65 5Q-36-12-4 5T65-2V65H-65Z" fill="#81a17a" />
    <path d="M-65 43Q-30 12 0 26T65 18V65H-65Z" fill="#5f8866" />
    <path d="M-52-27Q-11-11 4-38M18 32Q24 15 48 7" fill="none" stroke="#b0bd8b" opacity=".5" strokeWidth="1.5" />
    <Tree x={-28} y={-12} scale={.9} /><Tree x={-6} y={-27} scale={1.02} />
    <Tree x={22} y={-18} scale={.94} /><Tree x={34} y={9} scale={.72} />
    <Tree x={-32} y={23} scale={.83} /><Tree x={17} y={38} scale={.78} />
    <Tree x={-6} y={47} scale={.63} />
  </g>;
  if (terrain === 'brick') return <g>
    <path d="M-70 8-37-31-5-16 16-39 68 14V70H-70Z" fill="#d6976b" />
    <path d="M-70 8-37-31-28 1-5-16 10 19 16-39 36-8 68 14V70H-70Z" fill="#b96f53" />
    <path d="M-67 36-30 12 1 27 33 9 64 33V65H-67Z" fill="#e0a47d" />
    <path d="m-45-3 13-7 17 8m25-17 15-9 15 17m-78 38 15-8 14 5m32 8 18-5" stroke="#9e614b" strokeWidth="1.6" fill="none" opacity=".7" />
    <path d="m-29 34 10-5 9 5v9l-10 4-9-5Z" fill="#b56c50" />
    <path d="m-29 34 10 4 9-4m-10 4v9" fill="none" stroke="#e6ab83" strokeWidth="1.4" />
    <path d="m22-7 10-4 7 4v8l-9 3-8-4Z" fill="#ac664e" />
    <path d="m22-7 9 4 8-4m-8 4v7" fill="none" stroke="#e7aa80" strokeWidth="1.4" />
    <path d="M-38 12h5m46 33h8m4-65h4" stroke="#efc198" strokeWidth="1.5" strokeLinecap="round" />
  </g>;
  if (terrain === 'sheep') return <g>
    <path d="M-70-5Q-28-41 2-14T70-10V65H-70Z" fill="#bcd398" />
    <path d="M-70 24Q-24-12 14 11T70 7V65H-70Z" fill="#91b478" />
    <path d="M-70 51Q-17 10 21 35T70 32V65H-70Z" fill="#aac58a" />
    <path d="M-50 4Q-34-10-17-7M10 38q22-8 41-3" fill="none" stroke="#d9e0a9" strokeWidth="1.3" />
    <Sheep x={-22} y={-23} scale={.88} /><Sheep x={26} y={-11} scale={.82} />
    <Sheep x={-23} y={27} scale={.9} /><Sheep x={15} y={36} scale={.73} />
    <path d="m-37-6-2-5m2 5 3-4m50-18-1-4m1 4 3-3m20 47-2-5m2 5 2-3" stroke="#73905e" strokeWidth="1.3" strokeLinecap="round" />
    <g fill="#f8ecc1"><circle cx="-35" cy="13" r="1.4" /><circle cx="31" cy="26" r="1.4" /><circle cx="-6" cy="-36" r="1.3" /></g>
  </g>;
  if (terrain === 'wheat') return <g>
    <path d="M-70-1Q-32-32 9-15T70-20V65H-70Z" fill="#edd083" />
    <path d="M-70 24Q-18-8 13 14T70 15V65H-70Z" fill="#d6af57" />
    <path d="M-70 38Q-17 8 12 30T70 29M-70 45Q-17 15 12 37T70 36M-70 52Q-17 22 12 44T70 43" fill="none" stroke="#f1d48b" strokeWidth="2.6" />
    <path d="M-50-18q21-10 41-3m17-10q18 1 33 10" fill="none" stroke="#ba994f" opacity=".65" strokeWidth="1.3" />
    <Wheat x={-29} y={-13} rotate={-12} /><Wheat x={-15} y={-24} rotate={5} />
    <Wheat x={22} y={-15} rotate={10} /><Wheat x={32} y={9} rotate={-8} />
    <Wheat x={-30} y={29} rotate={-14} /><Wheat x={10} y={40} rotate={9} />
  </g>;
  if (terrain === 'ore') return <g>
    <path d="M-70 30-32-27-5 14 18-39 71 33V70H-70Z" fill="#647d83" />
    <path d="m-32-27 4 49L-5 14Zm50-12 4 62 49 10Z" fill="#809397" />
    <path d="m-45-7 13-20 13 20-9-4-5 7-5-7Zm49-9 14-23 18 25-12-6-6 7-6-9Z" fill="#e7e9dc" />
    <path d="M-67 53-22 2 6 34 30 6 67 53V70H-67Z" fill="#9caaa6" />
    <path d="m-22 2 4 51H6Zm52 4 2 47h35Z" fill="#7e9391" />
    <path d="m-34 17 12-15 12 15-8-3-5 4-5-5Zm55 0 9-11 9 14-8-5-5 5Z" fill="#d7dfd3" />
    <path d="m-37 37 8-5 6 4-3 9-10 1Zm55 6 7-5 8 6-4 6-9-1Z" fill="#5b7679" />
    <path d="m-37 37 9 2 5-3m-5 3-2 6m48-2 9 1 6 0m-6 0 2 6" fill="none" stroke="#afbfba" strokeWidth="1.2" />
  </g>;
  return <g>
    <path d="M-70 0Q-25-38 5-9T70-13V65H-70Z" fill="#ead6ac" />
    <path d="M-70 28Q-22-18 14 14T70 11V65H-70Z" fill="#d4b987" />
    <path d="M-70 50Q-25 11 8 38T70 29V65H-70Z" fill="#e7cfa0" />
    <path d="M-44-8q21-13 41-7M12 32q18-6 36-1M-44 26q8-5 15-6" fill="none" stroke="#f8e8c4" strokeWidth="1.5" />
    <path d="M-22-23q3-12-1-18m1 5q-9-8-15-3m15 3q8-11 16-6m-16 6q-6-9-5-12m5 12q9-4 15 0" stroke="#8e9465" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <ellipse cx="-23" cy="-21" rx="8" ry="2" fill="#b89f6f" opacity=".45" />
    <path d="m27 28 5-8 6 9Zm-51 9 4-6 8 6Z" fill="#bfa273" />
    <g fill="#bfa273"><circle cx="30" cy="-18" r="1.5" /><circle cx="23" cy="-16" r="1" /><circle cx="-28" cy="13" r="1" /></g>
  </g>;
}

function BuildingPiece({ color, city }: { color: string; city: boolean }) {
  return <g className="board-piece">
    <ellipse cy="7" rx={city ? 15 : 12} ry="5" fill="#253f38" opacity=".3" />
    {city ? <>
      <path d="M-15 7V-15L-8-23 0-16V-2L8-8 18-2V9L9 13-2 9-7 12Z" fill={color} stroke="#334642" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M-15-15-7-10 0-16M-7-10V12M0-2 9 3 18-2M9 3V13" fill="none" stroke="#334642" strokeWidth="1.3" opacity=".55" />
      <path d="m-13-15 5-6 6 5M2-2l6-4 7 4" fill="none" stroke="#fff8df" strokeWidth="1.6" opacity=".7" />
      <path d="M-11-2V-7M-3-3V2M12 5V8" stroke="#334642" strokeWidth="2.3" />
    </> : <>
      <path d="M-11-2-3-12 9-9 13 1 13 8 1 12-11 6Z" fill={color} stroke="#334642" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m-11-2 12 4 12-1M1 2v10M-3-12 1 2" fill="none" stroke="#334642" strokeWidth="1.3" opacity=".55" />
      <path d="m-9-3 6-7 10 3" stroke="#fff8df" strokeWidth="1.6" fill="none" opacity=".7" />
      <path d="M5 9V4l4-1v5" fill="#334642" opacity=".75" />
    </>}
  </g>;
}

function Robber() {
  return <g className="board-robber" transform="translate(24 -20)">
    <ellipse cy="18" rx="12" ry="4" fill="#263d3e" opacity=".3" />
    <path d="M-6-1Q-9 4-7 10L-11 15Q-11 20 0 20T11 15L7 10Q9 4 6-1Z" fill="#34474a" stroke="#f1e0b6" strokeWidth="1.3" />
    <circle cy="-6" r="7" fill="#34474a" stroke="#f1e0b6" strokeWidth="1.3" />
    <path d="M-4-8q1-3 4-3M-5 3-3 12" stroke="#6d8080" strokeWidth="2" fill="none" strokeLinecap="round" />
  </g>;
}

export default function Board({ view, mode, onVertex, onEdge, onHex, disabled = false, camera = { x: 0, y: 0, zoom: 1 }, selected, onConfirm, onCancel }: BoardProps) {
  const uid = useId().replace(/:/g, '');
  const vertices = new Map(view.board.vertices.map(vertex => [vertex.id, vertex]));
  const color = (playerId: string) => COLORS[view.players.find(player => player.id === playerId)?.color ?? 0] ?? COLORS[0];
  const settlementMode = view.phase === 'setup-settlement' || mode === 'settlement';
  const roadMode = view.phase === 'setup-road' || view.phase === 'free-roads' || mode === 'road';
  const direct = mode === null && view.phase === 'build';
  const robberMode = view.phase === 'robber' || mode === 'robber';
  const vertexTargets = new Set(disabled ? [] : direct ? [...view.legal.cities, ...view.legal.settlements] : mode === 'city' ? view.legal.cities : settlementMode ? view.legal.settlements : []);
  const edgeTargets = new Set(disabled || (!roadMode && !direct) ? [] : view.legal.roads);
  const hexTargets = new Set(disabled || !robberMode ? [] : view.legal.robberHexes);
  const selectedPoint = selected?.kind === 'road' ? (() => { const edge = view.board.edges.find(e => e.id === selected.id)!; const a = vertices.get(edge.a)!, b = vertices.get(edge.b)!; return { x: (a.x + b.x)/2, y: (a.y+b.y)/2 }; })() : selected ? vertices.get(selected.id) : null;
  const hasTargets = vertexTargets.size + edgeTargets.size + hexTargets.size > 0;
  return <div className={`board-frame${hasTargets ? ' board-has-targets' : ''}`}>
    <svg className="board-svg" viewBox={`${camera.x - 335/camera.zoom} ${camera.y - 300/camera.zoom} ${670/camera.zoom} ${600/camera.zoom}`} role="group" aria-label="Island game board. Highlighted locations are legal moves.">
      <title>Islanders board with nine trading harbors</title>
      <defs>
        <radialGradient id={`${uid}-sea`} cx="50%" cy="44%" r="68%"><stop offset="0" stopColor="#24b7cf" /><stop offset=".65" stopColor="#149bc1" /><stop offset="1" stopColor="#087fa9" /></radialGradient>
        <linearGradient id={`${uid}-token`} x1="0" y1="0" x2=".4" y2="1"><stop stopColor="#fff9e7" /><stop offset="1" stopColor="#eddfbd" /></linearGradient>
        <filter id={`${uid}-shadow`} x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="#193e47" floodOpacity=".3" /></filter>
        <clipPath id={`${uid}-tile`}><polygon points={hexPoints(57.2)} /></clipPath>
        <clipPath id={`${uid}-sea-clip`}><rect x="-335" y="-300" width="670" height="600" rx="18" /></clipPath>
      </defs>
      <g clipPath={`url(#${uid}-sea-clip)`}>
        <rect x="-335" y="-300" width="670" height="600" fill={`url(#${uid}-sea)`} />
        <g fill="none" stroke="#8ab5b0" strokeWidth="1.2" opacity=".25" aria-hidden="true">
          {Array.from({ length: 55 }, (_, i) => {
            const x = -325 + (i * 137 % 650);
            const y = -285 + (i * 79 % 575);
            return <path key={i} d={`M${x} ${y}q5 3 10 0t10 0m-15 6q5 2 10 0`} />;
          })}
          <ellipse rx="291" ry="263" strokeDasharray="2 9" opacity=".4" />
        </g>
        <g filter={`url(#${uid}-shadow)`}>
          {view.board.hexes.map(hex => <polygon key={hex.id} points={hexPoints(60)} transform={`translate(${hex.x} ${hex.y})`} fill="#e8d9b3" stroke="#bdd1bc" strokeWidth="13" strokeLinejoin="round" />)}
        </g>
        {view.board.hexes.map(hex => {
          const red = hex.number === 6 || hex.number === 8;
          const pips = hex.number ? 6 - Math.abs(7 - hex.number) : 0;
          return <g key={hex.id} transform={`translate(${hex.x} ${hex.y})`}>
            <title>{TERRAIN[hex.terrain].name}{hex.number ? ` · ${hex.number}` : ''}{view.robber === hex.id ? ' · robber blocks production' : ''}</title>
            <polygon points={hexPoints(59)} fill="#e8d9b3" stroke="#cfbe96" strokeWidth="1.5" />
            <g clipPath={`url(#${uid}-tile)`} className="terrain-art">
              <polygon points={hexPoints(58)} fill={TERRAIN[hex.terrain].color} />
              <TerrainArt terrain={hex.terrain} />
              <polygon points={hexPoints(56.5)} fill="none" stroke="#fff5d8" strokeOpacity=".18" strokeWidth="1.2" />
            </g>
            {hex.number !== null && <g className={`board-token${red ? ' board-token-hot' : ''}`} transform="translate(0 8)" aria-hidden="true">
              <circle cy="2" r="18.6" fill="#394a3d" opacity=".22" />
              <circle r="18" fill={`url(#${uid}-token)`} stroke="#bda77b" strokeWidth="1.2" />
              <circle r="15.5" fill="none" stroke="#fff8df" strokeWidth=".7" />
              <text textAnchor="middle" y="3.5" fill={red ? '#b8513f' : '#3c4942'}>{hex.number}</text>
              {Array.from({ length: pips }, (_, index) => <circle key={index} cx={(index - (pips - 1) / 2) * 3.5} cy="10" r="1.15" fill={red ? '#b8513f' : '#726d56'} />)}
            </g>}
            {view.robber === hex.id && <Robber />}
          </g>;
        })}
        {view.board.harbors.map(port => <g key={port.id} className="board-harbor" aria-label={`${port.resource === 'any' ? 'Any resource 3:1' : port.resource + ' 2:1'} harbor`}>
          <title>{port.resource === 'any' ? 'Trade any three matching resources for one' : `Trade two ${port.resource} for one resource`}. Build on either connected coastal corner.</title>
          {port.vertices.map(id => { const v = vertices.get(id)!; return <g key={id}><line x1={v.x} y1={v.y} x2={port.x} y2={port.y} stroke="#825329" strokeWidth="5" /><line x1={v.x} y1={v.y} x2={port.x} y2={port.y} stroke="#ffd278" strokeWidth="3" strokeDasharray="4 2" /></g>; })}
          <g transform={`translate(${port.x} ${port.y})`}><path d="M-19 9H19L12 18H-10Z" fill="#c57b30" stroke="#714519" strokeWidth="1.5" /><path d="M-15-24H14L18 9H-18Z" fill="#fff9dc" stroke="#bd9d60" strokeWidth="1.5" />
            {port.resource === 'any' ? <text textAnchor="middle" y="-8" fill="#304c56" fontSize="16" fontWeight="800">?</text> : <foreignObject x="-10" y="-23" width="20" height="20"><ResourceIcon resource={port.resource} size={20} /></foreignObject>}
            <text textAnchor="middle" y="6" fill="#253f49" fontSize="13" fontWeight="800">{port.resource === 'any' ? '3:1' : '2:1'}</text>
          </g>
        </g>)}
        {view.board.edges.filter(edge => view.roads[edge.id]).map(edge => {
          const a = vertices.get(edge.a)!;
          const b = vertices.get(edge.b)!;
          const dx = (b.x - a.x) * .19;
          const dy = (b.y - a.y) * .19;
          return <g key={edge.id} className="board-road" aria-label={`${view.players.find(player => player.id === view.roads[edge.id])?.name}'s road`}>
            <title>{view.players.find(player => player.id === view.roads[edge.id])?.name}&apos;s road</title>
            <line x1={a.x + dx} y1={a.y + dy + 2} x2={b.x - dx} y2={b.y - dy + 2} stroke="#294843" strokeWidth="11" strokeLinecap="round" />
            <line x1={a.x + dx} y1={a.y + dy} x2={b.x - dx} y2={b.y - dy} stroke={color(view.roads[edge.id])} strokeWidth="8.5" strokeLinecap="round" />
            <line x1={a.x + dx} y1={a.y + dy - 1.5} x2={b.x - dx} y2={b.y - dy - 1.5} stroke="#fff8df" strokeOpacity=".4" strokeWidth="1.4" strokeLinecap="round" />
          </g>;
        })}
        {view.board.hexes.filter(hex => hexTargets.has(hex.id)).map(hex => <g key={hex.id} className="board-target board-hex-target" role="button" tabIndex={0} aria-label={`Move robber to ${TERRAIN[hex.terrain].name}${hex.number ? `, number ${hex.number}` : ''}`} onClick={() => onHex(hex.id)} onKeyDown={event => keyboardActivate(event, () => onHex(hex.id))} transform={`translate(${hex.x} ${hex.y})`}>
          <polygon points={hexPoints(52)} fill="transparent" stroke="#fff5d7" strokeWidth="2.5" strokeDasharray="5 4" />
        </g>)}
        {view.board.edges.filter(edge => edgeTargets.has(edge.id)).map(edge => {
          const a = vertices.get(edge.a)!;
          const b = vertices.get(edge.b)!;
          const dx = (b.x - a.x) * .2;
          const dy = (b.y - a.y) * .2;
          return <g key={edge.id} className="board-target board-road-target" role="button" tabIndex={0} aria-label={`Build road at ${edge.id}`} onClick={() => onEdge(edge.id)} onKeyDown={event => keyboardActivate(event, () => onEdge(edge.id))}>
            <circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r="12" fill="transparent" className="board-hit-area" />
            <line className="board-hit-area" x1={a.x + dx} y1={a.y + dy} x2={b.x - dx} y2={b.y - dy} stroke="transparent" strokeWidth="22" strokeLinecap="round" />
            <line className="board-target-mark" x1={a.x + dx} y1={a.y + dy} x2={b.x - dx} y2={b.y - dy} stroke="#fff9df" strokeWidth="7" strokeDasharray="2 5" strokeLinecap="round" />
          </g>;
        })}
        {view.board.vertices.filter(vertex => view.buildings[vertex.id]).map(vertex => {
          const building = view.buildings[vertex.id];
          const owner = view.players.find(player => player.id === building.playerId);
          return <g key={vertex.id} transform={`translate(${vertex.x} ${vertex.y - 3})`}>
            <title>{owner?.name}&apos;s {building.kind}</title>
            <BuildingPiece color={color(building.playerId)} city={building.kind === 'city'} />
          </g>;
        })}
        {view.board.vertices.filter(vertex => vertexTargets.has(vertex.id)).map(vertex => <g key={vertex.id} className="board-target board-vertex-target" role="button" tabIndex={0} aria-label={`${view.legal.cities.includes(vertex.id) ? 'Upgrade to city' : 'Build settlement'} at ${vertex.id}`} onClick={() => onVertex(vertex.id)} onKeyDown={event => keyboardActivate(event, () => onVertex(vertex.id))} transform={`translate(${vertex.x} ${vertex.y})`}>
          <circle r="17" fill="transparent" className="board-hit-area" />
          <circle className="board-target-mark" r={mode === 'city' ? 15 : 8} fill={mode === 'city' ? 'transparent' : '#fff8df'} stroke="#fff8df" strokeWidth={mode === 'city' ? 2.4 : 1.6} strokeDasharray={mode === 'city' ? '3 3' : undefined} />
          {mode !== 'city' && <path d="M-3 0H3M0-3V3" fill="none" stroke="#607b69" strokeWidth="1.6" strokeLinecap="round" />}
        </g>)}
        {selected && selectedPoint && <g className="map-confirm" transform={`translate(${selectedPoint.x} ${selectedPoint.y - 42})`}>
          <path d="M-33 18H33V-22H-33ZM-6 18 0 26 6 18" fill="#fffdf4" stroke="#123d54" strokeWidth="2" />
          <g role="button" tabIndex={0} aria-label={`Confirm ${selected.kind}`} onClick={event => { event.stopPropagation(); onConfirm?.(); }} onKeyDown={event => keyboardActivate(event, () => onConfirm?.())}>
            <rect x="-30" y="-20" width="40" height="36" fill="transparent" />
            {selected.kind === 'road' ? <path d="m-22 6 22-18" stroke="#ed5b30" strokeWidth="7" strokeLinecap="round" /> : <g transform="translate(-10 0) scale(.8)"><BuildingPiece color="#ed5b30" city={selected.kind === 'city'} /></g>}
            <path d="m-3 8 4 4 8-10" fill="none" stroke="#198144" strokeWidth="3" />
          </g>
          <g role="button" tabIndex={0} aria-label="Cancel placement" onClick={event => { event.stopPropagation(); onCancel?.(); }} onKeyDown={event => keyboardActivate(event, () => onCancel?.())}><rect x="13" y="-20" width="18" height="36" fill="transparent" /><path d="m18-7 8 8m0-8-8 8" stroke="#526b75" strokeWidth="2" /></g>
        </g>}
        <g className="board-decoration" transform="translate(-282 224)" aria-hidden="true">
          <circle r="20" fill="none" stroke="#c4d8c7" strokeWidth=".8" opacity=".35" />
          <path d="M0-27 5-6 0 0-5-6ZM0 27 5 6 0 0-5 6ZM-27 0-6-5 0 0-6 5ZM27 0 6-5 0 0 6 5Z" fill="#b7cfc1" opacity=".6" />
          <path d="M0-27V0L-5-6ZM0 27V0L5 6ZM-27 0H0L-6 5ZM27 0H0L6-5Z" fill="#dce3ca" opacity=".7" />
          <text x="0" y="-33" textAnchor="middle" fill="#d3dfcc" fontSize="10" fontFamily="Georgia, serif">N</text>
        </g>
        <g className="board-decoration" transform="translate(280 -205) rotate(12)" aria-hidden="true">
          <path d="M-19 18q17 4 33 0M-14 23q12 3 22 0" stroke="#bdd6c6" strokeWidth="1" fill="none" opacity=".4" />
          <path d="M-13 8H13L7 15H-7Z" fill="#d8c79a" />
          <path d="M0-25V9" stroke="#d8c79a" strokeWidth="1.8" />
          <path d="M-2-22-2 5H-18Z" fill="#f0e6c8" /><path d="M2-16V5H15Z" fill="#cbd7c3" />
        </g>
        <g stroke="#d7e0cb" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".65" aria-hidden="true">
          <path d="M-242-220q5-6 10 0 5-6 10 0M-270-202q4-5 8 0 4-5 8 0M250 228q5-6 10 0 5-6 10 0" />
        </g>
      </g>
    </svg>
    {hasTargets && !direct && !selected && <div className="board-placement-hint" role="status"><span />{hexTargets.size ? 'Choose a tile for the robber' : edgeTargets.size ? 'Choose a highlighted road' : mode === 'city' ? 'Choose a settlement to upgrade' : 'Choose a highlighted corner'}</div>}
  </div>;
}
