// Open sea. Sea maps repeat this tile dozens of times, so it stays quiet: a soft gradient,
// a faint seam so ship edges read, and a few small wave marks that vary by `variant`.
import { hexPoints } from '../../../lib/geometry';

/** Tweak here: water from center to rim, the seam between sea tiles, and the wave marks. */
export const OCEAN = {
  center: '#2db5d4',
  middle: '#1c9fc5',
  rim: '#168fba',
  seam: '#9fe1ef',
  seamOpacity: 0.2,
  wave: '#c9eef5',
  waveOpacity: 0.32,
};

/** Three wave arrangements, picked by variant so neighboring tiles differ. */
const WAVES = [
  ['M-31-22q5-4 10 0t10 0', 'M7 17q5-4 10 0t10 0', 'M-15 36q4-3 8 0'],
  ['M-7-33q5-4 10 0t10 0', 'M-37 9q5-4 10 0t10 0', 'M19-4q4-3 8 0', 'M4 34q4-3 8 0'],
  ['M13-27q5-4 10 0t10 0', 'M-27 25q5-4 10 0t10 0', 'M-5 1q4-3 8 0'],
];

export function OceanDefs({ uid }: { uid: string }) {
  return (
    <radialGradient id={`${uid}-ocean`} cx="46%" cy="38%" r="72%">
      <stop offset="0" stopColor={OCEAN.center} />
      <stop offset=".6" stopColor={OCEAN.middle} />
      <stop offset="1" stopColor={OCEAN.rim} />
    </radialGradient>
  );
}

/** The water every sea tile (and iceberg) sits on. */
export function Water({ uid, variant = 0 }: { uid: string; variant?: number }) {
  const waves = WAVES[((variant % WAVES.length) + WAVES.length) % WAVES.length]!;
  return (
    <>
      <polygon points={hexPoints(60.6)} fill={`url(#${uid}-ocean)`} />
      <polygon
        points={hexPoints(59.6)}
        fill="none"
        stroke={OCEAN.seam}
        strokeOpacity={OCEAN.seamOpacity}
        strokeWidth="1"
      />
      <g
        stroke={OCEAN.wave}
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        opacity={OCEAN.waveOpacity}
        aria-hidden="true"
      >
        {waves.map(d => (
          <path key={d} d={d} />
        ))}
      </g>
    </>
  );
}
