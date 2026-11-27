import { Fragment } from 'react';
import type { BaseTerrain, ClassicResource } from '../../../../shared/types';
import { TileFrame } from '../index';
import { Cane, Floss, Gumdrop, Kiss } from './candies';
import { CandyBells } from './candy-bells';
import { GarlandRope } from './candy-garland';
import { CandyGround, CaneSnow } from './candy-ground';
import { LightString, StillFlakes } from './effects';
import { WinterTile } from './tiles';
import { TwizzlerBunch } from './twizzlers';

/** One sweet on a tile, with the details its resource uses (bunch size and lean, a red pair, a color). */
type Spot = {
  x: number;
  y: number;
  scale: number;
  count?: number;
  lean?: number;
  red?: boolean;
  variant?: number;
  color?: string;
  /** A Twizzler bunch wound with lights. */
  lit?: boolean;
  /** Widens the sweet, for the long, plump cotton-candy cloud. */
  stretch?: number;
  /** Snow piled at the sweet's feet. */
  snowy?: boolean;
};

// The number token covers a circle of radius ~19 at the center; one ore mountain peeks from behind it.
const SPOTS: Record<ClassicResource, Spot[]> = {
  // Clouds dotted around the pasture, two of them long and plump.
  sheep: [
    { x: -6, y: -45, scale: 0.45 },
    { x: 26, y: -33, scale: 0.6 },
    { x: -32, y: -28, scale: 0.68, stretch: 1.55 },
    { x: 4, y: -22, scale: 0.52, stretch: 1.6 },
    { x: 46, y: -8, scale: 0.42 },
    { x: -47, y: 6, scale: 0.48 },
    { x: -24, y: 8, scale: 0.5, stretch: 1.5 },
    { x: 35, y: 12, scale: 0.55 },
    { x: -28, y: 28, scale: 0.62, stretch: 1.5 },
    { x: 14, y: 30, scale: 0.56, stretch: 1.55 },
    { x: 40, y: 34, scale: 0.42 },
    { x: -6, y: 50, scale: 0.48 },
  ],
  ore: [
    { x: 18, y: -38, scale: 1.05 },
    { x: -30, y: -34, scale: 1.3 },
    { x: -4, y: -28, scale: 0.95 },
    { x: 40, y: -20, scale: 1.15 },
    // The big peak rising behind the number, up and to its left.
    { x: -12, y: -8, scale: 1.55 },
    { x: -46, y: 2, scale: 1.2 },
    { x: 38, y: 8, scale: 1.35 },
    { x: -30, y: 22, scale: 1.05 },
    { x: 20, y: 30, scale: 1.2 },
    { x: 44, y: 40, scale: 0.9 },
    { x: -12, y: 46, scale: 1.3 },
  ],
  brick: [
    { x: -26, y: -22, scale: 0.72, count: 3, lean: -8, lit: true },
    { x: 22, y: -27, scale: 0.68, count: 2, lean: 10, snowy: true },
    { x: -38, y: 15, scale: 0.62, count: 4, lean: -4, snowy: true },
    { x: 39, y: 12, scale: 0.6, count: 2, lean: 6, lit: true },
    { x: -16, y: 42, scale: 0.64, count: 5, lean: 4, lit: true },
    { x: 23, y: 42, scale: 0.6, count: 3, lean: -10, snowy: true },
  ],
  wood: [
    { x: -27, y: -26, scale: 0.78 },
    { x: 24, y: -29, scale: 0.72, variant: 1 },
    { x: -38, y: 9, scale: 0.68, red: true },
    { x: 38, y: 11, scale: 0.68, red: true, variant: 1 },
    { x: -19, y: 40, scale: 0.74, variant: 1 },
    { x: 21, y: 42, scale: 0.7 },
  ],
  wheat: [
    { x: -29, y: -25, scale: 0.62, snowy: true },
    { x: -8, y: -39, scale: 0.52 },
    { x: 41, y: -12, scale: 0.5 },
    { x: -40, y: 4, scale: 0.58, color: '#db6f85' },
    { x: 38, y: 10, scale: 0.6, snowy: true },
    { x: -27, y: 33, scale: 0.62 },
    { x: -1, y: 45, scale: 0.6, snowy: true },
    { x: 29, y: 36, scale: 0.56, color: '#81b58b' },
  ],
};

// The forest garland lies on the ground: drawn after this cane pair (it crosses the pair's foot) and before
// the rest, so the left red pair stands in front of it.
const GARLAND_OVER = 1;

/** One run of the page garland across the forest floor, edge to edge, rising to the upper right. */
function ForestGarland({ uid }: { uid: string }) {
  return (
    <GarlandRope
      uid={uid}
      snow
      points={[
        [-70, -4],
        [-50, -9],
        [-30, -6],
        [-12, -22],
        [6, -27],
        [22, -17],
        [40, -18],
        [54, -29],
        [70, -32],
      ]}
    />
  );
}

/** Draws one spot's sweet for its resource. */
function Sweet({ terrain, spot }: { terrain: ClassicResource; spot: Spot }) {
  switch (terrain) {
    case 'sheep':
      return <Floss />;
    case 'ore':
      return <Kiss snowy />;
    case 'brick':
      return (
        <>
          <TwizzlerBunch count={spot.count ?? 3} lean={spot.lean} />
          {spot.snowy && <CaneSnow variant={spot.x > 0 ? 0 : 1} />}
        </>
      );
    case 'wood':
      return <Grove red={spot.red} variant={spot.variant} />;
    case 'wheat':
      return (
        <>
          <Gumdrop small color={spot.color} />
          {spot.snowy && <CaneSnow variant={spot.x > 0 ? 1 : 0} />}
        </>
      );
  }
}

/** A tied pair of canes with snow bunched around its feet. */
function Grove({ red = false, variant = 0 }: { red?: boolean; variant?: number }) {
  return (
    <>
      <Cane red={red} paired />
      <CaneSnow variant={variant} />
    </>
  );
}

/** A short string of lights wound up and across a Twizzler bunch. */
function BunchLights({ spot, seed }: { spot: Spot; seed: number }) {
  const s = spot.scale;
  const at = (u: number, v: number): [number, number] => [spot.x + u * s, spot.y + v * s];
  return <LightString posts={[at(-16, -2), at(0, -14), at(16, -24)]} sag={1.5} seed={seed + spot.x} />;
}

/** Each base resource as candy on its own colored ground, with snow only in small pockets. */
export function CandyTile({
  uid,
  terrain,
  seed = 0,
  paid,
}: {
  uid: string;
  terrain: BaseTerrain;
  seed?: number;
  paid?: number;
}) {
  if (terrain === 'desert') return <WinterTile uid={uid} terrain={terrain} seed={seed} paid={paid} />;
  return (
    <TileFrame uid={uid} terrain={terrain}>
      <g data-candy-terrain={terrain}>
        <CandyGround terrain={terrain} />
        {SPOTS[terrain].map((spot, i) => (
          <Fragment key={i}>
            <g transform={`translate(${spot.x} ${spot.y}) scale(${spot.scale * (spot.stretch ?? 1)} ${spot.scale})`}>
              <ellipse cx="1" cy="12" rx="19" ry="5" fill="#2f4a52" opacity=".2" />
              <Sweet terrain={terrain} spot={spot} />
            </g>
            {terrain === 'wood' && i === GARLAND_OVER && <ForestGarland uid={uid} />}
          </Fragment>
        ))}
        {terrain === 'wheat' && (
          <g transform="translate(22 -32) scale(.82)">
            <CandyBells />
          </g>
        )}
        {SPOTS[terrain]
          .filter(spot => spot.lit)
          .map(spot => (
            <BunchLights key={spot.x} spot={spot} seed={seed} />
          ))}
        <StillFlakes count={5} seed={seed} />
      </g>
    </TileFrame>
  );
}
