// Fog: an unexplored tile, white mist with a question mark. What lies under it is revealed when a
// road or ship reaches one of its corners.

/** Tweak here: the mist from rim to center, the drifting wisps, and the question mark. */
export const FOG = {
  rim: '#dfe8ec',
  center: '#ffffff',
  wisp: '#f4f8fa',
  wispShade: '#cfdbe1',
  mark: '#8aa0ab',
  markShadow: '#ffffff',
};

export function FogTile({ uid }: { uid: string }) {
  return (
    <g>
      <defs>
        <radialGradient id={`${uid}-fog`}>
          <stop offset="0" stopColor={FOG.center} />
          <stop offset="1" stopColor={FOG.rim} />
        </radialGradient>
      </defs>
      <polygon points="0,-60.6 52.5,-30.3 52.5,30.3 0,60.6 -52.5,30.3 -52.5,-30.3" fill={`url(#${uid}-fog)`} />
      <g fill="none" strokeLinecap="round">
        <path d="M-40-26q14-7 26 0t26 0" stroke={FOG.wispShade} strokeWidth="5" opacity=".55" />
        <path d="M-22 30q14-7 26 0t26 0" stroke={FOG.wispShade} strokeWidth="5" opacity=".5" />
        <path d="M-44 6q10-5 20 0" stroke={FOG.wisp} strokeWidth="6" />
        <path d="M24-6q10-5 20 0" stroke={FOG.wisp} strokeWidth="6" />
      </g>
      <text
        textAnchor="middle"
        y="14"
        fontSize="44"
        fontWeight="900"
        fill={FOG.mark}
        stroke={FOG.markShadow}
        strokeWidth="2"
        paintOrder="stroke"
      >
        ?
      </text>
    </g>
  );
}
