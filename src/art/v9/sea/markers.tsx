// Small sea-map markers: the island bonus chip, the jungle discovery icon, and the sandy
// shore drawn under each island.
import { hexPoints } from '../../../lib/geometry';

/** Tweak here: chip gold, rim, and text; the discovery scroll's paper and ink. */
export const MARKERS = {
  chip: '#f3c94b',
  chipRim: '#9c6f12',
  chipShine: '#fff3c0',
  chipText: '#5a3d06',
  paper: '#f6e7bf',
  paperShade: '#dcc68f',
  ink: '#7a5426',
  sand: '#e8d9b3',
  surf: '#bdd1bc',
};

/** Bonus points for first settling this island, on the tile's upper left. */
export function BonusChip({ points }: { points: number }) {
  return (
    <g className="board-bonus" transform="translate(-25 -25)">
      <circle cy="1.2" r="10" fill="#3a2a0a" opacity=".25" />
      <circle r="10" fill={MARKERS.chip} stroke={MARKERS.chipRim} strokeWidth="1.3" />
      <circle r="7.6" fill="none" stroke={MARKERS.chipShine} strokeWidth=".9" />
      <text textAnchor="middle" y="3.6" fontSize="10" fontWeight="800" fill={MARKERS.chipText}>
        +{points}
      </text>
    </g>
  );
}

/** A rolled map: one discovery from the jungle. */
export function DiscoveryIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="resource-icon">
      <path d="M4 5h14v14H4Z" fill={MARKERS.paper} stroke={MARKERS.ink} strokeWidth="1.3" />
      <path
        d="M18 5a2 2 0 0 1 0 4M4 19a2 2 0 0 1 0-4"
        fill={MARKERS.paperShade}
        stroke={MARKERS.ink}
        strokeWidth="1.3"
      />
      <path
        d="M7 9q3 3 5 0t4 2M8 14h2m2 0h3"
        stroke={MARKERS.ink}
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
      <path d="m13 11 1.5 1.5m0-1.5L13 12.5" stroke="#b8402a" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Sand and surf under each land tile, so islands get a shore against the sea tiles. */
export function IslandBase({ uid, hexes }: { uid: string; hexes: { x: number; y: number }[] }) {
  return (
    <g filter={`url(#${uid}-shadow)`}>
      {hexes.map((hex, i) => (
        <polygon
          key={i}
          points={hexPoints(60)}
          transform={`translate(${hex.x} ${hex.y})`}
          fill={MARKERS.sand}
          stroke={MARKERS.surf}
          strokeWidth="11"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}
