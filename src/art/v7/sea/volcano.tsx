// Volcano: dark basalt around a glowing crater, with six lava flows running to the six corners.
// Each flow is numbered 1–6 (clockwise from the top), matching the die that picks which corner
// erupts (ERUPTION_CORNER in shared/seafaring.ts).
import { ERUPTION_CORNER } from '../../../../shared/seafaring';

/** Tweak here: rock, ash rings, lava (edge to core), the glow, smoke, and the corner badges. */
export const VOLCANO = {
  rock: '#3a2f2b',
  rockLine: '#4d3f39',
  ash: '#4a3b35',
  ashInner: '#5c433a',
  lavaEdge: '#b9370f',
  lava: '#f07a25',
  lavaCore: '#ffd05a',
  glowHot: '#fff2a8',
  glowWarm: '#ffb23e',
  glowCool: '#e8541c',
  smoke: '#7a6e69',
  badge: '#1c1513',
  badgeRing: '#ffb23e',
  badgeText: '#fff6e0',
};

/** How far from the center each flow ends and its number sits (corners are at 60). */
const FLOW_END = 50;
const BADGE_AT = 38;

/** One wavy flow along +x, from the crater rim outwards. Mirrored on alternate corners. */
const FLOW = `M13 0C19-4 24 3 29 1S38-3 42 0 ${FLOW_END - 3} 2 ${FLOW_END} 0`;

export function VolcanoDefs({ uid }: { uid: string }) {
  return (
    <radialGradient id={`${uid}-lava-glow`}>
      <stop offset="0" stopColor={VOLCANO.glowHot} />
      <stop offset=".38" stopColor={VOLCANO.glowWarm} />
      <stop offset=".72" stopColor={VOLCANO.glowCool} stopOpacity=".85" />
      <stop offset="1" stopColor={VOLCANO.glowCool} stopOpacity="0" />
    </radialGradient>
  );
}

/** Corner angle in degrees for die face `face` (1–6). */
const faceAngle = (face: number) => 30 + 60 * ERUPTION_CORNER[face - 1]!;

export function VolcanoTile({ uid }: { uid: string }) {
  const faces = [1, 2, 3, 4, 5, 6];
  return (
    <g>
      <polygon points="0,-60 52,-30 52,30 0,60 -52,30 -52,-30" fill={VOLCANO.rock} />
      <g stroke={VOLCANO.rockLine} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".9">
        <path d="M-44-20q8-4 14 1M30-34q7 2 11 8M-38 30q6 4 13 2M28 36q8-1 13-6M-8-46q6 2 10-1" />
      </g>
      <circle r="35" fill={VOLCANO.ash} />
      <circle r="25" fill={VOLCANO.ashInner} />
      {faces.map((face, i) => (
        <g key={face} transform={`rotate(${faceAngle(face)}) scale(1 ${i % 2 ? -1 : 1})`}>
          <path d={FLOW} stroke={VOLCANO.lavaEdge} strokeWidth="7.5" fill="none" strokeLinecap="round" />
          <path d={FLOW} stroke={VOLCANO.lava} strokeWidth="4.2" fill="none" strokeLinecap="round" />
          <path d={FLOW} stroke={VOLCANO.lavaCore} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </g>
      ))}
      <circle r="24" fill={`url(#${uid}-lava-glow)`} />
      <g fill={VOLCANO.smoke} opacity=".5">
        <circle cx="-5" cy="-24" r="4" />
        <circle cx="1" cy="-30" r="5" />
        <circle cx="8" cy="-37" r="4" />
      </g>
      {faces.map(face => {
        const angle = (faceAngle(face) * Math.PI) / 180;
        return (
          <g
            key={face}
            className="volcano-corner"
            transform={`translate(${(Math.cos(angle) * BADGE_AT).toFixed(2)} ${(Math.sin(angle) * BADGE_AT).toFixed(2)})`}
          >
            <circle r="7.4" fill={VOLCANO.badge} stroke={VOLCANO.badgeRing} strokeWidth="1.3" />
            <text textAnchor="middle" y="3.6" fontSize="10.5" fontWeight="800" fill={VOLCANO.badgeText}>
              {face}
            </text>
          </g>
        );
      })}
    </g>
  );
}
