// The ship piece and the pirate. A ship is one solid piece in the seat color, like the other
// pieces: hull a shade darker, sail a shade lighter, outlined in the seat's dark tone.
import { outlineTone, tone } from '../solids';

/** Tweak here: the pirate's hull, sails, flag, and the light rim that keeps it visible on water. */
export const PIRATE = {
  hull: '#20252a',
  hullLight: '#3a4148',
  sail: '#3d434b',
  sailShade: '#2c3137',
  flag: '#f4ecd8',
  rim: '#f1e0b6',
};

/** Ships are drawn this much smaller than the v11 model. */
const SHIP_SCALE = 0.9;

/** A ship on the edge from `from` to `to`: the boat upright at the edge's middle. */
export function Ship({
  from,
  to,
  color,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
}) {
  const x = (from.x + to.x) / 2;
  const y = (from.y + to.y) / 2;
  // Bow points along the edge, toward whichever end is further right.
  const facing = to.x - from.x < -0.5 ? -1 : 1;
  const line = outlineTone(color);
  return (
    <g className="board-ship">
      <g transform={`translate(${x} ${y + 2}) scale(${facing * SHIP_SCALE} ${SHIP_SCALE})`}>
        <ellipse cy="8.5" rx="13" ry="2.6" fill="#0b3f52" opacity=".28" />
        {/* Hull */}
        <path
          d="M-14 0H14L10 8H-10Z"
          fill={tone(color, -0.18)}
          stroke={line}
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M-12.5 2.6H12.6" stroke={tone(color, 0.25)} strokeWidth="1" opacity=".8" />
        {/* Mast, sail, and pennant */}
        <path d="M0 0V-19" stroke={line} strokeWidth="1.6" strokeLinecap="round" />
        <path
          d="M-8-16H7Q10-9 7-2H-8Q-5-9-8-16Z"
          fill={tone(color, 0.14)}
          stroke={line}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M-6-9H6" stroke={line} strokeWidth=".8" opacity=".55" />
        <path d="M0-19 6-17.5 0-16Z" fill={color} stroke={line} strokeWidth=".8" strokeLinejoin="round" />
      </g>
    </g>
  );
}

/** The pirate ship, drawn at the middle of its sea tile. */
export function Pirate() {
  return (
    <g className="board-pirate" transform="translate(0 4)">
      <ellipse cy="13" rx="20" ry="4" fill="#082f3d" opacity=".35" />
      <path d="M-21 2H21L15 13H-15Z" fill={PIRATE.hull} stroke={PIRATE.rim} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M-18 5.5H18" stroke={PIRATE.hullLight} strokeWidth="1.3" />
      <g fill={PIRATE.flag}>
        <circle cx="-9" cy="8.5" r="1" />
        <circle cx="0" cy="8.5" r="1" />
        <circle cx="9" cy="8.5" r="1" />
      </g>
      <path d="M-5 2V-26M8 2V-20" stroke={PIRATE.rim} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M-5 2V-26M8 2V-20" stroke={PIRATE.hull} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M-15-22H4Q7-14 4-6H-15Q-12-14-15-22Z" fill={PIRATE.sail} stroke={PIRATE.rim} strokeWidth="1.1" />
      <path d="M-15-22H4Q7-14 4-6" fill="none" stroke={PIRATE.sailShade} strokeWidth="2" opacity=".6" />
      <path d="M3-16H15Q17-11 15-5H3Q5-11 3-16Z" fill={PIRATE.sail} stroke={PIRATE.rim} strokeWidth="1.1" />
      <path d="M-5-26H-15V-31H-5Z" fill={PIRATE.hull} stroke={PIRATE.rim} strokeWidth=".9" />
      <circle cx="-10" cy="-28.8" r="1.5" fill={PIRATE.flag} />
      <path d="M-11.8-26.6 -8.2-26.6" stroke={PIRATE.flag} strokeWidth=".9" />
    </g>
  );
}
