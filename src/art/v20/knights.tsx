// Cities & Knights art: commodity cards and icons, knights, city walls, metropolises, the merchant,
// the barbarian ship, and the event die's faces. Colors for each piece are at the top.
import type { Track } from '../../../shared/knights';
import type { Commodity } from '../../../shared/types';
import type { KnightsArt } from '../types';

/** Each track's color: trade yellow, politics blue, science green (as the gates on the event die). */
const TRACK_COLORS: Record<Track, { base: string; light: string; dark: string }> = {
  trade: { base: '#e0a91f', light: '#fff1c4', dark: '#80570b' },
  politics: { base: '#3f6fb5', light: '#e0eaf8', dark: '#1f3a66' },
  science: { base: '#3f8f52', light: '#e0f2e2', dark: '#1d5130' },
};

const cardColors: KnightsArt['cardColors'] = {
  paper: { base: '#8c9b52', light: '#f1f3dc', dark: '#4b5622' },
  cloth: { base: '#b9832b', light: '#f8e9cc', dark: '#6c4511' },
  coin: { base: '#5b80b3', light: '#e2eaf5', dark: '#2a446b' },
};

const PAPER = { sheet: '#fbf5df', edge: '#c9b98a', ink: '#7a6a45', rod: '#8b5a2b' };
const CLOTH = { bolt: '#c0392b', fold: '#e45b47', shade: '#8f2a20', core: '#e9d3a3' };
const COIN = { face: '#f2c94c', rim: '#b8860b', mark: '#8a6408', shine: '#fff1a8' };

/** Corner, log, and trade icon for a commodity. */
function CommodityIcon({ commodity, size = 22 }: { commodity: Commodity; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="resource-icon"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {commodity === 'paper' && (
        <>
          <path d="M5 4h12l2 2v14H5Z" fill={PAPER.sheet} stroke={PAPER.edge} strokeWidth="1.4" />
          <path d="M8 9h8M8 12h8M8 15h5" stroke={PAPER.ink} strokeWidth="1.3" />
          <rect x="3" y="2.5" width="16" height="3" rx="1.5" fill={PAPER.rod} />
        </>
      )}
      {commodity === 'cloth' && (
        <>
          <path d="M3 8c3-3 15-3 18 0v9c-3 3-15 3-18 0Z" fill={CLOTH.bolt} stroke={CLOTH.shade} strokeWidth="1.3" />
          <path d="M3 8c3 3 15 3 18 0" fill="none" stroke={CLOTH.fold} strokeWidth="1.6" />
          <ellipse cx="4" cy="12.5" rx="2" ry="4.5" fill={CLOTH.core} stroke={CLOTH.shade} strokeWidth="1" />
        </>
      )}
      {commodity === 'coin' && (
        <>
          <circle cx="12" cy="12" r="9" fill={COIN.face} stroke={COIN.rim} strokeWidth="1.8" />
          <circle cx="12" cy="12" r="5.6" fill="none" stroke={COIN.mark} strokeWidth="1.2" />
          <path d="M10 10.5 12 8l2 2.5L12 16Z" fill={COIN.mark} />
          <path d="M7 8.5a6 6 0 0 1 4-3" fill="none" stroke={COIN.shine} strokeWidth="1.4" />
        </>
      )}
    </svg>
  );
}

/** The large illustration on a commodity card. */
function CommodityArt({ commodity }: { commodity: Commodity }) {
  return (
    <svg className="cards-art" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="49" r="36" fill="currentColor" opacity=".08" />
      {commodity === 'paper' && (
        <g>
          <path d="M24 24h46l8 8v48H24Z" fill={PAPER.sheet} stroke={PAPER.edge} strokeWidth="3" />
          <path d="M70 24v8h8" fill="#efe4c0" stroke={PAPER.edge} strokeWidth="2.5" />
          <path d="M33 42h36M33 51h36M33 60h36M33 69h22" stroke={PAPER.ink} strokeWidth="3" strokeLinecap="round" />
          <rect x="18" y="17" width="58" height="9" rx="4.5" fill={PAPER.rod} />
          <circle cx="18" cy="21.5" r="5" fill="#6d4420" />
          <circle cx="76" cy="21.5" r="5" fill="#6d4420" />
        </g>
      )}
      {commodity === 'cloth' && (
        <g>
          <path
            d="M16 36c12-10 56-10 68 0v32c-12 10-56 10-68 0Z"
            fill={CLOTH.bolt}
            stroke={CLOTH.shade}
            strokeWidth="3"
          />
          <path d="M16 36c12 10 56 10 68 0" fill="none" stroke={CLOTH.fold} strokeWidth="4" />
          <path
            d="M30 50c10 4 30 4 40 0M30 60c10 4 30 4 40 0"
            fill="none"
            stroke={CLOTH.shade}
            strokeWidth="2"
            opacity=".5"
          />
          <ellipse cx="19" cy="52" rx="7" ry="16" fill={CLOTH.core} stroke={CLOTH.shade} strokeWidth="2.5" />
          <ellipse cx="19" cy="52" rx="2.5" ry="6" fill={CLOTH.shade} />
        </g>
      )}
      {commodity === 'coin' && (
        <g>
          <ellipse cx="58" cy="72" rx="22" ry="7" fill={COIN.rim} />
          <ellipse cx="58" cy="68" rx="22" ry="7" fill={COIN.face} stroke={COIN.rim} strokeWidth="2" />
          <circle cx="44" cy="46" r="24" fill={COIN.face} stroke={COIN.rim} strokeWidth="4" />
          <circle cx="44" cy="46" r="15" fill="none" stroke={COIN.mark} strokeWidth="2.5" />
          <path d="M40 43 44 36l4 7-4 15Z" fill={COIN.mark} />
          <path d="M28 36a18 18 0 0 1 12-9" fill="none" stroke={COIN.shine} strokeWidth="3.5" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

/**
 * A knight token, centered at the origin: a shield in the owner's color with one to three bars for
 * its strength. An active knight stands bright with a gold rim; an inactive one is dimmed and flat.
 */
function Knight({ color, level, active }: { color: string; level: 1 | 2 | 3; active: boolean }) {
  return (
    <g className={`ck-knight${active ? ' active' : ''}`}>
      <ellipse cx="0" cy="11" rx="10" ry="3.2" fill="#1b1206" opacity=".3" />
      <path
        d="M-9-10h18v8c0 8-5 13-9 15-4-2-9-7-9-15Z"
        fill={color}
        stroke={active ? '#ffd65a' : '#2b2b2b'}
        strokeWidth={active ? 2.6 : 1.6}
        opacity={active ? 1 : 0.62}
      />
      <path d="M-6-7h12v4c0 6-3 9-6 10-3-1-6-4-6-10Z" fill="#fff" opacity={active ? 0.22 : 0.1} />
      {Array.from({ length: level }, (_, i) => (
        <rect key={i} x="-5" y={-6 + i * 5} width="10" height="2.6" rx="1.2" fill={active ? '#fff7d6' : '#d9d9d9'} />
      ))}
      {!active && <path d="M-9-10 9 13" stroke="#2b2b2b" strokeWidth="1.2" opacity=".35" />}
    </g>
  );
}

/** A stone wall drawn under a city, centered on its corner. */
function CityWall({ color }: { color: string }) {
  const merlons = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return { x: Math.cos(a) * 17, y: 8 + Math.sin(a) * 6.5 };
  });
  return (
    <g className="ck-wall">
      <ellipse cx="0" cy="8" rx="19" ry="8" fill="#8d8476" stroke="#4a443b" strokeWidth="1.6" />
      <ellipse cx="0" cy="8" rx="15" ry="5.2" fill={color} opacity=".55" />
      {merlons.map((m, i) => (
        <rect
          key={i}
          x={m.x - 2}
          y={m.y - 3.5}
          width="4"
          height="3.5"
          fill="#a59c8d"
          stroke="#4a443b"
          strokeWidth=".8"
        />
      ))}
    </g>
  );
}

/** A metropolis: a banner of the track's color raised over the city. */
function Metropolis({ track }: { track: Track }) {
  const c = TRACK_COLORS[track];
  return (
    <g className="ck-metropolis">
      <path d="M8-30v22" stroke="#3a2a14" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.8-30h11l-3 4 3 4h-11Z" fill={c.base} stroke={c.dark} strokeWidth="1.2" />
      <circle cx="8" cy="-31" r="1.8" fill="#f6d36b" />
    </g>
  );
}

/** The merchant: a small market stall standing on a tile, in its owner's color. */
function Merchant({ color }: { color: string }) {
  return (
    <g className="ck-merchant">
      <ellipse cx="0" cy="9" rx="13" ry="3.5" fill="#1b1206" opacity=".28" />
      <rect x="-10" y="-2" width="20" height="10" rx="1.5" fill="#d8b77a" stroke="#5a3d17" strokeWidth="1.4" />
      <path d="M-13-2 0-12 13-2Z" fill={color} stroke="#2b2b2b" strokeWidth="1.4" />
      <path d="M-7-2v10M0-2v10M7-2v10" stroke="#5a3d17" strokeWidth="1" />
    </g>
  );
}

/** The barbarian ship on its track, centered at the origin. */
function BarbarianShip({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="ck-barbarian-ship">
      <path d="M3 15h18l-3 5H6Z" fill="#5a3a22" stroke="#2c1a0e" strokeWidth="1.2" />
      <path d="M12 3v12" stroke="#2c1a0e" strokeWidth="1.4" />
      <path d="M12 4 19 13H12Z" fill="#b8392d" stroke="#6e1f17" strokeWidth="1" />
      <path d="M12 6 6 13h6Z" fill="#d9cfb8" stroke="#7d735e" strokeWidth="1" />
    </svg>
  );
}

/** One face of the event die: the barbarian ship, or a city gate in a track's color. */
function EventFace({ face, size = 22 }: { face: 'ship' | Track; size?: number }) {
  if (face === 'ship') return <BarbarianShip size={size} />;
  const c = TRACK_COLORS[face];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="ck-gate">
      <path d="M4 21V9l2-3h12l2 3v12h-5v-6a3 3 0 0 0-6 0v6Z" fill={c.base} stroke={c.dark} strokeWidth="1.4" />
      <path d="M4 9h16M7 6V3h2v3m6 0V3h2v3" stroke={c.dark} strokeWidth="1.3" fill="none" />
    </svg>
  );
}

export const knights: KnightsArt = {
  cardColors,
  trackColors: TRACK_COLORS,
  CommodityIcon,
  CommodityArt,
  Knight,
  CityWall,
  Metropolis,
  Merchant,
  BarbarianShip,
  EventFace,
};
