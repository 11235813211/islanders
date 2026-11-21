// Iceberg: a faceted berg on the same water as every sea tile (no tint, so it matches the sea
// around it). Ships can't sail beside it and nothing is produced.
import { Water } from './ocean';

/** Tweak here: the berg's lit, mid, and shaded faces, the glow under the water, and the foam line. */
export const ICE = {
  halo: '#a6e4f1',
  lit: '#fbfeff',
  mid: '#ddf2fa',
  shade: '#a8d5e9',
  deep: '#79b9d5',
  foam: '#ffffff',
};

export function IcebergTile({ uid, variant }: { uid: string; variant?: number }) {
  return (
    <g>
      <Water uid={uid} variant={variant} />
      <ellipse cx="2" cy="12" rx="38" ry="21" fill={ICE.halo} opacity=".5" />
      <ellipse cx="2" cy="12" rx="27" ry="13" fill={ICE.halo} opacity=".45" />
      {/* The berg: four peaks, lit from the upper left. */}
      <path d="M-31 13-25-6-14-20-6-14 5-35 15-21 22-25 33 1 34 13Z" fill={ICE.mid} />
      <path d="M-31 13-25-6-14-20-12 2-20 13Z" fill={ICE.lit} />
      <path d="M-6-14 5-35 2-6-8 6Z" fill={ICE.lit} />
      <path d="M5-35 15-21 22-25 33 1 14-3 2-6Z" fill={ICE.shade} />
      <path d="M33 1 34 13H10L14-3Z" fill={ICE.deep} />
      <path d="M-12 2-8 6 2-6 14-3 10 13H-20Z" fill={ICE.mid} />
      <path d="M-25-6-14-20M-6-14 5-35M15-21 22-25" stroke={ICE.lit} strokeWidth="1" fill="none" opacity=".8" />
      <path
        d="M-34 14q4-3 8 0t8 0 8 0 8 0 8 0 8 0 8 0 8 0"
        stroke={ICE.foam}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      {/* Floes */}
      <path d="M-40 31-33 27-26 30-29 35-38 35Z" fill={ICE.mid} />
      <path d="M-40 31-33 27-33 35-38 35Z" fill={ICE.lit} />
      <path d="M28-34 35-38 41-33 37-29 30-30Z" fill={ICE.mid} />
      <path d="M22 33 27 30 31 33 27 36Z" fill={ICE.lit} />
    </g>
  );
}
