// Proposed Grinch robbers for the Christmas look, drawn in the robber's footprint (about 22 wide,
// feet at y = 20). Review them with tests/grinch-robber.spec.ts; one is picked, the rest deleted.
import type { ReactElement } from 'react';
import { CHRISTMAS } from './tuning';

const G = CHRISTMAS.grinch;
/** The robber's pale outline, so the piece reads on any tile. */
export const CREAM_EDGE = '#f1e0b6';
/** A dark outline to try against the snowy, green tiles. */
export const BLACK_EDGE = '#1a1a1a';
const RED = '#d7263d';
const BELT = '#2b1a12';

/** Every draft takes its outline color. */
export interface GrinchProps {
  edge?: string;
}

/** Yellow eyes with red pupils and a sly sideways look, centered on (0, y). */
function Eyes({ y }: { y: number }) {
  return (
    <>
      <ellipse cx="-2.5" cy={y} rx="1.7" ry="1.15" fill={G.eye} />
      <ellipse cx="2.5" cy={y} rx="1.7" ry="1.15" fill={G.eye} />
      <circle cx="-1.9" cy={y + 0.1} r=".6" fill={G.pupil} />
      <circle cx="3.1" cy={y + 0.1} r=".6" fill={G.pupil} />
      <path
        d={`M-4.8 ${y - 2.4}-1.2 ${y - 1.2}M4.8 ${y - 2.8} 1.2 ${y - 1.2}`}
        stroke={G.brow}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </>
  );
}

/** A Santa hat whose tip flops to the right, sitting at y. */
function Hat({ y, edge }: { y: number; edge: string }) {
  return (
    <>
      <path
        d={`M-6 ${y}Q-2 ${y - 8} 6.5 ${y - 6.5}Q4 ${y - 3.5} 5.6 ${y}Z`}
        fill={RED}
        stroke={edge}
        strokeWidth=".9"
      />
      <rect x="-7" y={y - 1.4} width="13.6" height="3" rx="1.5" fill="#fff" />
      <circle cx="7" cy={y - 6.6} r="1.8" fill="#fff" />
    </>
  );
}

/** A: the Grinch dressed as Santa, standing. */
export function GrinchSanta({ edge = CREAM_EDGE }: GrinchProps): ReactElement {
  return (
    <g transform="translate(24 -20)">
      <ellipse cy="18" rx="12" ry="4" fill="#263d3e" opacity=".3" />
      <path d="M-4 10V18H-7M4 10V18H7" stroke={G.furDark} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M-7-1Q-10 6-9 12H9Q10 6 7-1Z" fill={RED} stroke={edge} strokeWidth="1.2" />
      <rect x="-9.4" y="10" width="18.8" height="3" rx="1.5" fill="#fff" />
      <rect x="-8.2" y="4.6" width="16.4" height="2" fill={BELT} />
      <rect x="-1.4" y="4.2" width="2.8" height="2.8" fill="none" stroke="#ffd23f" strokeWidth=".8" />
      {/* One long green arm, fingers spread. */}
      <path d="M6 1Q12 0 13-5" stroke={G.fur} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M13-5 12-8.4M13-5 14.6-8M13-5 15.6-5.6" stroke={G.fur} strokeWidth="1.1" strokeLinecap="round" />
      <path d="M-6.6-6Q-7.2 1 0 1.4T6.6-6Q6-11 0-11.4T-6.6-6Z" fill={G.fur} stroke={edge} strokeWidth="1.2" />
      <Eyes y={-6} />
      <path d="M-4.2-2.6Q0 .4 4.8-3.6" fill="none" stroke={G.brow} strokeWidth=".9" strokeLinecap="round" />
      <Hat y={-10} edge={edge} />
    </g>
  );
}

/** B: the Grinch in his own fur, tiptoeing off with a sack of presents over his shoulder. */
export function GrinchSack({ edge = CREAM_EDGE }: GrinchProps): ReactElement {
  return (
    <g transform="translate(24 -20)">
      <ellipse cy="18" rx="13" ry="4" fill="#263d3e" opacity=".3" />
      <path d="M-3 10-6 18H-9M3 10 5 17.6H8" stroke={G.furDark} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M-6 0Q-8 6-5 12H5Q7 6 5 0Z" fill={G.fur} stroke={edge} strokeWidth="1.2" />
      <path d="M-3 4-1 6 1 4M-2 8 0 10 2 8" stroke={G.furDark} strokeWidth=".7" fill="none" />
      {/* The sack, bulging with a present peeking out. */}
      <path d="M2-2Q-4-12 6-16Q16-17 16-6Q16 3 8 2Z" fill="#c9b48a" stroke={edge} strokeWidth="1.2" />
      <rect x="7" y="-18.6" width="5" height="4" fill="#3fa35b" stroke={edge} strokeWidth=".6" />
      <path d="M9.5-18.6V-14.6" stroke={RED} strokeWidth="1" />
      <path d="M4-4Q8-3 10-6" stroke="#8a7650" strokeWidth=".8" fill="none" />
      <path d="M-5 2Q-2-1 3-1" stroke={G.fur} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M-6.2-7Q-6.8-.4 0 0T5.8-7Q5.2-12 0-12.4T-6.2-7Z" fill={G.fur} stroke={edge} strokeWidth="1.2" />
      <Eyes y={-7} />
      <path d="M-4-3.4Q0-.6 4.4-4.4" fill="none" stroke={G.brow} strokeWidth=".9" strokeLinecap="round" />
    </g>
  );
}

/** C: the usual robber's cloaked shape in Grinch green, with a Santa hat and his glare. */
export function GrinchCloak({ edge = CREAM_EDGE }: GrinchProps): ReactElement {
  return (
    <g transform="translate(24 -20)">
      <ellipse cy="18" rx="12" ry="4" fill="#263d3e" opacity=".3" />
      <path
        d="M-6-1Q-9 4-7 10L-11 15Q-11 20 0 20T11 15L7 10Q9 4 6-1Z"
        fill={G.furDark}
        stroke={edge}
        strokeWidth="1.3"
      />
      <path d="M-5 3-3 12" stroke={G.fur} strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cy="-6" r="7" fill={G.fur} stroke={edge} strokeWidth="1.3" />
      <Eyes y={-5.6} />
      <path d="M-4-2Q0 1 4.6-2.8" fill="none" stroke={G.brow} strokeWidth=".9" strokeLinecap="round" />
      <Hat y={-11} edge={edge} />
    </g>
  );
}

/** D: the usual robber's cloaked shape made a Santa suit: fur hem and front, a belt, and the Grinch's head. */
export function GrinchSantaCloak({ edge = CREAM_EDGE }: GrinchProps): ReactElement {
  const cloak = 'M-6-1Q-9 4-7 10L-11 15Q-11 20 0 20T11 15L7 10Q9 4 6-1Z';
  return (
    <g transform="translate(24 -20)">
      <ellipse cy="18" rx="12" ry="4" fill="#263d3e" opacity=".3" />
      <path d={cloak} fill={RED} />
      <path d="M-10.4 16.4Q0 21.6 10.4 16.4" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M0 1V18.4" stroke="#fff" strokeWidth="2.4" />
      <path d="M-7.6 7.2H7.6" stroke={BELT} strokeWidth="2" />
      <rect x="-1.5" y="5.7" width="3" height="3" fill="none" stroke="#ffd23f" strokeWidth=".8" />
      <path d={cloak} fill="none" stroke={edge} strokeWidth="1.3" />
      <circle cy="-6" r="7" fill={G.fur} stroke={edge} strokeWidth="1.3" />
      <Eyes y={-5.6} />
      <path d="M-4-2Q0 1 4.6-2.8" fill="none" stroke={G.brow} strokeWidth=".9" strokeLinecap="round" />
      <Hat y={-11} edge={edge} />
    </g>
  );
}

/** E: a skinnier Grinch in a Santa suit, long thin legs and a narrow coat. */
export function GrinchSantaSlim({ edge = CREAM_EDGE }: GrinchProps): ReactElement {
  return (
    <g transform="translate(24 -20)">
      <ellipse cy="18" rx="10" ry="3.6" fill="#263d3e" opacity=".3" />
      <path d="M-2.2 10V18H-5M2.2 10V18H5" stroke={G.furDark} strokeWidth="1.9" fill="none" strokeLinecap="round" />
      <path d="M-4.4 0Q-6 6-5.4 11.6H5.4Q6 6 4.4 0Z" fill={RED} stroke={edge} strokeWidth="1.1" />
      <rect x="-5.9" y="10" width="11.8" height="2.6" rx="1.3" fill="#fff" />
      <path d="M0 .6V10" stroke="#fff" strokeWidth="1.6" />
      <rect x="-5" y="5" width="10" height="1.7" fill={BELT} />
      <rect x="-1.1" y="4.6" width="2.2" height="2.5" fill="none" stroke="#ffd23f" strokeWidth=".7" />
      <path d="M4 1.4Q9.6 .6 10.4-4.6" stroke={G.fur} strokeWidth="1.7" fill="none" strokeLinecap="round" />
      <path
        d="M10.4-4.6 9.6-7.8M10.4-4.6 11.8-7.4M10.4-4.6 12.8-5.2"
        stroke={G.fur}
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path d="M-5.6-6Q-6.2.6 0 1T5.6-6Q5-10.6 0-11T-5.6-6Z" fill={G.fur} stroke={edge} strokeWidth="1.1" />
      <Eyes y={-6} />
      <path d="M-3.8-2.6Q0 .2 4.2-3.4" fill="none" stroke={G.brow} strokeWidth=".9" strokeLinecap="round" />
      <Hat y={-10} edge={edge} />
    </g>
  );
}

/** F: the usual robber's shape with a Santa coat down to its waist (the pinch); green below, as in C. */
export function GrinchSantaCoat({ edge = CREAM_EDGE }: GrinchProps): ReactElement {
  const cloak = 'M-6-1Q-9 4-7 10L-11 15Q-11 20 0 20T11 15L7 10Q9 4 6-1Z';
  return (
    <g transform="translate(24 -20)">
      <ellipse cy="18" rx="12" ry="4" fill="#263d3e" opacity=".3" />
      <path d={cloak} fill={G.furDark} />
      <path d="M-6-1Q-9 4-7 10H7Q9 4 6-1Z" fill={RED} />
      <path d="M0 1V10" stroke="#fff" strokeWidth="2.2" />
      <path d="M-7.7 4.3H7.7" stroke={BELT} strokeWidth="1.8" />
      <rect x="-1.4" y="2.9" width="2.8" height="2.8" fill="none" stroke="#ffd23f" strokeWidth=".8" />
      <path d="M-7.4 10.2H7.4" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />
      <path d={cloak} fill="none" stroke={edge} strokeWidth="1.3" />
      <circle cy="-6" r="7" fill={G.fur} stroke={edge} strokeWidth="1.3" />
      <Eyes y={-5.6} />
      <path d="M-4-2Q0 1 4.6-2.8" fill="none" stroke={G.brow} strokeWidth=".9" strokeLinecap="round" />
      <Hat y={-11} edge={edge} />
    </g>
  );
}
