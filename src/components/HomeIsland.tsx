import { useId } from 'react';
import { HEX_RADIUS, hexCenter, hexCorner } from '../../shared/board';
import { playerColor } from '../../shared/colors';
import type { Terrain } from '../../shared/types';
import { ArtDefs, BuildingPiece, NumberToken, Road, SEA, Tile } from '../art';

/** The home screen's island: a few of each terrain, the way a game's board looks. */
const TILES: { q: number; r: number; terrain: Terrain; number: number | null }[] = [
  { q: 0, r: -1, terrain: 'sheep', number: 5 },
  { q: 1, r: -1, terrain: 'ore', number: 10 },
  { q: -1, r: 0, terrain: 'wood', number: 8 },
  { q: 0, r: 0, terrain: 'gold', number: 6 },
  { q: 1, r: 0, terrain: 'wheat', number: 9 },
  { q: -1, r: 1, terrain: 'brick', number: 4 },
  { q: 0, r: 1, terrain: 'volcano', number: 11 },
  { q: 1, r: 1, terrain: 'jungle', number: 3 },
  { q: 2, r: -1, terrain: 'wheat', number: 2 },
];
const at = (q: number, r: number) => hexCenter(q, r);
const corner = (q: number, r: number, index: number) => {
  const c = at(q, r);
  return hexCorner(c.x, c.y, index);
};

/** Settlements, cities, and roads in a few seat colors. */
const PIECES = [
  { color: 'red', city: true, at: corner(0, 0, 4), road: [corner(0, 0, 4), corner(0, 0, 3)] },
  { color: 'blue', city: false, at: corner(1, 0, 0), road: [corner(1, 0, 0), corner(1, 0, 5)] },
  { color: 'orange', city: false, at: corner(-1, 1, 2), road: [corner(-1, 1, 2), corner(-1, 1, 1)] },
  { color: 'white', city: true, at: corner(1, -1, 5), road: [corner(1, -1, 5), corner(1, -1, 4)] },
] as const;

/** A ship out at sea off the island's east shore (an edge between two sea tiles). */
const SHIP = { from: corner(2, 0, 0), to: corner(2, 0, 1) };

/** A decorative island drawn with the game's own tile art, gently bobbing on the home screen. */
export default function HomeIsland() {
  const uid = useId().replace(/:/g, '');
  const hexes = TILES.map(t => ({ ...t, ...at(t.q, t.r) }));
  const pad = HEX_RADIUS * 1.6;
  const xs = hexes.map(h => h.x);
  const ys = hexes.map(h => h.y);
  const box = {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    width: Math.max(...xs) - Math.min(...xs) + pad * 2,
    height: Math.max(...ys) - Math.min(...ys) + pad * 2,
  };
  return (
    <svg className="home-island" viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`} aria-hidden="true">
      <defs>
        <ArtDefs uid={uid} />
        <SEA.Defs uid={uid} />
      </defs>
      <g className="home-island-land">
        <SEA.IslandBase uid={uid} hexes={hexes} />
        {hexes.map(hex => (
          <g key={`${hex.q},${hex.r}`} transform={`translate(${hex.x} ${hex.y})`}>
            <Tile uid={uid} terrain={hex.terrain} />
            {hex.number !== null && <NumberToken uid={uid} number={hex.number} />}
          </g>
        ))}
        {PIECES.map(piece => (
          <Road
            key={`road-${piece.color}`}
            from={piece.road[0]}
            to={piece.road[1]}
            color={playerColor(piece.color).fill}
          />
        ))}
        {PIECES.map(piece => (
          <g key={piece.color} transform={`translate(${piece.at.x} ${piece.at.y - 3})`}>
            <BuildingPiece color={playerColor(piece.color).fill} city={piece.city} style="classic" />
          </g>
        ))}
      </g>
      <g className="home-island-ship">
        <SEA.Ship from={SHIP.from} to={SHIP.to} color={playerColor('purple').fill} />
      </g>
    </svg>
  );
}
