// The Christmas robber: the Grinch, in the usual robber's cloaked shape and footprint (about 22
// wide, feet at y = 20), with a Santa hat and his glare. Colors are CHRISTMAS.grinch in tuning.ts.
import type { ReactElement } from 'react';
import { CHRISTMAS } from './tuning';

const G = CHRISTMAS.grinch;

/** The Grinch as the robber, standing on the tile like the usual robber. */
export function GrinchRobber(): ReactElement {
  return (
    <g className="board-robber" transform="translate(24 -20)">
      <ellipse cy="18" rx="12" ry="4" fill="#263d3e" opacity=".3" />
      <path
        d="M-6-1Q-9 4-7 10L-11 15Q-11 20 0 20T11 15L7 10Q9 4 6-1Z"
        fill={G.furDark}
        stroke={G.edge}
        strokeWidth="1.3"
      />
      <path d="M-5 3-3 12" stroke={G.fur} strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cy="-6" r="7" fill={G.fur} stroke={G.edge} strokeWidth="1.3" />
      {/* Yellow eyes with red pupils, looking sideways under a scowl, and a sly grin. */}
      <ellipse cx="-2.5" cy="-5.6" rx="1.7" ry="1.15" fill={G.eye} />
      <ellipse cx="2.5" cy="-5.6" rx="1.7" ry="1.15" fill={G.eye} />
      <circle cx="-1.9" cy="-5.5" r=".6" fill={G.pupil} />
      <circle cx="3.1" cy="-5.5" r=".6" fill={G.pupil} />
      <path d="M-4.8-8-1.2-6.8M4.8-8.4 1.2-6.8" stroke={G.brow} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M-4-2Q0 1 4.6-2.8" fill="none" stroke={G.brow} strokeWidth=".9" strokeLinecap="round" />
      {/* A Santa hat whose tip flops to the right. */}
      <path d="M-6-11Q-2-19 6.5-17.5Q4-14.5 5.6-11Z" fill={G.hat} stroke={G.edge} strokeWidth=".9" />
      <rect x="-7" y="-12.4" width="13.6" height="3" rx="1.5" fill="#fff" />
      <circle cx="7" cy="-17.6" r="1.8" fill="#fff" />
    </g>
  );
}
