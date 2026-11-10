import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import type { GameView } from '../../../shared/types';
import { useFreshLog } from '../../hooks/useFreshLog';
import { DieFace } from './BoardEffects';

/** Where a fresh roll starts and where the board's middle is, relative to the dice's resting spot. */
interface Path {
  sx: number;
  sy: number;
  cx: number;
  cy: number;
}

/**
 * The dice, resting in the board's bottom-right corner and showing the last roll. A new roll
 * tumbles in from off the board, lands in the middle, then slides back to the corner.
 */
export default function BoardDice({ view }: { view: GameView }) {
  const fresh = useFreshLog(view.log);
  const roll = fresh.filter(e => e.event?.kind === 'roll' && e.turn === view.turn).at(-1);
  const root = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<Path | null>(null);
  useLayoutEffect(() => {
    const frame = root.current?.parentElement?.getBoundingClientRect();
    const own = root.current?.getBoundingClientRect();
    if (!roll || !frame || !own) return setPath(null);
    const angle = ((roll.id * 137.5) % 360) * (Math.PI / 180);
    const reach = Math.max(frame.width, frame.height) * 0.8;
    const cx = frame.left + frame.width / 2 - (own.left + own.width / 2);
    const cy = frame.top + frame.height / 2 - (own.top + own.height / 2);
    setPath({ cx, cy, sx: cx + Math.cos(angle) * reach, sy: cy + Math.sin(angle) * reach });
  }, [roll?.id]);
  if (!view.dice) return null;
  const [a, b] = view.dice;
  const style = path
    ? ({
        '--sx': `${path.sx}px`,
        '--sy': `${path.sy}px`,
        '--cx': `${path.cx}px`,
        '--cy': `${path.cy}px`,
      } as CSSProperties)
    : undefined;
  return (
    <div
      ref={root}
      key={roll?.id ?? 'resting'}
      className={`board-dice${path ? ' rolling' : ''}`}
      style={style}
      role="img"
      aria-label={`Dice: ${a} and ${b}, total ${a + b}`}
    >
      {view.dice.map((value, i) => (
        <svg
          key={i}
          className="board-die"
          viewBox="-30 -30 60 60"
          style={{ '--spin': `${i ? -540 : 540}deg` } as CSSProperties}
        >
          <DieFace value={value} size={50} className="board-die-face" />
        </svg>
      ))}
    </div>
  );
}
