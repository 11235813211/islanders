import type { ClassicResource } from '../../../../shared/types';
import { TwizzlerBunch } from './twizzlers';

/** The same sweets appear on the hexes and in the train's open wagons. */
export function Candy({ resource }: { resource: ClassicResource }) {
  switch (resource) {
    case 'wood':
      return <Cane paired />;
    case 'sheep':
      return <Floss />;
    case 'ore':
      return <Kiss />;
    case 'brick':
      return <TwizzlerBunch count={3} />;
    case 'wheat':
      return <Gumdrop small />;
  }
}

/** A glossy hooked candy cane; mint green is the main lumber color. */
export function Cane({ red = false, paired = false }: { red?: boolean; paired?: boolean }) {
  const color = red ? '#cd304f' : '#198356';
  const hook = 'M3 9V-16C3-29-14-29-14-16';
  return (
    <g>
      {paired && (
        <g transform="translate(-5 0) rotate(-28)">
          <Cane red={red} />
        </g>
      )}
      <g transform={paired ? 'rotate(22)' : undefined}>
        <path d={hook} fill="none" stroke="#2d655b" strokeWidth="7.5" strokeLinecap="round" />
        <path d={hook} fill="none" stroke="#fffdf0" strokeWidth="6.4" strokeLinecap="round" />
        <path d={hook} fill="none" stroke={color} strokeWidth="6" strokeDasharray="4.5 5" />
        <path d="M1 7V-16Q1-24-5-24" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".8" strokeLinecap="round" />
      </g>
      {paired && (
        <path
          d="M-3-3Q-16-12-13-2Q-10 3-3-3Q9-12 9-2Q7 3-3-3L-7 7M-3-3 2 7"
          fill="#d52d4b"
          stroke="#9d203c"
          strokeWidth="1"
        />
      )}
    </g>
  );
}

/** A cotton-candy cloud, pink-swirled. */
export function Floss() {
  return (
    <g>
      <path
        d="M-15 4C-24 1-23-11-16-13C-19-23-7-29-1-24C7-32 19-24 17-17C27-13 24 0 17 3C13 12-9 14-15 4Z"
        fill="#c8dfe9"
      />
      <path
        d="M-16 0C-22-4-19-12-13-13C-14-22-6-25 0-21C8-28 17-23 14-15C23-12 21-4 16-3C19 6 4 10-1 5C-6 11-15 8-16 0Z"
        fill="#fffdfd"
      />
      <path
        d="M-16-9Q-20 0-9 3Q-2 3-3-3Q-7-7-11-3M6-19Q18-20 15-12Q11-8 7-13"
        fill="none"
        stroke="#f6d6e4"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M3 3Q14 6 17-3M-11-17Q-7-22-3-18" fill="none" stroke="#dceff7" strokeWidth="2.4" strokeLinecap="round" />
    </g>
  );
}

/** A chocolate kiss; on the ore hex it is drawn large and snowcapped, as a mountain. */
export function Kiss({ snowy = false }: { snowy?: boolean }) {
  return (
    <g>
      <path d="M-19 6C-19-2-7-7-3-19Q-1-28 2-25C0-16 9-11 14-4Q27 10 0 13Q-15 12-19 6Z" fill="#603d38" />
      <path d="M-18 5C-18-2-7-7-3-19Q-1-28 2-25C-1-11-4-2 0 10Q-12 10-18 5Z" fill="#b27b64" />
      <path d="M2-24Q0-12 14-1L7 8 0 10Q-4-4 2-24Z" fill="#89564b" />
      <path d="M-12 3Q-5-4-3-12" fill="none" stroke="#dab09a" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M-18 6Q-2 14 18 5" fill="none" stroke="#472d2d" strokeWidth="1.3" />
      {snowy && (
        <>
          <path d="M2-25Q-1-27-3-19-4-15-6-12Q-3-10-1-13Q1-9 3-12Q6-9 7-12Q3-17 2-25Z" fill="#f6fbff" />
          <path d="M2-25Q1-19 3-12Q6-9 7-12Q3-17 2-25Z" fill="#cfe1ec" />
        </>
      )}
    </g>
  );
}

/** Sugar-coated gumdrops, mostly lemon yellow with a few colored sweets. */
export function Gumdrop({ small = false, color = '#edbf27' }: { small?: boolean; color?: string }) {
  return (
    <g transform={small ? 'scale(.82)' : undefined}>
      <path
        d="M-17 5-12-14Q-9-26 0-26Q10-26 13-14L18 5Q16 13 0 14Q-16 13-17 5Z"
        fill={color}
        stroke="#987722"
        strokeWidth=".7"
      />
      <path d="M-16 5-11-14Q-6-24 0-24Q-6-10-4 10Q-12 10-16 5Z" fill="#fff3a4" opacity=".65" />
      <path d="M-16 6Q0 13 17 5" fill="none" stroke="#a88726" strokeWidth="1.3" opacity=".55" />
      {Array.from({ length: small ? 28 : 19 }, (_, i) => (
        <rect
          key={i}
          x={-11 + ((i * 7) % 23)}
          y={-15 + ((i * 11) % 24)}
          width={small ? 1.5 : 1.2}
          height={small ? 1.5 : 1.2}
          rx=".3"
          fill="#fffce2"
          transform={`rotate(${i * 13} ${-11 + ((i * 7) % 23)} ${-15 + ((i * 11) % 24)})`}
          opacity=".85"
        />
      ))}
    </g>
  );
}
