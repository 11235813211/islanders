import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import type { GameView } from '../../../shared/types';
import { sinceLatestRoll, useFreshLog } from '../../hooks/useFreshLog';
import { DieFace } from './BoardEffects';

/** Where a fresh roll starts and where the board's middle is, relative to the dice's resting spot. */
interface Path {
  /** The roll this path was measured for. */
  id: number;
  sx: number;
  sy: number;
  cx: number;
  cy: number;
}

/**
 * The dice, resting in the board's bottom-right corner and showing the last roll. A new roll
 * tumbles in from off the board, lands in the middle, then slides back to the corner. A roll
 * always plays out, even when the turn ends during it (a quick bot clears the dice).
 */
export default function BoardDice({ view }: { view: GameView }) {
  const first = sinceLatestRoll(useFreshLog(view.log))[0];
  const roll = first?.event?.kind === 'roll' ? { id: first.id, dice: first.event.dice } : null;
  const root = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<Path | null>(null);
  const [settled, setSettled] = useState<number | null>(null);
  const dice = view.dice ?? (roll && settled !== roll.id ? roll.dice : null);
  // Measured from layout (offsets), never from the screen box: a previous roll's tumble may still
  // be moving the dice, and measuring that would send the new roll somewhere off the board.
  useLayoutEffect(() => {
    const own = root.current;
    const frame = own?.offsetParent;
    if (!roll || !own || !(frame instanceof HTMLElement)) return setPath(null);
    const angle = ((roll.id * 137.5) % 360) * (Math.PI / 180);
    const reach = Math.max(frame.clientWidth, frame.clientHeight) * 0.8;
    const cx = frame.clientWidth / 2 - (own.offsetLeft + own.offsetWidth / 2);
    const cy = frame.clientHeight / 2 - (own.offsetTop + own.offsetHeight / 2);
    setPath({ id: roll.id, cx, cy, sx: cx + Math.cos(angle) * reach, sy: cy + Math.sin(angle) * reach });
  }, [roll?.id]);
  // Only a path measured for this roll animates it (never the last roll's, for a frame).
  const tumble = path && path.id === roll?.id ? path : null;
  if (!dice) return null;
  const [a, b] = dice;
  const style = tumble
    ? ({
        '--sx': `${tumble.sx}px`,
        '--sy': `${tumble.sy}px`,
        '--cx': `${tumble.cx}px`,
        '--cy': `${tumble.cy}px`,
      } as CSSProperties)
    : undefined;
  return (
    <div
      ref={root}
      key={roll?.id ?? 'resting'}
      className={`board-dice${tumble ? ' rolling' : ''}`}
      style={style}
      role="img"
      aria-label={`Dice: ${a} and ${b}, total ${a + b}`}
      onAnimationEnd={event => event.target === event.currentTarget && roll && setSettled(roll.id)}
    >
      {dice.map((value, i) => (
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
