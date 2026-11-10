import { PLAYER_COLORS } from '../../shared/colors';
import type { BaseTerrain } from '../../shared/types';
import { hexPoints } from '../lib/geometry';
import { ArtDefs, BuildingPiece, HexTile, Road } from './index';

export interface AppIconOptions {
  size?: number;
  rounded?: boolean;
  maskable?: boolean;
}

const UID = 'app-icon';
const HALF_WIDTH = Math.sqrt(3) * 30;
const TILES: { terrain: BaseTerrain; x: number; y: number }[] = [
  { terrain: 'wood', x: -HALF_WIDTH, y: -30 },
  { terrain: 'wheat', x: HALF_WIDTH, y: -30 },
  { terrain: 'brick', x: 0, y: 60 },
];

function SunsetDefs() {
  return (
    <>
      <linearGradient id={`${UID}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#44316f" />
        <stop offset=".42" stopColor="#ad437b" />
        <stop offset=".78" stopColor="#f47b58" />
        <stop offset="1" stopColor="#f6b96f" />
      </linearGradient>
      <linearGradient id={`${UID}-water`} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#20aaca" />
        <stop offset=".5" stopColor="#147a9a" />
        <stop offset="1" stopColor="#0e476a" />
      </linearGradient>
      <linearGradient id={`${UID}-sun`} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#ffdf96" />
        <stop offset="1" stopColor="#ffad56" />
      </linearGradient>
      <radialGradient id={`${UID}-glow`}>
        <stop stopColor="#ffbb75" stopOpacity=".4" />
        <stop offset="1" stopColor="#ffbb75" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${UID}-reflection`} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#ffd18c" stopOpacity=".4" />
        <stop offset="1" stopColor="#ffd18c" stopOpacity="0" />
      </linearGradient>
      <clipPath id={`${UID}-corners`}>
        <rect width="512" height="512" rx="112" />
      </clipPath>
    </>
  );
}

function Sunset() {
  return (
    <>
      <path d="M0 0H512V228H0Z" fill={`url(#${UID}-sky)`} />
      <circle cx="256" cy="209" r="190" fill={`url(#${UID}-glow)`} />
      <circle cx="256" cy="205" r="90" fill={`url(#${UID}-sun)`} />
      <path d="M0 228H512V512H0Z" fill={`url(#${UID}-water)`} />
      <path d="M0 228H512" stroke="#f7d2a3" strokeWidth="2" opacity=".55" />
      <path d="M221 230H291L362 494H150Z" fill={`url(#${UID}-reflection)`} />
      <g fill="none" stroke="#c5dcd6" strokeLinecap="round">
        <path d="M28 284Q57 279 86 284M421 266Q445 262 478 266" strokeWidth="2.5" opacity=".35" />
        <path d="M34 365Q64 370 91 364M402 350Q436 345 475 350" strokeWidth="3" opacity=".32" />
        <path d="M71 441Q108 446 145 441M350 453Q386 448 424 453" strokeWidth="3.5" opacity=".28" />
      </g>
    </>
  );
}

function IslandGround() {
  return (
    <>
      <g fill="#ecd5a0" stroke="#c0d8c8" strokeWidth="3.2" strokeLinejoin="round">
        {TILES.map(({ terrain, x, y }) => (
          <polygon key={terrain} transform={`translate(${x} ${y})`} points={hexPoints(65)} />
        ))}
      </g>
      {TILES.map(({ terrain, x, y }) => (
        <g key={terrain} transform={`translate(${x} ${y})`}>
          <HexTile uid={UID} terrain={terrain} />
        </g>
      ))}
      <Road from={{ x: 0, y: 0 }} to={{ x: HALF_WIDTH, y: 30 }} color={PLAYER_COLORS.red.fill} />
    </>
  );
}

/** The install icon puts the game's real tiles and pieces on an island beneath a colorful sunset. */
export function AppIcon({ size, rounded = false, maskable = false }: AppIconOptions) {
  // The smaller island leaves room for circular launcher crops while the backdrop stays full bleed.
  const scale = maskable ? 1.32 : 1.55;
  const centerY = maskable ? 318 : 335;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width={size} height={size}>
      <defs>
        <ArtDefs uid={UID} />
        <SunsetDefs />
      </defs>
      <g clipPath={rounded ? `url(#${UID}-corners)` : undefined}>
        <Sunset />
        <g transform={`translate(256 ${centerY}) scale(${scale})`}>
          {/* Only the ground tilts into the ocean plane; the settlement stands upright on it. */}
          <g transform="scale(1 .58)">
            <IslandGround />
          </g>
          <g transform="translate(0 -3) scale(1.41)">
            <BuildingPiece color={PLAYER_COLORS.red.fill} city={false} />
          </g>
        </g>
      </g>
    </svg>
  );
}
