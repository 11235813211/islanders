import type { ClassicResource } from '../../../../shared/types';

const COLORS: Record<ClassicResource, string> = {
  sheep: '#98ce4b',
  wood: '#289b60',
  ore: '#58acc9',
  brick: '#ed795e',
  wheat: '#f4c83b',
};

/** Extra snow pockets per terrain, each a different shape, kept small so the ground stays colorful. */
const SNOW: Record<ClassicResource, string> = {
  sheep: 'M24-40Q36-47 49-38Q38-35 29-34ZM-61 19Q-52 13-41 17Q-49 22-61 24ZM40 40Q49 35 58 39L52 45Q45 45 40 40Z',
  wood: 'M-6-50Q4-55 15-49Q5-45-3-46ZM-55-5Q-45-11-35-6Q-44-2-52-2ZM44 30Q52 25 60 30L56 35Q48 35 44 30Z',
  ore: 'M-14 58Q-2 50 13 56L8 62-10 62ZM-58 8Q-50 2-42 6L-46 11Q-53 12-58 8ZM46-4Q53-9 60-4L57 1Q50 1 46-4Z',
  brick:
    'M-20-48Q-8-55 6-47Q-6-44-15-42ZM30 46Q42 39 55 44Q44 50 34 50ZM-62 24Q-54 18-45 22L-51 28ZM2-30Q12-36 22-31Q14-27 6-27ZM40-14Q49-19 58-14Q50-10 43-10ZM-40 44Q-31 39-22 43Q-30 48-38 48ZM-4 54Q4 49 14 53Q6 57-2 58Z',
  wheat:
    'M30-8Q42-15 55-8Q44-4 34-4ZM-34 54Q-24 47-11 52Q-22 57-32 58ZM-58-14Q-50-21-39-16Q-48-12-56-10ZM8-52Q18-57 30-51Q20-48 12-48ZM44 22Q52 17 60 22L56 27Q48 27 44 22ZM-52 28Q-43 22-32 27Q-41 32-50 32ZM12 14Q22 9 32 14Q22 18 14 17Z',
};

/** Small light dots and grass tufts that give the forest floor some texture. */
function ForestFloor() {
  const spots = Array.from({ length: 34 }, (_, i) => [((i * 37) % 104) - 52, ((i * 61) % 112) - 56] as const);
  return (
    <g>
      {spots.map(([x, y], i) =>
        i % 3 ? (
          <circle key={i} cx={x} cy={y} r={i % 2 ? 0.9 : 1.3} fill="#56c27d" opacity=".55" />
        ) : (
          <path
            key={i}
            d={`M${x - 2.4} ${y + 1.5}l1.2-3 .9 2.4 1-3.6 1 3.4 1-2.4.9 3.2`}
            fill="none"
            stroke="#1c7c4b"
            strokeWidth=".9"
            strokeLinejoin="round"
          />
        ),
      )}
      <path
        d="M-46-40Q-30-46-14-40M18 18Q32 12 48 20M-50 50Q-36 44-22 50"
        fill="none"
        stroke="#1f8c55"
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".5"
      />
    </g>
  );
}

/** Terrain-specific contours leave most of each tile colorful; snow gathers in small pockets. */
export function CandyGround({ terrain }: { terrain: ClassicResource }) {
  return (
    <g data-candy-ground={terrain}>
      <path d="M-70-70H70V70H-70Z" fill={COLORS[terrain]} />
      {terrain === 'sheep' && (
        <>
          <path d="M-65-2Q-28-35 4-13T65-8V65H-65Z" fill="#78bc45" />
          <path d="M-65 29Q-26-9 10 18T65 20V65H-65Z" fill="#a8d854" />
          <path d="M-65 56Q-26 20 11 39T65 38V65H-65Z" fill="#85c64b" />
          <path
            d="M-51-10Q-37-24-16-21Q-29-19-36-13Q-44-10-51-10ZM19 16Q38 20 56 13L51 18Q34 24 19 16ZM-42 45Q-25 33-8 38Q-22 37-30 43Z"
            fill="#f4f9ef"
          />
          <path
            d="M-48 21q7-5 14-4M17 50q14-1 23-7M-6-38q12-3 21 1"
            fill="none"
            stroke="#c8e979"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      )}
      {terrain === 'wood' && (
        <>
          <path d="M-58-28Q-26-5-43 23T-22 65H-70V-40ZM39-48Q14-20 36 11T26 61H70V-55Z" fill="#218953" />
          <path d="M-11-54Q-21-20-8-7M-42 24q8 6 15 5M10 46q16 6 27-2" stroke="#5fc67b" strokeWidth="1.7" fill="none" />
          <ForestFloor />
        </>
      )}
      {terrain === 'ore' && (
        <>
          <path d="M-70 23-31-16 4 4 31-23 70 19V70H-70Z" fill="#4497b7" />
          <path d="M-70 43-34 18 6 31 35 10 70 37V70H-70Z" fill="#6ab7cd" />
          <path d="M-47 27-36 19-24 25-39 24ZM25 35l13-5 12 8-17-3ZM-20 53l13-8 14 6-14-2Z" fill="#eef8f6" />
          <path d="m-44 4 4-3 3 4m5 38 4-2 2 3m58-25 4-4 3 5" fill="none" stroke="#277b9e" strokeWidth="1.5" />
        </>
      )}
      {terrain === 'brick' && (
        <>
          <path d="M-65-2Q-43-33-12-19T58-22L70 65H-70Z" fill="#df654f" />
          <path d="M-66 30Q-39 8-10 24T62 13V70H-66Z" fill="#f48b65" />
          <path d="M-67 52Q-33 26 6 43T65 39V70H-67Z" fill="#ea7054" />
          <path
            d="M-52-10Q-36-26-16-21Q-30-21-40-11L-47-12ZM29 22q16-2 28-9l-3 6q-10 7-25 3ZM-44 46q12-12 29-9l-12 3-8 6Z"
            fill="#fff6ed"
          />
          <path d="M-42 13q8-3 14-1M11-39l15 4M8 52q12-2 20-6" stroke="#ffb582" strokeWidth="1.4" fill="none" />
        </>
      )}
      {terrain === 'wheat' && (
        <>
          <path d="M-59-30Q-11-12 9-30T59-21L70 17Q19 2-4 13T-64 4Z" fill="#f8d854" />
          <path d="M-60 45Q-21 15 6 32T63 28V70H-60Z" fill="#eab328" />
          <path
            d="M-40 38Q-24 25-7 34M14-38q15-1 28 9M8 49q18 0 28-11"
            stroke="#ffe780"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <path d="M-52 9q9-7 17-2l-11 2-4 3ZM-16-43q11-5 19 1l-13-1ZM9 48q10-4 18-4l-6 5-13 1Z" fill="#fff8df" />
          <g fill="#fff4ac">
            <circle cx="-35" cy="22" r="1" />
            <circle cx="16" cy="-27" r=".8" />
            <circle cx="37" cy="18" r="1" />
            <circle cx="-8" cy="42" r=".8" />
          </g>
        </>
      )}
      <path d={SNOW[terrain]} fill="#c6dfe6" transform="translate(0 1.4)" />
      <path d={SNOW[terrain]} fill="#f7fbfb" />
    </g>
  );
}

/** Uneven snow piled at a cane's feet, leaving the forest's green floor visible. */
export function CaneSnow({ variant }: { variant: number }) {
  const drift =
    variant % 2
      ? 'M-22 11Q-19 6-11 8Q-3 3 5 8Q16 6 20 12Q7 17-5 14Q-15 17-22 11Z'
      : 'M-24 11Q-15 6-9 9Q-4 4 3 7Q11 4 17 10L23 13Q7 17-2 14Q-14 17-24 11Z';
  return (
    <g>
      <path d={drift} fill="#bfded9" transform="translate(0 1.7)" />
      <path d={drift} fill="#f2f9ef" />
    </g>
  );
}
