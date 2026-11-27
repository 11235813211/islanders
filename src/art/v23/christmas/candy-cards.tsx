// Christmas Candy cards: each standard resource's card face and small icon show its sweet, the
// same drawings as on the candy tiles and the train's flatcars (candies.tsx).
import type { ReactElement } from 'react';
import type { ClassicResource } from '../../../../shared/types';
import { Cane, Floss, Gumdrop, Kiss } from './candies';
import { TwizzlerBunch } from './twizzlers';

/** A sweet placed on a card face, in card units (viewBox 0–100). */
type Placed = { x: number; y: number; scale: number; node: ReactElement };

const at = (x: number, y: number, scale: number, node: ReactElement): Placed => ({ x, y, scale, node });

/** Three of each sweet, the middle one largest, standing on a snowy strip. */
const FACES: Record<ClassicResource, Placed[]> = {
  wood: [at(26, 74, 1.15, <Cane />), at(74, 74, 1.15, <Cane red />), at(50, 70, 1.6, <Cane paired />)],
  brick: [
    at(26, 76, 1.05, <TwizzlerBunch count={2} lean={-14} />),
    at(74, 76, 1.05, <TwizzlerBunch count={3} lean={12} />),
    at(50, 72, 1.35, <TwizzlerBunch count={4} />),
  ],
  sheep: [at(27, 52, 0.95, <Floss />), at(73, 48, 0.9, <Floss />), at(50, 72, 1.4, <Floss />)],
  wheat: [
    at(26, 76, 1.05, <Gumdrop color="#e2475b" />),
    at(74, 76, 1.05, <Gumdrop color="#3faa63" />),
    at(50, 72, 1.45, <Gumdrop />),
  ],
  ore: [at(25, 76, 1.05, <Kiss />), at(75, 76, 1.05, <Kiss />), at(50, 72, 1.5, <Kiss snowy />)],
};

/** The large illustration in the middle of a candy resource card. */
export function CandyCardArt({ resource }: { resource: ClassicResource }) {
  return (
    <svg className="cards-art" viewBox="0 0 100 100" aria-hidden="true" data-candy-card={resource}>
      <path d="M6 80Q40 70 94 78V94H6Z" fill="#ffffff" />
      <path d="M6 86Q48 79 94 86V94H6Z" fill="#e4eef4" />
      {FACES[resource].map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y}) scale(${p.scale})`}>
          {p.node}
        </g>
      ))}
    </svg>
  );
}

/** Each sweet's box in its own units, so the icon frames it (they are drawn about their base). */
const ICON_BOX: Record<ClassicResource, string> = {
  wood: '-22 -32 40 40',
  brick: '-17 -36 34 48',
  sheep: '-26 -32 50 46',
  wheat: '-20 -28 40 40',
  ore: '-22 -28 44 44',
};

/** A candy resource's small icon (card corners, the bank, logs). */
export function CandyIcon({ resource, size = 22 }: { resource: ClassicResource; size?: number }) {
  const node = {
    wood: <Cane paired />,
    brick: <TwizzlerBunch count={3} />,
    sheep: <Floss />,
    wheat: <Gumdrop />,
    ore: <Kiss />,
  }[resource];
  return (
    <svg
      width={size}
      height={size}
      viewBox={ICON_BOX[resource]}
      aria-hidden="true"
      className="resource-icon"
      data-candy-icon={resource}
    >
      {node}
    </svg>
  );
}
