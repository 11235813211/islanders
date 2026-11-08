// Volcano, seen from above: a ribbed basalt cone, lit from the upper left, rising to a glowing
// crater, with smoke drifting off and six lava flows running down to the six corners. Each flow
// is numbered 1–6 (clockwise from the top), matching the die that picks which corner erupts
// (ERUPTION_CORNER in shared/seafaring.ts).
import { ERUPTION_CORNER } from '../../../../shared/seafaring';

/** Tweak here: ground, cone (foot to summit), ridges, lava (edge to core), crater, smoke, badges. */
export const VOLCANO = {
  ground: '#2c2523',
  ash: '#3d3431',
  coneFoot: '#3a302c',
  coneMid: '#53433c',
  coneTop: '#6a564c',
  ridgeLit: '#806a5d',
  ridgeShade: '#251e1c',
  lavaGlow: '#ff5a14',
  lavaEdge: '#b6330d',
  lava: '#f37a22',
  lavaCore: '#ffd25c',
  craterRim: '#231b19',
  craterHot: '#fff0a6',
  craterWarm: '#ffad3a',
  craterCool: '#e2511b',
  smoke: '#8d847f',
  smokeLight: '#b3aba5',
  badge: '#1c1513',
  badgeRing: '#ffb23e',
  badgeText: '#fff6e0',
};

/** Where each flow ends and its number sits (corners are 60 from the center). */
const FLOW_END = 53;
const BADGE_AT = 41;
/** One wavy flow along +x from the crater down the slope, widening as it goes. */
const FLOW = `M24 0C29-3 32 2 36 1S44-3 47 0 ${FLOW_END - 2} 2 ${FLOW_END} 0`;

export function VolcanoDefs({ uid }: { uid: string }) {
  return (
    <>
      <radialGradient id={`${uid}-cone`} cx="46%" cy="44%" r="58%">
        <stop offset="0" stopColor={VOLCANO.coneTop} />
        <stop offset=".55" stopColor={VOLCANO.coneMid} />
        <stop offset="1" stopColor={VOLCANO.coneFoot} />
      </radialGradient>
      <linearGradient id={`${uid}-cone-light`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".16" />
        <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity=".28" />
      </linearGradient>
      <radialGradient id={`${uid}-lava-glow`}>
        <stop offset="0" stopColor={VOLCANO.craterHot} />
        <stop offset=".45" stopColor={VOLCANO.craterWarm} />
        <stop offset=".8" stopColor={VOLCANO.craterCool} />
        <stop offset="1" stopColor={VOLCANO.craterCool} stopOpacity="0" />
      </radialGradient>
    </>
  );
}

/** Corner angle in degrees for die face `face` (1–6). */
const faceAngle = (face: number) => 30 + 60 * ERUPTION_CORNER[face - 1]!;
const FACES = [1, 2, 3, 4, 5, 6];

export function VolcanoTile({ uid }: { uid: string }) {
  return (
    <g>
      <polygon points="0,-60 52,-30 52,30 0,60 -52,30 -52,-30" fill={VOLCANO.ground} />
      {/* Ash and cooled flows on the plain around the foot of the cone */}
      <g fill={VOLCANO.ash}>
        <path d="M-52-30-30-40-36-24Z" />
        <path d="M52 30 34 40 40 22Z" />
        <path d="M-12 58-2 46 10 58Z" />
      </g>
      {/* The cone, and the light across it */}
      <circle r="50" fill={`url(#${uid}-cone)`} />
      <circle r="50" fill={`url(#${uid}-cone-light)`} />
      {/* Ridges between the flows: lit on the upper left, shaded on the lower right */}
      {FACES.map(face => {
        const angle = faceAngle(face) + 30;
        const lit = Math.cos(((angle + 135) * Math.PI) / 180) > 0;
        return (
          <path
            key={face}
            transform={`rotate(${angle})`}
            d="M27-2C34-4 41 1 49-1L49 2C41 4 34 0 27 3Z"
            fill={lit ? VOLCANO.ridgeLit : VOLCANO.ridgeShade}
            opacity=".85"
          />
        );
      })}
      <circle r="49" fill="none" stroke={VOLCANO.ridgeShade} strokeWidth="2" opacity=".5" />
      {/* Lava running down to each corner, glowing in its channel */}
      {FACES.map((face, i) => (
        <g key={face} transform={`rotate(${faceAngle(face)}) scale(1 ${i % 2 ? -1 : 1})`}>
          <path
            d={FLOW}
            stroke={VOLCANO.lavaGlow}
            strokeOpacity=".35"
            strokeWidth="11"
            fill="none"
            strokeLinecap="round"
          />
          <path d={FLOW} stroke={VOLCANO.lavaEdge} strokeWidth="6.5" fill="none" strokeLinecap="round" />
          <path d={FLOW} stroke={VOLCANO.lava} strokeWidth="3.6" fill="none" strokeLinecap="round" />
          <path d={FLOW} stroke={VOLCANO.lavaCore} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </g>
      ))}
      {/* Crater: a dark rim around molten rock (the number token sits in it) */}
      <circle r="27" fill={VOLCANO.craterRim} />
      <circle r="23" fill={`url(#${uid}-lava-glow)`} />
      <path d="M-20-8q6-5 12-2M8-18q7 0 11 6" stroke={VOLCANO.craterRim} strokeWidth="2" fill="none" opacity=".6" />
      {/* Smoke drifting off to the upper right */}
      <g fill={VOLCANO.smoke} opacity=".7">
        <circle cx="12" cy="-24" r="6" />
        <circle cx="20" cy="-30" r="7.5" />
        <circle cx="30" cy="-34" r="6" />
      </g>
      <g fill={VOLCANO.smokeLight} opacity=".55">
        <circle cx="10" cy="-26" r="3" />
        <circle cx="18" cy="-33" r="3.6" />
      </g>
      {FACES.map(face => {
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
