import { PLAYER_COLORS } from '../../../../shared/colors';
import { hexPoints } from '../../../lib/geometry';
import { art, GroundTile } from '../../v13';
import { BrickHills, ForestTrees, WheatStalks } from '../../v13/terrain-features';

const { ArtDefs, BuildingPiece, Road } = art;

export interface AppIconOptions {
  size?: number;
  rounded?: boolean;
  maskable?: boolean;
}

const UID = 'app-icon';
const HALF_WIDTH = Math.sqrt(3) * 30;
const GROUND_DEPTH = 0.62;
const HORIZON = 200;
const SUN_RADIUS = 118;
// The visible sun fills three quarters of the sky; its chord defines the reflection at the horizon.
const SUN_Y = HORIZON / 4 + SUN_RADIUS;
const SUN_HALF_WIDTH = Math.sqrt(SUN_RADIUS ** 2 - (HORIZON - SUN_Y) ** 2);
const TILES: { terrain: 'wood' | 'wheat' | 'brick'; x: number; y: number }[] = [
  { terrain: 'wood', x: -HALF_WIDTH, y: -30 },
  { terrain: 'brick', x: HALF_WIDTH, y: -30 },
  { terrain: 'wheat', x: 0, y: 60 },
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
      <clipPath id={`${UID}-hills`}>
        {/* The near edge clips into the ground while the ridge rises above the far edge. */}
        <path d={`M-49.5-90H49.5V${28.6 * GROUND_DEPTH}L0 ${57.2 * GROUND_DEPTH}L-49.5 ${28.6 * GROUND_DEPTH}Z`} />
      </clipPath>
    </>
  );
}

function Sunset() {
  return (
    <>
      <path d={`M0 0H512V${HORIZON}H0Z`} fill={`url(#${UID}-sky)`} />
      <circle cx="256" cy={SUN_Y} r="210" fill={`url(#${UID}-glow)`} />
      <circle cx="256" cy={SUN_Y} r={SUN_RADIUS} fill={`url(#${UID}-sun)`} />
      <path d={`M0 ${HORIZON}H512V512H0Z`} fill={`url(#${UID}-water)`} />
      <path
        d={`M${256 - SUN_HALF_WIDTH} ${HORIZON}H${256 + SUN_HALF_WIDTH}L412 512H100Z`}
        fill={`url(#${UID}-reflection)`}
      />
      <path d={`M0 ${HORIZON}H512`} stroke="#f7d2a3" strokeWidth="2" opacity=".55" />
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
          <GroundTile uid={UID} terrain={terrain} />
        </g>
      ))}
      <Road from={{ x: 0, y: 0 }} to={{ x: HALF_WIDTH, y: 30 }} color={PLAYER_COLORS.red.fill} />
    </>
  );
}

function IslandFeatures() {
  return (
    <>
      <g transform={`translate(${-HALF_WIDTH} ${-30 * GROUND_DEPTH})`}>
        <ForestTrees depth={GROUND_DEPTH} />
      </g>
      <g transform={`translate(${HALF_WIDTH} ${-30 * GROUND_DEPTH})`} clipPath={`url(#${UID}-hills)`}>
        <g transform="translate(0 -8)">
          <BrickHills />
        </g>
      </g>
      <g transform={`translate(0 ${60 * GROUND_DEPTH})`}>
        <WheatStalks depth={GROUND_DEPTH} />
      </g>
    </>
  );
}

/** The install icon puts the game's real tiles and pieces on an island beneath a colorful sunset. */
export function AppIcon({ size, rounded = false, maskable = false }: AppIconOptions) {
  // The smaller island leaves room for circular launcher crops while the backdrop stays full bleed.
  // The regular icon adds a tighter crop to the 15% enlargement; the maskable one keeps its safe margin.
  const scale = maskable ? 1.65 : 1.55 * 1.15 * (512 / 480);
  const waterGap = maskable ? 5.8 : 7.2;
  const centerY = HORIZON + waterGap + 95 * scale * GROUND_DEPTH;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width={size} height={size}>
      <defs>
        <ArtDefs uid={UID} />
        <SunsetDefs />
      </defs>
      <g clipPath={rounded ? `url(#${UID}-corners)` : undefined}>
        <Sunset />
        <g transform={`translate(256 ${centerY}) scale(${scale})`}>
          {/* Ground positions are projected separately from upright trees, stalks, hills and the house. */}
          <g transform={`scale(1 ${GROUND_DEPTH})`}>
            <IslandGround />
          </g>
          <IslandFeatures />
          <g transform="translate(0 -3) scale(1.41)">
            <BuildingPiece color={PLAYER_COLORS.red.fill} city={false} />
          </g>
        </g>
      </g>
    </svg>
  );
}
