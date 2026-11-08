// A high, oblique view keeps the lava lake above the number token and exposes the near cone wall.
import { ERUPTION_CORNER } from '../../../../shared/seafaring';

/** Charcoal rock keeps the hot fissures distinct from both ore and the sandy gold gorge. */
export const VOLCANO = {
  ground: '#282a29',
  ash: '#454641',
  rockLight: '#69685c',
  rock: '#46463f',
  rockDark: '#1c2222',
  ridge: '#848071',
  lavaEdge: '#84351f',
  lava: '#d75b28',
  lavaHot: '#ffa53a',
  lavaCore: '#ffe88a',
  craterWall: '#642d21',
  badge: '#252725',
  badgeRing: '#bcaa7e',
  badgeText: '#fff4d9',
};

/** Shared gradients give the summit height without adding a raster image or expensive SVG filters. */
export function VolcanoDefs({ uid }: { uid: string }) {
  return (
    <>
      <linearGradient id={`${uid}-volcano-slope`} x1="0" y1="0" x2=".85" y2="1">
        <stop stopColor={VOLCANO.rockLight} />
        <stop offset=".45" stopColor={VOLCANO.rock} />
        <stop offset="1" stopColor={VOLCANO.rockDark} />
      </linearGradient>
      <linearGradient id={`${uid}-volcano-wall`} x1="0" y1="0" x2=".2" y2="1">
        <stop stopColor="#181f20" />
        <stop offset=".65" stopColor={VOLCANO.craterWall} />
        <stop offset="1" stopColor={VOLCANO.lava} />
      </linearGradient>
      <radialGradient id={`${uid}-volcano-lake`} cx=".42" cy=".6" r=".65">
        <stop stopColor="#fff6b4" />
        <stop offset=".4" stopColor="#ffd357" />
        <stop offset=".75" stopColor="#f3962b" />
        <stop offset="1" stopColor="#b54925" />
      </radialGradient>
      <pattern id={`${uid}-volcano-grain`} width="13" height="11" patternUnits="userSpaceOnUse">
        <path d="m1 3 2-1m6 5 3-1M4 10l1-2" fill="none" stroke="#b1a18a" strokeWidth=".45" opacity=".25" />
        <path d="m5 2 2 1m-6 6 2-2m7-4 2 1" fill="none" stroke="#111c1b" strokeWidth=".65" opacity=".45" />
      </pattern>
    </>
  );
}

// Paths follow the sloping cone, with the far flows foreshortened and the near flows elongated.
const FLOWS = [
  'M-3-31-5-36-1-40-3-46 0-53',
  'M16-26 23-28 28-25 35-28 46-26.5',
  'M15-18 23-10 24-3 31 6 33 15 40 20 46 26.5',
  'M3-14 7-5 5 5 9 14 4 24 5 31-2 40 0 53',
  'M-18-20-23-12-28-9-30 1-37 8-36 16-46 26.5',
  'M-20-26-28-25-33-28-39-25-46-26.5',
];

function LavaFlows() {
  return (
    <g fill="none" strokeLinejoin="round">
      {FLOWS.map((d, i) => (
        <g key={d}>
          <path d={d} stroke={VOLCANO.lavaEdge} strokeWidth={i === 3 ? 6 : 4.8} />
          <path d={d} stroke={VOLCANO.lava} strokeWidth={i === 3 ? 3.4 : 2.7} />
          <path d={d} stroke={VOLCANO.lavaHot} strokeWidth="1.2" />
          <path d={d} stroke={VOLCANO.lavaCore} strokeWidth=".45" strokeDasharray="2.5 1.4 5 2" />
        </g>
      ))}
      <g stroke={VOLCANO.lavaEdge} strokeWidth="1.7">
        <path d="m-5-36-9-6-1-6M28-25l5-9 6-3M31 6l11-2 6 3M4 24l12 7 2 10M-30 1l-12-4-6-6M-2 40l-9 5" />
      </g>
      <g stroke={VOLCANO.lava} strokeWidth=".6">
        <path d="m-5-36-9-6-1-6M28-25l5-9 6-3M31 6l11-2 6 3M4 24l12 7 2 10M-30 1l-12-4-6-6M-2 40l-9 5" />
      </g>
    </g>
  );
}

function Cone({ uid }: { uid: string }) {
  return (
    <>
      {/* The offset summit, broad foot and long near face make a volume, rather than a mountain horizon. */}
      <path
        d="M-44 19-48 8-40-10-28-29-17-34 0-37 17-32 32-16 42 4 48 23 37 35 16 43-8 45-29 37Z"
        fill={`url(#${uid}-volcano-slope)`}
      />
      <g fill={VOLCANO.rockLight}>
        <path d="M-19-28-28-15-31-2-43 16-32 8-22-10-12-26Z" />
        <path d="M-11-20-20-3-19 7-30 29-16 16-12-1-4-18Z" />
        <path d="M-1-20-5-3-2 15-9 35 1 25 4 4 6-18Z" opacity=".65" />
      </g>
      <g fill={VOLCANO.rockDark}>
        <path d="M16-27 24-13 30-7 41 11 45 24 32 16 24 1 20-4 9-24Z" />
        <path d="M10-18 15 1 12 15 20 36 29 38 21 12 24 5 17-14Z" />
        <path d="M-20-24-28-10-29 4-39 22-30 17-24 2-23-8-12-25Z" opacity=".8" />
      </g>
      <g fill="none" stroke={VOLCANO.ridge} strokeWidth=".8" opacity=".65">
        <path d="M-19-28-29-14-33 1-42 14M-11-22-16-9-17 5-25 24M-2-18-5-2-2 15-7 31" />
        <path d="M17-24 23-13 30-7 37 8M11-16 16 3 14 13 22 34" opacity=".45" />
      </g>
      <g fill="none" stroke="#202725" strokeWidth=".8" opacity=".85">
        <path d="m-35-4 5 4-6 7m13-23 6 1m-9 28 6 3-7 9M-14 27l4 3-4 6M25-12l-2 5 6 4M26 21l6 2-2 7" />
        <path d="m-42 19 7 3m8 8 4-3M7 33l6 5M34 32l5-5M35-9l-4 1" />
      </g>
    </>
  );
}

function Crater({ uid }: { uid: string }) {
  return (
    <g>
      {/* A thick back wall and a low front lip reveal the molten floor from above. */}
      <path
        d="M-23-24-20-30-11-35 0-36 12-33 20-28 22-22 18-16 9-12-3-11-16-15-22-20Z"
        fill="#323530"
        stroke={VOLCANO.ridge}
        strokeWidth="1.1"
      />
      <path d="M-19-25Q-15-32-3-32 10-33 17-26L19-22Q13-14 0-14-13-14-19-22Z" fill={`url(#${uid}-volcano-wall)`} />
      <path d="M-17-23Q-10-28 0-27 12-27 17-22 13-16 0-15-12-15-17-23Z" fill={`url(#${uid}-volcano-lake)`} />
      <path d="m-17-26 3 3 2-5m5-3 1 4m9-4 2 4m7-2-1 4" fill="none" stroke="#a7683c" strokeWidth=".7" />
      <path d="m-12-22 4-2 5 1 3-1 6 2 5-1M-8-18l5-1 4 1 4-2" fill="none" stroke="#fff0a1" strokeWidth=".85" />
      <path d="M-20-21Q-12-10 1-12 14-12 20-21L18-16 9-12-3-11-16-15Z" fill="#8f6344" />
      <path d="M-18-20Q-11-13 1-14 12-14 18-20" fill="none" stroke={VOLCANO.lavaHot} strokeWidth="1.2" />
      <path d="m-15-17-2 4m7-1-1 3m21-5 2 2" stroke="#292a26" strokeWidth="1.1" />
    </g>
  );
}

/** Match the engine's die-to-corner mapping, even though the summit is offset in perspective. */
function CornerNumbers() {
  return (
    <>
      {ERUPTION_CORNER.map((corner, i) => {
        const angle = ((30 + 60 * corner) * Math.PI) / 180;
        return (
          <g
            key={corner}
            className="volcano-corner"
            transform={`translate(${(Math.cos(angle) * 45).toFixed(2)} ${(Math.sin(angle) * 45).toFixed(2)})`}
          >
            <circle r="6.5" fill={VOLCANO.badge} stroke={VOLCANO.badgeRing} strokeWidth=".8" />
            <text textAnchor="middle" y="3.4" fontSize="10" fontWeight="800" fill={VOLCANO.badgeText}>
              {i + 1}
            </text>
          </g>
        );
      })}
    </>
  );
}

/** A raised basalt cone whose crater, lava routes and eruption labels remain visible around a token. */
export function VolcanoTile({ uid }: { uid: string }) {
  return (
    <g>
      <path d="M0-60 52-30V30L0 60-52 30V-30Z" fill={VOLCANO.ground} />
      <g fill={VOLCANO.ash} opacity=".65">
        <path d="m-45-32 18-9 12 1-17 6-9 9ZM13-48l15 10 9 3-13-2ZM-46 12l4 17 14 9-14-2Z" />
        <path d="m32 34-14 9-6 10 15-8ZM-20 44l12 9 3-4-8-4Z" />
      </g>
      <path d="M-40 22Q-22 49 11 47 39 45 51 25L43 8-24 0Z" fill="#141b1b" opacity=".55" />
      <Cone uid={uid} />
      <path d="M0-60 52-30V30L0 60-52 30V-30Z" fill={`url(#${uid}-volcano-grain)`} />
      <LavaFlows />
      <Crater uid={uid} />
      <CornerNumbers />
    </g>
  );
}
