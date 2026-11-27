import { useContext } from 'react';
import type { BaseTerrain, ClassicResource } from '../../../../shared/types';
import { CandyChoices, type CandyStyle } from '../../candy-options';
import { TileFrame } from '../index';
import { Candy, Cane, Gumdrop } from './candies';
import { LightString, StillFlakes } from './effects';
import { WinterTile } from './tiles';

const GROUND: Record<ClassicResource, [string, string]> = {
  wood: ['#81b99a', '#427e65'],
  sheep: ['#cedee5', '#adc6d5'],
  wheat: ['#ecd28a', '#cba653'],
  brick: ['#e9b3a4', '#ba756c'],
  ore: ['#a8bccb', '#71899e'],
};
const LARGE = [
  [-24, -24, 0.79],
  [21, -29, 0.83],
  [-36, 12, 0.64],
  [37, 13, 0.65],
  [-23, 42, 0.69],
  [17, 44, 0.76],
];
const SMALL = [
  [-27, -27, 0.59],
  [0, -33, 0.58],
  [26, -22, 0.6],
  [-38, 4, 0.55],
  [38, 7, 0.58],
  [-30, 32, 0.6],
  [-4, 43, 0.61],
  [26, 34, 0.57],
];

/** Two complete candy compositions per resource, sharing the Christmas snow and decorations. */
export function CandyTile({
  uid,
  terrain,
  seed = 0,
  paid,
  style,
}: {
  uid: string;
  terrain: BaseTerrain;
  seed?: number;
  paid?: number;
  style?: CandyStyle;
}) {
  const votes = useContext(CandyChoices);
  if (terrain === 'desert') return <WinterTile uid={uid} terrain={terrain} seed={seed} paid={paid} />;
  const chosen = style ?? votes[terrain] ?? 'a';
  const [ground, shade] = GROUND[terrain];
  const positions = chosen === 'a' ? LARGE : SMALL;
  return (
    <TileFrame uid={uid} terrain={terrain}>
      <g data-candy-terrain={terrain} data-candy-style={chosen}>
        <path d="M-70-70H70V70H-70Z" fill={ground} />
        <path d="M-70-7Q-32-30 0-7T70-10V70H-70Z" fill="#f8fbff" />
        <path d="M-70 24Q-25-4 10 20T70 19V70H-70Z" fill={shade} opacity=".65" />
        <path d="M-70 26Q-25 0 10 23T70 22V70H-70Z" fill="#e9f2f6" />
        <path d="M-70 53Q-28 24 9 45T70 39V70H-70Z" fill="#fcfdff" />
        <path d="M-50 48Q-21 37 0 49M21-40l18 9M-42-20l9-4" fill="none" stroke={ground} strokeWidth="1.3" />
        {positions.map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <ellipse cx="1" cy="12" rx="19" ry="5" fill="#476776" opacity=".18" />
            {terrain === 'wood' ? (
              <Cane red={i === 3} paired={chosen === 'b'} />
            ) : terrain === 'wheat' ? (
              <Gumdrop
                color={i === 3 ? '#db6f85' : i === 5 && chosen === 'b' ? '#81b58b' : undefined}
                small={chosen === 'b'}
              />
            ) : (
              <Candy resource={terrain} style={chosen} />
            )}
          </g>
        ))}
        <LightString
          posts={[
            [-44, -36],
            [-20, -44],
            [5, -47],
            [29, -37],
            [44, -24],
          ]}
          sag={3}
          seed={seed}
        />
        <StillFlakes count={9} seed={seed} />
      </g>
    </TileFrame>
  );
}
